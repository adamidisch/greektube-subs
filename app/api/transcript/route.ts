import { NextRequest, NextResponse } from 'next/server';
import { getEnglishTranscript, TranscriptUnavailableError } from '@/lib/youtube-transcript';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (process.env.VERCEL_ENV === 'production') {
    return NextResponse.json({ error: 'preview-only' }, { status: 403 });
  }

  const videoId = request.nextUrl.searchParams.get('videoId')?.trim();

  if (!videoId) {
    return NextResponse.json({ error: 'Missing videoId query param' }, { status: 400 });
  }
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) {
    return NextResponse.json({ error: 'Invalid videoId' }, { status: 400 });
  }

  const startedAt = Date.now();
  try {
    const transcript = await getEnglishTranscript(videoId);
    const result = {
      dryRun: true,
      writesPerformed: false,
      paidProvidersTouched: false,
      videoId,
      segmentCount: transcript.length,
      firstFive: transcript.slice(0, 5),
      last: transcript.at(-1) ?? null,
      elapsedMs: Date.now() - startedAt,
    };
    console.info('[transcript-test-result]', JSON.stringify(result));
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
    });
  } catch (err) {
    if (err instanceof TranscriptUnavailableError) {
      const result = {
        dryRun: true,
        writesPerformed: false,
        paidProvidersTouched: false,
        videoId,
        error: err.message,
        cause: err.cause instanceof Error ? err.cause.message : String(err.cause ?? ''),
        elapsedMs: Date.now() - startedAt,
      };
      console.warn('[transcript-test-unavailable]', JSON.stringify(result));
      return NextResponse.json(result, { status: 503, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
    }
    console.error('Unexpected transcript error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
