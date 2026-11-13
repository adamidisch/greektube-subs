import { verifyAdminSession } from "@/lib/admin-auth";
import { WORD_TRANSLATION_PROMPT, parseWordPhrases, authorWordPhrases, type WordAuthoringPacket } from "../captions/word-authoring";
import { withApprovedEquivalents } from "../captions/glossary-terms";
import type { TranslationGlossaryEntry } from "../captions/translation-understanding";
import { foundationSubtitleJson, WordAuthoringProviderError, type SubtitleModel } from "../captions/word-authoring-provider";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Body = {
  words: [text: string, cueIndex: number, startMs: number, endMs: number, globalIndex: number][];
  nextWordStartMs: number;
  brief: { mainTopic: string; glossary?: TranslationGlossaryEntry[] };
  context?: { precedingEnglish?: string; followingEnglish?: string };
  model?: SubtitleModel;
};

/**
 * Owner-only model comparison: translates ONE bounded word scope through Platform Foundation
 * and lays it out with the production timing algorithm. Never writes drafts, Blob, database
 * rows or published subtitles.
 */
export async function POST(request: Request) {
  const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "Μη έγκυρη προέλευση." }, 403);
  if (!await verifyAdminSession(request)) return json({ error: "Απαιτείται εξουσιοδότηση διαχειριστή." }, 401);
  const raw = await request.text();
  if (raw.length > 60_000) return json({ error: "Πολύ μεγάλο αίτημα." }, 413);
  let body: Body;
  try { body = JSON.parse(raw) as Body; } catch { return json({ error: "Μη έγκυρο αίτημα." }, 400); }
  const words = Array.isArray(body.words) ? body.words : [];
  if (!words.length || words.length > 200 || typeof body.brief?.mainTopic !== "string" || !body.brief.mainTopic.trim()
    || words.some(w => !Array.isArray(w) || typeof w[0] !== "string" || ![w[1], w[2], w[3], w[4]].every(Number.isSafeInteger) || w[3] <= w[2])
    || !Number.isSafeInteger(body.nextWordStartMs))
    return json({ error: "Μη έγκυρο κομμάτι λέξεων." }, 400);
  const model: SubtitleModel = body.model === "deepseek-v4-pro" ? "deepseek-v4-pro" : "deepseek-flash";
  const packet: WordAuthoringPacket = {
    schemaVersion: 1, sourceHash: "pilot", translationHash: "pilot", audioSha256: "pilot", wordTimelineHash: "pilot",
    sourceCueRange: [words[0][1], words.at(-1)![1]],
    globalBrief: { mainTopic: body.brief.mainTopic, glossary: withApprovedEquivalents(Array.isArray(body.brief.glossary) ? body.brief.glossary : []) },
    readOnlyContext: { precedingEnglish: String(body.context?.precedingEnglish || "").slice(0, 2000), followingEnglish: String(body.context?.followingEnglish || "").slice(0, 2000) },
    sourceText: words.map(w => w[0]).join(" "), existingGreek: "",
    words: words.map(w => ({ wordId: `W${String(w[4] + 1).padStart(6, "0")}`, cueIndex: w[1], text: w[0], startMs: w[2], endMs: w[3] })),
    nextWordStartMs: body.nextWordStartMs,
  };
  const started = Date.now();
  let proposed: unknown;
  try { proposed = await foundationSubtitleJson(WORD_TRANSLATION_PROMPT, packet, { maxTokens: 4000, model }); }
  catch (error) {
    return json({ error: "Ο πάροχος δεν απάντησε.", providerStatus: error instanceof WordAuthoringProviderError ? error.status : 502, model }, 502);
  }
  const rounds: { issue: string; overBudget: number }[] = [];
  for (let round = 0; ; round++) {
    let issue = "";
    try {
      const phrases = parseWordPhrases(proposed, packet);
      const events = authorWordPhrases(packet, phrases);
      return json({ ok: true, model, seconds: (Date.now() - started) / 1000, repairRounds: round, rounds, phrases, events });
    } catch (error) { issue = error instanceof Error ? error.message : "Αποτυχία"; }
    const repairs = phraseBudgets(packet, proposed);
    rounds.push({ issue, overBudget: repairs.filter(r => r.overBy > 0).length });
    if (round >= MAX_REPAIR_ROUNDS || Date.now() - started > 40_000)
      return json({ ok: false, model, seconds: (Date.now() - started) / 1000, repairRounds: round, rounds, issue, proposed });
    try {
      proposed = await foundationSubtitleJson(BUDGET_REPAIR_PROMPT, { globalBrief: packet.globalBrief, issue,
        phrases: repairs.map(({ firstWordId, lastWordId, english, text, maxChars, hardBreakBefore }) => ({ firstWordId, lastWordId, english, text, maxChars, hardBreakBefore })) },
        { maxTokens: 4000, model });
    } catch (error) {
      return json({ error: "Ο πάροχος δεν απάντησε.", providerStatus: error instanceof WordAuthoringProviderError ? error.status : 502, model, rounds }, 502);
    }
  }
}

const MAX_REPAIR_ROUNDS = 2;
/** Reading-speed target used for per-phrase budgets; the hard gate stays at 17 CPS. */
const BUDGET_CPS = 15.5;
const BUDGET_REPAIR_PROMPT = `You are the GreekTube subtitle editor. Each item is one Greek subtitle phrase mapped to fixed
English source words (firstWordId..lastWordId) with a hard maximum length maxChars derived from the real speech timing.
Rewrite every phrase whose text is longer than maxChars so it fits, and also fix any listed issue. Keep the complete
meaning: negation, hedging, numbers, units, names, attribution and causality. Never strengthen medical claims.
Prefer natural spoken modern Greek, drop filler and repetition, use shorter synonyms and approved glossary
alternates. Keep firstWordId, lastWordId and hardBreakBefore exactly as given and keep the same order; do not merge
or split items. Phrases already within maxChars may stay unchanged. No comma before και or ή. All-uppercase Greek has no tonos.
Return JSON only: {"phrases":[{"firstWordId":"...","lastWordId":"...","text":"...","hardBreakBefore":false}]}.`;

type Proposed = { phrases?: { firstWordId?: unknown; lastWordId?: unknown; text?: unknown; hardBreakBefore?: unknown }[] };
function phraseBudgets(packet: WordAuthoringPacket, proposed: unknown) {
  const index = new Map(packet.words.map((word, i) => [word.wordId, i]));
  const phrases = Array.isArray((proposed as Proposed)?.phrases) ? (proposed as Proposed).phrases! : [];
  return phrases.flatMap(item => {
    const first = index.get(String(item?.firstWordId)), last = index.get(String(item?.lastWordId));
    if (first === undefined || last === undefined || last < first) return [];
    const nextStart = packet.words[last + 1]?.startMs ?? packet.nextWordStartMs;
    const seconds = Math.max(0.5, (Math.min(packet.words[last].endMs + 250, nextStart) - packet.words[first].startMs) / 1000);
    const text = String(item.text || "");
    const maxChars = Math.max(8, Math.floor(seconds * BUDGET_CPS));
    return [{ firstWordId: String(item.firstWordId), lastWordId: String(item.lastWordId), hardBreakBefore: item.hardBreakBefore === true,
      english: packet.words.slice(first, last + 1).map(word => word.text).join(" "), text, maxChars, overBy: Array.from(text).length - maxChars }];
  });
}
