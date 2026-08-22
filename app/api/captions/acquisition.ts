import type { SubtitleCue } from "./subtitle-contract";
import { fetchSupadataTranscript } from "../supadata";
import { fetchYouTubeEnglishSource } from "../subtitle-canary/youtube-source";

export const CAPTION_ACQUISITION_VERSION = 2;

export type CaptionSourceProvenance = {
  provider: "youtube-direct" | "scrapecreators" | "supadata";
  source: "youtube-manual" | "youtube-auto" | "scrapecreators-native" | "supadata-native" | "unknown";
  languageCode: string;
  acquiredAt: string;
  providerDetail?: string;
};

export type CaptionAcquisitionAttempt = {
  provider: CaptionSourceProvenance["provider"];
  status: "success" | "failed" | "cooldown";
  elapsedMs: number;
  error?: string;
  retryAfterMs?: number;
};

export type CaptionAcquisitionResult = {
  cues: SubtitleCue[];
  provenance: CaptionSourceProvenance;
  attempts: CaptionAcquisitionAttempt[];
};

type Provider = {
  name: CaptionSourceProvenance["provider"];
  acquire(videoId: string): Promise<{
    cues: SubtitleCue[];
    source: CaptionSourceProvenance["source"];
    languageCode: string;
    providerDetail?: string;
  }>;
};

type ScrapeCreatorsTranscriptResponse = {
  success?: unknown;
  language?: unknown;
  transcript?: unknown;
};

type ScrapeCreatorsTranscriptRow = {
  text?: unknown;
  startMs?: unknown;
  endMs?: unknown;
};

const providerCooldownUntil = new Map<CaptionSourceProvenance["provider"], number>();
const RATE_LIMIT_COOLDOWN_MS = 5 * 60_000;

function cleanError(error: unknown) {
  return error instanceof Error ? error.message : String(error || "unknown-error");
}

function normalizeSource(source: unknown): CaptionSourceProvenance["source"] {
  return source === "youtube-manual" || source === "youtube-auto" || source === "scrapecreators-native" || source === "supadata-native"
    ? source
    : "unknown";
}

function isRateLimited(message: string) {
  return /(?:\b429\b|rate.?limit|limit-exceeded)/i.test(message);
}

