import { NextResponse } from "next/server";
import { acquireProcessingLock, completeTranscript, getTranscript, releaseProcessingLock, TRANSCRIPT_VERSION } from "../shared-cache";
import { parseManualSubtitleText } from "./parser";

const ADMIN_COOKIE = "greektube-admin";
const SESSION_MESSAGE = "greektube-edit-authorized";

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

export async function POST(request: Request) {
  if (!await authorized(request)) return NextResponse.json({ error: "Η εισαγωγή μετάφρασης απαιτεί εξουσιοδότηση διαχειριστή." }, { status: 401 });
  let lockToken: string | null = null;
  let videoId: string | null = null;
  try {
    const body = await request.json() as { url?: unknown; title?: unknown; originalTitle?: unknown; channel?: unknown; duration?: unknown; subtitleText?: unknown; strict?: unknown };
    if (typeof body.url !== "string" || typeof body.subtitleText !== "string") return NextResponse.json({ error: "Λείπει το βίντεο ή το κείμενο υποτίτλων." }, { status: 400 });
    if (body.subtitleText.length > 2_000_000) return NextResponse.json({ error: "Το αρχείο υποτίτλων είναι υπερβολικά μεγάλο." }, { status: 413 });
    videoId = videoIdFrom(body.url);
    if (!videoId) return NextResponse.json({ error: "Δεν αναγνωρίζω αυτό το YouTube link." }, { status: 400 });
    const strict = body.strict === true;

    const cues = parseManualSubtitleText(body.subtitleText);
    if (cues.length < 3) return NextResponse.json({ error: "Δεν βρέθηκαν αρκετά έγκυρα timed cues. Χρησιμοποίησε SRT, VTT ή transcript με timestamps." }, { status: 400 });
    const combined = cues.slice(0, 150).map(cue => cue.text).join(" ");
    if (greekRatio(combined) < 0.2) return NextResponse.json({ error: "Το SRT δεν φαίνεται να περιέχει ελληνικό κείμενο. Έλεγξε ότι ανέβασες τη μεταφρασμένη έκδοση." }, { status: 400 });
    const ordered = cues.every((cue, index) => cue.start >= 0 && cue.duration > 0 && (index === 0 || cue.start >= cues[index - 1].start));
    if (!ordered) return NextResponse.json({ error: "Τα timestamps δεν είναι σε σωστή σειρά." }, { status: 400 });

    const existing = await getTranscript(videoId);
    const existingEnglish = (existing?.englishTranscript?.length ? existing.englishTranscript : existing?.rawEnglishTranscript || []) as { start: number; duration: number; text: string }[];

    if (strict) {
      if (!existingEnglish.length) return NextResponse.json({ error: "Δεν υπάρχει αγγλικό transcript για σύγκριση. Κάνε πρώτα λήψη του αγγλικού SRT από αυτή τη οθόνη." }, { status: 409 });
      if (cues.length !== existingEnglish.length) return NextResponse.json({ error: `Ο αριθμός των υποτίτλων δεν ταιριάζει: το ελληνικό SRT έχει ${cues.length} cues, το αγγλικό έχει ${existingEnglish.length}. Μην προσθέσεις, αφαιρέσεις ή ενώσεις γραμμές — μετάφρασε γραμμή προς γραμμή.` }, { status: 400 });
      const TOLERANCE = 0.002;
      for (let index = 0; index < cues.length; index += 1) {
        const a = cues[index];
        const b = existingEnglish[index];
        if (Math.abs(a.start - b.start) > TOLERANCE || Math.abs(a.duration - b.duration) > TOLERANCE) {
          return NextResponse.json({ error: `Το cue #${index + 1} έχει διαφορετικό timestamp από το αγγλικό πρωτότυπο. Μην αλλάξεις ή αναδιατάξεις τα timestamps — κράτησέ τα ακριβώς όπως στο κατεβασμένο SRT.` }, { status: 400 });
        }
      }
    }

    lockToken = crypto.randomUUID();
    if (!await acquireProcessingLock(videoId, lockToken, true)) return NextResponse.json({ error: "Το βίντεο επεξεργάζεται ήδη. Δοκίμασε ξανά σε λίγο." }, { status: 409 });

    const now = new Date().toISOString();
    const suppliedDuration = Number(body.duration || 0);
    const cueDuration = cues.reduce((max, cue) => Math.max(max, cue.start + cue.duration), 0);
    const duration = Number.isFinite(suppliedDuration) && suppliedDuration > 0 ? Math.max(suppliedDuration, cueDuration) : cueDuration;
    const alignedEnglish = existingEnglish.length === cues.length && existingEnglish.every((cue, index) => Math.abs(cue.start - cues[index].start) < 0.15) ? existingEnglish : [];
    const points = keyPoints(cues);
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : (existing?.title || "YouTube video");
    const channel = typeof body.channel === "string" && body.channel.trim() ? body.channel.trim() : (existing?.channel || "YouTube");

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

    return NextResponse.json({
      status: "ready", progress: 100, videoId, title,
      originalTitle: typeof body.originalTitle === "string" ? body.originalTitle : "",
      channel, duration, sourceLanguage: "en", cues, englishCues: alignedEnglish,
      keyPoints: points, topics: record.topics, transcriptVersion: TRANSCRIPT_VERSION,
      translationMethod: "manual_chatgpt_pro_v1", cached: false,
    });
  } catch (error) {
    if (videoId && lockToken) await releaseProcessingLock(videoId, lockToken).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Η εισαγωγή της μετάφρασης απέτυχε." }, { status: 500 });
  }
}
