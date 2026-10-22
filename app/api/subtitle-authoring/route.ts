import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import { database } from "@/db/postgres";
import { verifyAdminSession } from "@/lib/admin-auth";
import { type TimedCue } from "@/app/subtitle-track";
import { type SubtitleAudioEvidence } from "@/app/subtitle-audio-evidence";
import { getTranscript, TRANSCRIPT_VERSION } from "../shared-cache";
import { readPublishedTranscript } from "../transcript-blob";
import { subtitleContentHash } from "../subtitle-track";
import { readSubtitleDraft, saveSubtitleDraft } from "../subtitle-track-store";
import { readTranslationUnderstanding, compactUnderstandingForPrompt } from "../captions/translation-understanding";
import { advanceWordAuthoring, assembleWordAuthoring, buildWordAuthoringPacket, wordAuthoringKey, planWordAuthoring,
  wordSemanticKey, reusableWordSemantics, type WordSemanticCheckpoint,
  type WordAuthoringCheckpoint, type WordAuthoringResult } from "../captions/word-authoring";
import { wordAuthoringJson, WordAuthoringProviderError } from "../captions/word-authoring-provider";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
type Body = { videoId: string; action: "plan" | "advance" | "assemble"; sourceHash: string; translationHash: string;
  audioEvidence: SubtitleAudioEvidence; sourceCueRange?: [number, number]; scopes?: { range: [number, number]; key: string }[] };