function isRetryable(message: string) {
  return /(?:timeout|timed out|aborted|fetch failed|\b5\d\d\b|ECONN|ENET|EAI_AGAIN)/i.test(message);
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchScrapeCreatorsEnglish(videoId: string) {
  const apiKey = process.env.SCRAPECREATORS_API_KEY?.trim();
  if (!apiKey) throw new Error("SCRAPECREATORS_API_KEY is not configured");

  const endpoint = new URL("https://api.scrapecreators.com/v1/youtube/video/transcript");
  endpoint.searchParams.set("url", `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`);
  endpoint.searchParams.set("language", "en");
  endpoint.searchParams.set("cache_max_age", "7d");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(endpoint.toString(), {
      cache: "no-store",
      signal: controller.signal,
      headers: { "x-api-key": apiKey },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`ScrapeCreators ${response.status}: ${body.slice(0, 300) || response.statusText}`);
    }

    const payload = await response.json() as ScrapeCreatorsTranscriptResponse;
    if (!Array.isArray(payload.transcript)) throw new Error("ScrapeCreators returned no English transcript");

    const cues = (payload.transcript as ScrapeCreatorsTranscriptRow[])
      .map(row => {
        const text = typeof row.text === "string" ? row.text.replace(/\s+/g, " ").trim() : "";
        const startMs = Number(row.startMs);
        const endMs = Number(row.endMs);
        if (!text || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
        return {
          start: Math.max(0, startMs / 1000),
          duration: Math.max(0.05, (endMs - startMs) / 1000),
          text,
        } satisfies SubtitleCue;
      })
      .filter((cue): cue is SubtitleCue => cue !== null);

    if (!cues.length) throw new Error("ScrapeCreators returned an empty English transcript");
    const language = typeof payload.language === "string" && payload.language.trim()
      ? payload.language.trim().toLowerCase()
      : "en";

    return {
      cues,
      source: "scrapecreators-native" as const,
      languageCode: language.includes("english") ? "en" : language,
      providerDetail: "youtube-transcript-api",
    };
  } finally {
    clearTimeout(timeout);
  }
}

const providers: Provider[] = [
  {
    name: "youtube-direct",
    async acquire(videoId) {
      const result = await fetchYouTubeEnglishSource(videoId);
      return {
        cues: result.cues,
        source: normalizeSource(result.source),
        languageCode: result.languageCode || "en",
        providerDetail: result.client,
      };
    },
  },
  {
    name: "scrapecreators",
    async acquire(videoId) {
      return fetchScrapeCreatorsEnglish(videoId);
    },
  },
  {
    name: "supadata",
    async acquire(videoId) {
      const result = await fetchSupadataTranscript(videoId);
      return {
        cues: result.cues,
        source: normalizeSource(result.source),
        languageCode: result.lang || "en",
        providerDetail: "native-transcript-api",
      };
    },
  },
];

/**
 * Acquire an English caption source for a new subtitle revision.
 *
 * Order is deterministic: direct YouTube first, ScrapeCreators second and
 * Supadata last. The result includes provenance and every provider attempt so
 * the caller can freeze an auditable raw source artifact. This function
 * performs no database or Blob writes.
 *
 * Cooldowns are deliberately best-effort and process-local. They avoid
 * hammering a provider from a warm serverless instance after a 429 without
 * turning provider health into production database state.
 */
export async function acquireEnglishCaptions(videoId: string): Promise<CaptionAcquisitionResult> {
  const attempts: CaptionAcquisitionAttempt[] = [];

  for (const provider of providers) {
    const now = Date.now();
    const cooldownUntil = providerCooldownUntil.get(provider.name) || 0;
    if (cooldownUntil > now) {
      attempts.push({
        provider: provider.name,
        status: "cooldown",
        elapsedMs: 0,
        retryAfterMs: cooldownUntil - now,
      });
      continue;
    }

    const maxAttempts = provider.name === "youtube-direct" ? 1 : 2;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const startedAt = Date.now();
      try {
        const result = await provider.acquire(videoId);
        const cues = result.cues
          .map(cue => ({
            start: Number(cue.start),
            duration: Number(cue.duration),
            text: String(cue.text || "").replace(/\s+/g, " ").trim(),
          }))
          .filter(cue => cue.text && Number.isFinite(cue.start) && Number.isFinite(cue.duration) && cue.start >= 0 && cue.duration > 0);

        if (!cues.length) throw new Error("empty-caption-source");

        attempts.push({ provider: provider.name, status: "success", elapsedMs: Date.now() - startedAt });
        providerCooldownUntil.delete(provider.name);
        return {
          cues,
          provenance: {
            provider: provider.name,
            source: result.source,
            languageCode: result.languageCode,
            acquiredAt: new Date().toISOString(),
            providerDetail: result.providerDetail,
          },
          attempts,
        };
      } catch (error) {
        const message = cleanError(error);
        attempts.push({ provider: provider.name, status: "failed", elapsedMs: Date.now() - startedAt, error: message });

        if (isRateLimited(message)) {
          providerCooldownUntil.set(provider.name, Date.now() + RATE_LIMIT_COOLDOWN_MS);
          break;
        }
        if (!isRetryable(message) || attempt + 1 >= maxAttempts) break;
        await sleep(400 * (attempt + 1));
      }
    }
  }

  const summary = attempts.map(item => `${item.provider}:${item.status}${item.error ? `:${item.error}` : ""}`).join(" | ");
  throw new Error(`caption-acquisition-failed:${summary || "no-provider-attempted"}`);
}
