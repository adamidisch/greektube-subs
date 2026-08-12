import { numberTokensMatch } from "../captions/numeric-integrity";
import {
  acquireProcessingLock,
  getTranscript,
  releaseProcessingLock,
  saveProcessingCheckpoint,
} from "../shared-cache";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const VIDEO_ID = "KkBy__7d9Fs";
const GROQ_MODEL = "openai/gpt-oss-120b";

type Cue = { start: number; duration: number; text: string };
type Protected = { placeholder: string; token: string };

function hasGreek(text: string) {
  const letters = text.match(/\p{L}/gu)?.length || 0;
  const greek = text.match(/[\u0370-\u03ff\u1f00-\u1fff]/g)?.length || 0;
  return letters > 0 && greek / letters > 0.22;
}

function protectedTokens(text: string) {
  return [...new Set((text.match(/\b(?:[A-Z]{2,}[A-Z0-9-]*|[A-Za-z]+\d+[A-Za-z0-9-]*|\d+(?:[.,]\d+)?\s*(?:mg|mcg|g|ml|IU|iu|%))\b/g) || [])
    .map(token => token.replace(/\s+/g, "").toLowerCase()))];
}

function hasTranslatableEnglish(text: string) {
  const withoutProtected = text
    .replace(/\b(?:[A-Z]{2,}[A-Z0-9-]*|[A-Za-z]+\d+[A-Za-z0-9-]*|\d+(?:[.,]\d+)?\s*(?:mg|mcg|g|ml|IU|iu|%)|\d+(?:[.,]\d+)*)\b/g, " ")
    .replace(/[^A-Za-z]+/g, " ")
    .trim();
  return /[A-Za-z]{2,}/.test(withoutProtected);
}

function suffix(index: number) {
  let value = index;
  let result = "";
  do {
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return result;
}

function protect(text: string) {
  const values: Protected[] = [];
  const pattern = /\b(?:[A-Z]{2,}[A-Z0-9-]*|[A-Za-z]+\d+[A-Za-z0-9-]*|\d+(?:[.,]\d+)?\s*(?:mg|mcg|g|ml|IU|iu|%)|\d+(?:[.,]\d+)*)\b/g;
  const protectedText = text.replace(pattern, token => {
    const placeholder = `ZXQPROTECT${suffix(values.length)}`;
    values.push({ placeholder, token });
    return placeholder;
  });
  return { protectedText, values };
}

function restore(text: string, values: Protected[]) {
  let result = text;
  for (const { placeholder, token } of values) {
    const pattern = new RegExp(`\\b${placeholder}\\b`, "gi");
    const matches = result.match(pattern) || [];
    if (matches.length !== 1) return null;
    result = result.replace(pattern, token);
  }
  return result;
}

function clean(text: string) {
  return text.replace(/\s+/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();
}

function valid(source: string, target: string) {
  if (!target || /\[\s*\d+\s*\]/.test(target)) return false;
  if (hasTranslatableEnglish(source) && !hasGreek(target)) return false;
  if (!numberTokensMatch(source, target)) return false;
  const compact = target.toLowerCase().replace(/\s+/g, "");
  return protectedTokens(source).every(token => compact.includes(token));
}

async function googleTranslate(source: string) {
  const { protectedText, values } = protect(source);
  const normalized = protectedText
    .replace(/^\s*>+\s*/, "")
    .replace(/,\s*(?=[A-Za-z])/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const body = new URLSearchParams({ client: "gtx", sl: "en", tl: "el", dt: "t", q: normalized });
  const response = await fetch("https://translate.googleapis.com/translate_a/single", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body,
  });
  if (!response.ok) throw new Error(`google-${response.status}`);
  const payload = await response.json() as unknown;
  if (!Array.isArray(payload) || !Array.isArray(payload[0])) throw new Error("google-invalid");
  const translated = clean((payload[0] as unknown[]).map(part => Array.isArray(part) && typeof part[0] === "string" ? part[0] : "").join(""));
  return restore(translated, values);
}

async function groqTranslate(source: string) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0,
      max_tokens: 500,
      messages: [
        { role: "system", content: "Μετέφρασε μόνο το παρακάτω αγγλικό subtitle cue φυσικά και πιστά στα ελληνικά. Διατήρησε ακριβώς όλους τους αριθμούς, τις δόσεις, τα ακρωνύμια και tokens όπως GP, MSM, B3, IU. Μην προσθέσεις εξηγήσεις ή markers. Επέστρεψε μόνο την ελληνική μετάφραση." },
        { role: "user", content: source },
      ],
    }),
  });
  if (!response.ok) return null;
  const payload = await response.json() as { choices?: { message?: { content?: string } }[] };
  return clean(payload.choices?.[0]?.message?.content || "");
}

async function translateCue(source: string) {
  if (!hasTranslatableEnglish(source)) return source.trim();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const candidate = await googleTranslate(source);
      if (candidate && valid(source, candidate)) return candidate;
    } catch {}
  }
  const groq = await groqTranslate(source).catch(() => null);
  if (groq && valid(source, groq)) return groq;
  throw new Error(`untranslated:${source.slice(0, 120)}`);
}

async function mapConcurrent<T, R>(items: T[], concurrency: number, fn: (item: T, index: number) => Promise<R>) {
  const output = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      output[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return output;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedCount = Math.max(12, Math.min(600, Number(url.searchParams.get("count")) || 300));
  const current = await getTranscript(VIDEO_ID);
  if (!current || current.status !== "processing" || current.processingStage !== "translate" || !current.englishTranscript.length) {
    return Response.json({ error: "translate-checkpoint-not-ready", stage: current?.processingStage, status: current?.status }, { status: 409 });
  }

  const token = crypto.randomUUID();
  const acquired = await acquireProcessingLock(VIDEO_ID, token, false);
  if (!acquired) {
    const latest = await getTranscript(VIDEO_ID);
    return Response.json({ error: "busy", cursor: latest?.processingCursor, lockExpiresAt: latest?.lockExpiresAt }, { status: 409 });
  }

  try {
    const latest = await getTranscript(VIDEO_ID);
    if (!latest) throw new Error("checkpoint-missing");
    const start = Math.max(0, latest.processingCursor || 0);
    const end = Math.min(latest.englishTranscript.length, start + requestedCount);
    const source = (latest.englishTranscript as Cue[]).slice(start, end);
    const translatedTexts = await mapConcurrent(source, 24, cue => translateCue(cue.text));
    const greek = [...(latest.greekTranscript as Cue[])];
    for (let offset = 0; offset < source.length; offset += 1) {
      greek[start + offset] = { ...source[offset], text: translatedTexts[offset] };
    }
    const progress = Math.round(48 + 42 * (end / latest.englishTranscript.length));
    const saved = await saveProcessingCheckpoint(VIDEO_ID, token, {
      stage: "translate",
      cursor: end,
      progress,
      greekTranscript: greek,
    });
    if (!saved) throw new Error("checkpoint-save-failed");
    await releaseProcessingLock(VIDEO_ID, token);
    return Response.json({ ok: true, start, end, total: latest.englishTranscript.length, progress, complete: end >= latest.englishTranscript.length });
  } catch (error) {
    await releaseProcessingLock(VIDEO_ID, token).catch(() => undefined);
    return Response.json({ error: error instanceof Error ? error.message : "fast-worker-failed" }, { status: 500 });
  }
}
