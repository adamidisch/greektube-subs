import { acquireProcessingLock, completeTranscript, getTranscript, releaseProcessingLock, TRANSCRIPT_VERSION } from "../../shared-cache";
import { hasValidManualCueTimings, parseManualSubtitleText } from "../parser";

const ADMIN_COOKIE = "greektube-admin";
const SESSION_MESSAGE = "greektube-edit-authorized";

type ImportBody = {
  url?: unknown;
  title?: unknown;
  originalTitle?: unknown;
  channel?: unknown;
  duration?: unknown;
  subtitleText?: unknown;
};

type ProgressUpdate = {
  progress: number;
  label: string;
  detail: string;
  currentCue?: number;
  totalCues?: number;
};

class ManualImportError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

async function sessionToken(password: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(SESSION_MESSAGE));
  return Array.from(new Uint8Array(signature)).map(value => value.toString(16).padStart(2, "0")).join("");
}

function safeEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

async function authorized(request: Request) {
  const password = String(process.env.ADMIN_EDIT_PASSWORD || "");
  if (!password) return false;
  const cookie = request.headers.get("cookie")?.split(";").map(value => value.trim()).find(value => value.startsWith(`${ADMIN_COOKIE}=`))?.slice(ADMIN_COOKIE.length + 1) || "";
  return safeEqual(cookie, await sessionToken(password));
}

function videoIdFrom(value: string) {
  const trimmed = value.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.hostname.replace(/^www\./, "") === "youtu.be") return url.pathname.split("/")[1] || null;
    return url.searchParams.get("v");
  } catch { return null; }
}

function greekRatio(text: string) {
  const letters = text.match(/\p{L}/gu)?.length || 0;
  const greek = text.match(/[\u0370-\u03ff\u1f00-\u1fff]/g)?.length || 0;
  return letters ? greek / letters : 0;
}

function keyPoints(cues: { text: string }[]) {
  const step = Math.max(1, Math.floor(cues.length / 10));
  return cues.filter((_, index) => index % step === 0).map(cue => cue.text.replace(/\s+/g, " ").trim()).filter((text, index, all) => text.length > 18 && all.indexOf(text) === index).slice(0, 10);
}

function failure(error: unknown) {
  return {
    type: "error",
    error: error instanceof Error ? error.message : "Η εισαγωγή της μετάφρασης απέτυχε.",
    status: error instanceof ManualImportError ? error.status : 500,
  };
}

