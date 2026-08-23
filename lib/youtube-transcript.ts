import { Innertube } from 'youtubei.js';

export interface TranscriptSegment {
  text: string;
  start: number;
  duration: number;
}

export class TranscriptUnavailableError extends Error {
  constructor(videoId: string, cause?: unknown) {
    super(`Could not fetch English transcript for video ${videoId}`);
    this.name = 'TranscriptUnavailableError';
    this.cause = cause;
  }
}

const INVIDIOUS_INSTANCES = [
  'https://invidious.nerdvpn.de',
  'https://yewtu.be',
  'https://invidious.jing.rocks',
];

const FETCH_TIMEOUT_MS = 5000;

function snippetText(snippet: unknown) {
  if (typeof snippet === 'string') return snippet.trim();
  if (snippet && typeof snippet === 'object') {
    const candidate = snippet as { text?: string; toString?: () => string };
    if (typeof candidate.text === 'string') return candidate.text.trim();
    if (typeof candidate.toString === 'function') return candidate.toString().replace(/\s+/g, ' ').trim();
  }
  return '';
}

async function fetchViaInnertube(videoId: string): Promise<TranscriptSegment[]> {
  const yt = await Innertube.create({
    lang: 'en',
    location: 'US',
    retrieve_player: false,
    generate_session_locally: true,
    enable_session_cache: false,
  });
  const info = await yt.getInfo(videoId);
  const transcriptData = await info.getTranscript();

  const segments = transcriptData?.transcript?.content?.body?.initial_segments;
  if (!segments || segments.length === 0) {
    throw new Error('No transcript segments returned');
  }

  const parsed = Array.from(segments)
    .map((raw: unknown) => {
      const seg = raw as { start_ms?: string; end_ms?: string; snippet?: unknown; type?: string };
      const startMs = Number(seg.start_ms ?? 0);
      const endMs = Number(seg.end_ms ?? 0);
      return {
        text: snippetText(seg.snippet),
        start: startMs / 1000,
        duration: (endMs - startMs) / 1000,
      };
    })
    .filter(segment => segment.text && Number.isFinite(segment.start) && Number.isFinite(segment.duration) && segment.duration > 0);

  if (!parsed.length) throw new Error('Transcript contained no usable segments');
  return parsed;
}

async function fetchViaInvidious(videoId: string): Promise<TranscriptSegment[]> {
  let lastError: unknown;

  for (const base of INVIDIOUS_INSTANCES) {
    try {
      const captionsListRes = await fetch(`${base}/api/v1/captions/${videoId}`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        cache: 'no-store',
      });
      if (!captionsListRes.ok) throw new Error(`${base}: captions list ${captionsListRes.status}`);

      const payload = await captionsListRes.json() as { captions?: Array<{ languageCode?: string; url?: string; label?: string }> };
      const englishTracks = (payload.captions ?? []).filter(caption => {
        const language = caption.languageCode?.toLowerCase() ?? '';
        return Boolean(caption.url) && (language === 'en' || language.startsWith('en-'));
      });

      const englishTrack = englishTracks.find(caption => /auto|generated/i.test(caption.label ?? '')) ?? englishTracks[0];
      if (!englishTrack?.url) throw new Error(`${base}: no English caption track listed`);

      const captionUrl = englishTrack.url.startsWith('http') ? englishTrack.url : `${base}${englishTrack.url}`;
      const vttRes = await fetch(captionUrl, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        cache: 'no-store',
      });
      if (!vttRes.ok) throw new Error(`${base}: caption fetch ${vttRes.status}`);

      const parsed = parseVtt(await vttRes.text());
      if (parsed.length > 0) return parsed;
      throw new Error(`${base}: empty transcript after parsing`);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError ?? new Error('all Invidious instances failed');
}

function parseVtt(vtt: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const blocks = vtt.split(/\r?\n\r?\n/);

  for (const block of blocks) {
    const lines = block.split(/\r?\n/).filter(Boolean);
    const timeLine = lines.find(line => line.includes('-->'));
    if (!timeLine) continue;

    const [startToken, endToken] = timeLine.split('-->').map(value => value.trim().split(/\s+/)[0]);
    const start = vttTimeToSeconds(startToken);
    const end = vttTimeToSeconds(endToken);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;

    const text = lines
      .slice(lines.indexOf(timeLine) + 1)
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();

    if (text) segments.push({ text, start, duration: end - start });
  }

  return segments;
}

function vttTimeToSeconds(value: string): number {
  const parts = value.replace(',', '.').split(':').map(Number);
  if (parts.some(part => !Number.isFinite(part))) return Number.NaN;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return Number.NaN;
}

export async function getEnglishTranscript(videoId: string): Promise<TranscriptSegment[]> {
  try {
    return await fetchViaInnertube(videoId);
  } catch {
    // One direct attempt only. Repeating the same Vercel-origin request adds latency
    // and does not help if YouTube is rejecting the current environment.
  }

  try {
    return await fetchViaInvidious(videoId);
  } catch (err) {
    throw new TranscriptUnavailableError(videoId, err);
  }
}
