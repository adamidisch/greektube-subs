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
  const seconds = (Date.now() - started) / 1000;
  try {
    const phrases = parseWordPhrases(proposed, packet);
    const events = authorWordPhrases(packet, phrases);
    return json({ ok: true, model, seconds, phrases, events });
  } catch (error) {
    return json({ ok: false, model, seconds, issue: error instanceof Error ? error.message : "Αποτυχία", proposed });
  }
}
