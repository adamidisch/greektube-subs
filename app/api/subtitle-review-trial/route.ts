import { createHash } from "node:crypto";
import { safeEqual } from "@/lib/admin-auth";
import { FINAL_SUBTITLE_REVIEW_PROMPT, finalCandidateHash, finalReviewEvents, validateFinalReview } from "../captions/final-subtitle-review";
import { wordAuthoringJson, WordAuthoringProviderError } from "../captions/word-authoring-provider";
import type { SubtitleEvent } from "@/app/subtitle-track";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const completed = new Map<string, Promise<unknown>>();
const sourceText = "and the adrenal gearbox, which allows you to gear up in response to stress.";

/** Fixed, expiring preview experiment. No database, Blob, transcript or publication writes. */
export async function POST(request: Request) {
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
  if (process.env.VERCEL_ENV !== "preview") return json({ error: "Preview only" }, 404);
  let access: { token?: string; expiresAt?: number };
  try { access = JSON.parse(process.env.SUBTITLE_PREVIEW_TRIAL_ACCESS || "{}"); }
  catch { return json({ error: "Trial disabled" }, 403); }
  if (!access.token || access.token.length !== 64 || !Number.isFinite(access.expiresAt) || access.expiresAt! <= Date.now())
    return json({ error: "Trial disabled or expired" }, 403);
  if (!safeEqual(request.headers.get("authorization") || "", `Bearer ${access.token}`)) return json({ error: "Unauthorized" }, 401);
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "Invalid origin" }, 403);
  const raw = await request.text();
  if (raw.length > 100) return json({ error: "Invalid trial" }, 400);
  let candidate: string;
  try { candidate = JSON.parse(raw).candidate; } catch { return json({ error: "Invalid trial" }, 400); }
  if (!["ambiguous", "complete"].includes(candidate)) return json({ error: "Unknown fixed candidate" }, 400);
  if (!completed.has(candidate)) completed.set(candidate, (async () => {
    const words = sourceText.split(/\s+/u).map((text, i) => ({ wordId: `W${String(i + 1).padStart(6, "0")}`, cueIndex: 21, text }));
    const events: SubtitleEvent[] = [{ start: 134.881, duration: 5.139, sourceIndices: [21], sourceWordRange: [0, words.length - 1], timing: "estimated",
      text: candidate === "complete" ? "Τα επινεφρίδια: «κιβώτιο ταχυτήτων»\nγια να ανεβάζετε ταχύτητα στο στρες." : "Τα επινεφρίδια: «κιβώτιο»\nγια να ανεβάζετε ταχύτητα στο στρες." }];
    const contextKey = createHash("sha256").update(`sarah-source-cue-21-trial-v1:${sourceText}`).digest("hex");
    const candidateHash = finalCandidateHash(contextKey, events);
    const review = await wordAuthoringJson(FINAL_SUBTITLE_REVIEW_PROMPT, { sourceText, words,
      globalBrief: { mainTopic: "The speaker explains fatigue using a car analogy for the body and its energy supply.", glossary: [] },
      readOnlyContext: { precedingEnglish: "But we also need the thyroid accelerator pedal, and that determines how fast your mitochondrial engine goes,", followingEnglish: "And I think we're talking about the thyroid accelerator pedal today, so that symptom could be very typical" },
      candidateHash, finalEvents: finalReviewEvents(events) }, { maxTokens: 1600 });
    let accepted = false, validationIssue = "";
    try { validateFinalReview(review, contextKey, events, words.map(w => w.wordId)); accepted = true; }
    catch (error) { validationIssue = error instanceof Error ? error.message : "Validation failed"; }
    return { fixture: "sarah-source-cue-21-trial-v1", candidateHash, events, review, accepted, validationIssue, humanAudioReview: false };
  })());
  try { return json(await completed.get(candidate)); }
  catch (error) {
    return json({ error: "Provider trial stopped; no automatic retry", providerStatus: error instanceof WordAuthoringProviderError ? error.status : 502,
      retryAfterSeconds: error instanceof WordAuthoringProviderError ? error.retryAfterSeconds : 30 }, 502);
  }
}