/** Explicit authenticated calls only: no queue, polling, automatic continuation or publication. */
export async function POST(request: Request) {
  const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
    NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store", ...headers } });
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin)
    return json({ error: "Μη έγκυρη προέλευση." }, 403);
  if (!await verifyAdminSession(request)) return json({ error: "Απαιτείται εξουσιοδότηση διαχειριστή." }, 401);
  if (process.env.VERCEL_ENV === "preview") return json({ error: "Η επεξεργασία υποτίτλων είναι απενεργοποιημένη στο preview." }, 409);
  let lockedVideo = "", token = "";
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 4_000_000) return json({ error: "Το αρχείο χρονισμού είναι πολύ μεγάλο." }, 413);
    const body = JSON.parse(raw) as Body;
    if (!body || typeof body.videoId !== "string" || !/^[\w-]{11}$/u.test(body.videoId) || !["plan", "advance", "assemble"].includes(body.action))
      return json({ error: "Μη έγκυρη ενέργεια." }, 400);
    if (![body.sourceHash, body.translationHash].every(value => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value))
      || !body.audioEvidence || typeof body.audioEvidence !== "object") return json({ error: "Χρειάζεται έγκυρη αναφορά πηγής και χρονισμού." }, 400);
    const validRange = (value: unknown) => Array.isArray(value) && value.length === 2 && value.every(Number.isInteger) && value[0] >= 0 && value[1] >= value[0];
    if (body.action === "advance" && !validRange(body.sourceCueRange)) return json({ error: "Μη έγκυρο τμήμα υποτίτλων." }, 400);
    if (body.action === "assemble" && (!Array.isArray(body.scopes) || !body.scopes.length || body.scopes.length > 30_000
      || body.scopes.some(scope => !scope || !validRange(scope.range) || typeof scope.key !== "string" || !/^[a-f0-9]{64}$/u.test(scope.key))))
      return json({ error: "Μη έγκυρη λίστα τμημάτων." }, 400);
    const videoId = body.videoId;
    token = randomUUID();
    const now = new Date().toISOString(), expires = new Date(Date.now() + 180_000).toISOString();
    const locked = await database().query("UPDATE video_transcripts SET lock_token=$1,lock_expires_at=$2 WHERE video_id=$3 AND status='ready' AND (lock_token IS NULL OR lock_expires_at IS NULL OR lock_expires_at<$4) RETURNING video_id", [token, expires, videoId, now]) as { video_id: string }[];
    if (locked.length !== 1) return json({ error: "Η μεταγραφή ενημερώνεται ήδη ή δεν είναι έτοιμη." }, 409);
    lockedVideo = videoId;
    const record = await getTranscript(videoId);
    const published = await readPublishedTranscript(videoId, TRANSCRIPT_VERSION, true);
    const source = (published?.englishCues ?? record?.englishTranscript ?? []) as TimedCue[];
    const translation = (published?.cues ?? record?.greekTranscript ?? []) as TimedCue[];
    if (!source.length || body.sourceHash !== subtitleContentHash(source) || body.translationHash !== subtitleContentHash(translation))
      return json({ error: "Η πηγή ή η μετάφραση άλλαξε. Φόρτωσε ξανά." }, 409);
    // Read-only reuse. A missing brief must not silently trigger whole-video model calls.
    const understanding = await readTranslationUnderstanding(videoId, TRANSCRIPT_VERSION, source);
    if (!understanding) return json({ error: "Χρειάζεται η συνολική ανάλυση του βίντεο πριν από την επιμέλεια." }, 409);
    const brief = JSON.parse(compactUnderstandingForPrompt(understanding)) as Record<string, unknown>;
    if (body.action === "plan") return json({ status: "planned", sourceHash: body.sourceHash, translationHash: body.translationHash,
      scopes: planWordAuthoring(source, translation, body.audioEvidence, brief), providerCalls: 0 });
    const pathFor = (key: string) => `subtitle-authoring/v1/${videoId}/${body.sourceHash}/${body.translationHash}/${key}.json`;
    const packetFor = (range: [number, number]) => buildWordAuthoringPacket(source, translation, body.audioEvidence, range, brief);
    if (body.action === "assemble") {
      if (!Array.isArray(body.scopes) || !body.scopes.length || body.scopes.length > source.length) throw Error("Invalid semantic scope list");
      const results: WordAuthoringResult[] = [];
      for (const scope of body.scopes) {
        const key = wordAuthoringKey(packetFor(scope.range));
        if (scope.key !== key) throw Error("Stale semantic scope");
        const saved = await readSubtitleDraft(pathFor(key)) as WordAuthoringCheckpoint | null;
        if (saved?.key !== key || !saved.result) throw Error("Semantic scope is not ready");
        results.push(saved.result);
      }
      const track = assembleWordAuthoring(source, translation, body.audioEvidence, results);
      const draft = await saveSubtitleDraft(videoId, source, translation, track.events, track.audioEvidence);
      return json({ status: "draft_ready", humanAudioReview: false, ...draft });
    }
    const packet = packetFor(body.sourceCueRange!), key = wordAuthoringKey(packet), path = pathFor(key);
    const semanticKey = wordSemanticKey(packet);
    const semanticPath = `subtitle-authoring/v1/${videoId}/${body.sourceHash}/${body.translationHash}/semantic-${semanticKey}.json`;
    const existing = await readSubtitleDraft(path) as WordAuthoringCheckpoint | null;
    const cache = existing ?? reusableWordSemantics(packet, await readSubtitleDraft(semanticPath) as WordSemanticCheckpoint | null);
    const checkpoint = async () => {
      await put(path, JSON.stringify(cache), { access: "public", contentType: "application/json", addRandomSuffix: false, allowOverwrite: true });
      await put(semanticPath, JSON.stringify({ key: semanticKey, proposed: cache.proposed, reviewed: cache.reviewed }),
        { access: "public", contentType: "application/json", addRandomSuffix: false, allowOverwrite: true });
    };
    const provider = async (system: string, input: unknown) => {
      const remaining = Math.ceil((Date.parse(record?.groqCooldownUntil || "") - Date.now()) / 1000);
      if (remaining > 0) throw new WordAuthoringProviderError(429, remaining);
      try { return await wordAuthoringJson(system, input); }
      catch (error) {
        if (error instanceof WordAuthoringProviderError && error.status === 429)
          await database().query("UPDATE video_transcripts SET groq_cooldown_until=$1 WHERE video_id=$2 AND lock_token=$3", [new Date(Date.now() + error.retryAfterSeconds * 1000).toISOString(), videoId, token]);
        throw error;
      }
    };
    const result = await advanceWordAuthoring(packet, cache, provider, checkpoint);
    return json({ ...result, key, sourceCueRange: packet.sourceCueRange });
  } catch (error) {
    if (error instanceof WordAuthoringProviderError) return json({ error: "Ο πάροχος μετάφρασης δεν είναι διαθέσιμος. Η επεξεργασία σταμάτησε." }, error.status === 429 ? 429 : 503, { "Retry-After": String(error.retryAfterSeconds) });
    return json({ error: error instanceof Error ? error.message : "Δεν ολοκληρώθηκε η επιμέλεια υποτίτλων." }, 422);
  } finally {
    if (lockedVideo) await database().query("UPDATE video_transcripts SET lock_token=NULL,lock_expires_at=NULL WHERE video_id=$1 AND lock_token=$2", [lockedVideo, token]).catch(() => undefined);
  }
}