export async function POST(request: Request) {
  if (!await authorized(request)) return Response.json({ error: "Η εισαγωγή μετάφρασης απαιτεί εξουσιοδότηση διαχειριστή." }, { status: 401 });

  let body: ImportBody;
  try {
    body = await request.json() as ImportBody;
  } catch {
    return Response.json({ error: "Το αρχείο δεν μπόρεσε να διαβαστεί." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (payload: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      const report = (update: ProgressUpdate) => send({ type: "progress", ...update });
      void (async () => {
        let lockToken: string | null = null;
        let videoId: string | null = null;
        try {
          if (typeof body.url !== "string" || typeof body.subtitleText !== "string") throw new ManualImportError("Λείπει το βίντεο ή το κείμενο υποτίτλων.");
          if (body.subtitleText.length > 2_000_000) throw new ManualImportError("Το αρχείο υποτίτλων είναι υπερβολικά μεγάλο.", 413);
          videoId = videoIdFrom(body.url);
          if (!videoId) throw new ManualImportError("Δεν αναγνωρίζω αυτό το YouTube link.");

          report({ progress: 12, label: "Ανάλυση ελληνικού SRT", detail: "Ελέγχουμε τη μορφή και τους χρονισμούς του αρχείου." });
          const cues = parseManualSubtitleText(body.subtitleText);
          if (cues.length < 3) throw new ManualImportError("Δεν βρέθηκαν αρκετά έγκυρα timed cues. Χρησιμοποίησε SRT, VTT ή transcript με timestamps.");
          report({ progress: 24, label: "Έλεγχος ελληνικού κειμένου", detail: `Αναγνωρίστηκαν ${cues.length.toLocaleString("el-GR")} cues.`, currentCue: 0, totalCues: cues.length });

          const combined = cues.slice(0, 150).map(cue => cue.text).join(" ");
          if (greekRatio(combined) < 0.2) throw new ManualImportError("Το SRT δεν φαίνεται να περιέχει ελληνικό κείμενο. Έλεγξε ότι ανέβασες τη μεταφρασμένη έκδοση.");
          if (!hasValidManualCueTimings(cues)) throw new ManualImportError("Το αρχείο περιέχει μη έγκυρα timestamps.");

          report({ progress: 34, label: "Φόρτωση αγγλικού πρωτοτύπου", detail: "Ανακτούμε το αρχικό transcript για ακριβή σύγκριση.", currentCue: 0, totalCues: cues.length });
          const existing = await getTranscript(videoId);
          const existingEnglish = (existing?.englishTranscript?.length ? existing.englishTranscript : existing?.rawEnglishTranscript || []) as { start: number; duration: number; text: string }[];
          if (!existingEnglish.length) throw new ManualImportError("Δεν υπάρχει αγγλικό transcript για σύγκριση. Κάνε πρώτα λήψη του αγγλικού SRT από αυτή την οθόνη.", 409);
          if (cues.length !== existingEnglish.length) throw new ManualImportError(`Ο αριθμός των υποτίτλων δεν ταιριάζει: το ελληνικό SRT έχει ${cues.length} cues, το αγγλικό έχει ${existingEnglish.length}. Μην προσθέσεις, αφαιρέσεις ή ενώσεις γραμμές — μετάφρασε γραμμή προς γραμμή.`);

          const tolerance = 0.002;
          const reportEvery = Math.max(1, Math.floor(cues.length / 60));
          for (let index = 0; index < cues.length; index += 1) {
            const greekCue = cues[index];
            const englishCue = existingEnglish[index];
            if (Math.abs(greekCue.start - englishCue.start) > tolerance || Math.abs(greekCue.duration - englishCue.duration) > tolerance) {
              throw new ManualImportError(`Το cue #${index + 1} έχει διαφορετικό timestamp από το αγγλικό πρωτότυπο. Μην αλλάξεις ή αναδιατάξεις τα timestamps — κράτησέ τα ακριβώς όπως στο κατεβασμένο SRT.`);
            }
            if (index === cues.length - 1 || index % reportEvery === 0) {
              const completed = index + 1;
              report({
                progress: 40 + (completed / cues.length) * 40,
                label: "Σύγκριση cues και timestamps",
                detail: "Επιβεβαιώνουμε ένα προς ένα ότι η αρίθμηση και οι χρονισμοί δεν άλλαξαν.",
                currentCue: completed,
                totalCues: cues.length,
              });
            }
          }

          report({ progress: 84, label: "Προετοιμασία αποθήκευσης", detail: "Όλοι οι έλεγχοι πέρασαν. Κλειδώνουμε την ασφαλή εγγραφή.", currentCue: cues.length, totalCues: cues.length });
          lockToken = crypto.randomUUID();
          if (!await acquireProcessingLock(videoId, lockToken, true)) throw new ManualImportError("Το βίντεο επεξεργάζεται ήδη. Δοκίμασε ξανά σε λίγο.", 409);

          const now = new Date().toISOString();
          const suppliedDuration = Number(body.duration || 0);
          const cueDuration = cues.reduce((max, cue) => Math.max(max, cue.start + cue.duration), 0);
          const duration = Number.isFinite(suppliedDuration) && suppliedDuration > 0 ? Math.max(suppliedDuration, cueDuration) : cueDuration;
          const alignedEnglish = existingEnglish.every((cue, index) => Math.abs(cue.start - cues[index].start) < 0.15) ? existingEnglish : [];
          const points = keyPoints(cues);
          const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : (existing?.title || "YouTube video");
          const channel = typeof body.channel === "string" && body.channel.trim() ? body.channel.trim() : (existing?.channel || "YouTube");

          report({ progress: 91, label: "Αποθήκευση ελληνικών υποτίτλων", detail: "Γράφουμε το ελεγμένο SRT στη βιβλιοθήκη.", currentCue: cues.length, totalCues: cues.length });
          const record = {
            videoId,
            title,
            channel,
            thumbnail: existing?.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            duration,
            originalLanguage: "en",
            rawEnglishTranscript: existing?.rawEnglishTranscript || [],
            englishTranscript: alignedEnglish,
            greekTranscript: cues,
            timestamps: cues.map(cue => ({ start: cue.start, duration: cue.duration })),
            topics: existing?.topics || [],
            keyPoints: points,
            status: "ready" as const,
            progress: 100,
            transcriptVersion: TRANSCRIPT_VERSION,
            createdAt: existing?.createdAt || now,
            updatedAt: now,
          };
          if (!await completeTranscript(record, lockToken)) throw new Error("Η αποθήκευση της μετάφρασης δεν ολοκληρώθηκε.");
          lockToken = null;

          report({ progress: 98, label: "Ολοκλήρωση εισαγωγής", detail: "Οι υπότιτλοι αποθηκεύτηκαν. Ανοίγουμε το video.", currentCue: cues.length, totalCues: cues.length });
          send({
            type: "complete",
            progress: 100,
            result: {
              status: "ready", progress: 100, videoId, title,
              originalTitle: typeof body.originalTitle === "string" ? body.originalTitle : "",
              channel, duration, sourceLanguage: "en", cues, englishCues: alignedEnglish,
              keyPoints: points, topics: record.topics, transcriptVersion: TRANSCRIPT_VERSION,
              translationMethod: "manual_chatgpt_pro_v1", cached: false,
            },
          });
        } catch (error) {
          if (videoId && lockToken) await releaseProcessingLock(videoId, lockToken).catch(() => undefined);
          send(failure(error));
        } finally {
          controller.close();
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
