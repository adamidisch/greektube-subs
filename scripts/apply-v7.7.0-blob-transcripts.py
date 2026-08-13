from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


route_path = "app/api/captions/route.ts"
route = read(route_path)
route = replace_once(
    route,
    'import { NextResponse } from "next/server";\n',
    'import { NextResponse } from "next/server";\nimport { publishTranscript, readPublishedTranscript, transcriptBlobConfigured } from "../transcript-blob";\n',
    "blob import",
)

old_get = '''    const cached = await getTranscript(videoId);
    if (!cached || cached.transcriptVersion !== TRANSCRIPT_VERSION) {
      return NextResponse.json({ ready: false }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    if (cached.status === "processing") {
      return NextResponse.json(processingResponse(cached), {
        status: 202,
        headers: { "Cache-Control": "no-store", "Retry-After": "1" },
      });
    }
    if (cached.status !== "ready") {
      return NextResponse.json({ ready: false, status: cached.status, error: cached.error || undefined }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }

    validateCompleteGreekTranscript(cached.greekTranscript, cached.duration);
    return NextResponse.json(await cachedResponse(cached), {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=86400" },
    });
'''
new_get = '''    const published = await readPublishedTranscript(videoId, TRANSCRIPT_VERSION);
    if (published) {
      const publishedCues = published.cues as CaptionCue[];
      const publishedDuration = typeof published.duration === "number" ? published.duration : 0;
      validateCompleteGreekTranscript(publishedCues, publishedDuration);
      return NextResponse.json(published, {
        headers: {
          "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
          "X-GreekTube-Transcript-Source": "blob",
          "X-GreekTube-Blob-Configured": "1",
        },
      });
    }

    const cached = await getTranscript(videoId);
    if (!cached || cached.transcriptVersion !== TRANSCRIPT_VERSION) {
      return NextResponse.json({ ready: false }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    if (cached.status === "processing") {
      return NextResponse.json(processingResponse(cached), {
        status: 202,
        headers: { "Cache-Control": "no-store", "Retry-After": "1" },
      });
    }
    if (cached.status !== "ready") {
      return NextResponse.json({ ready: false, status: cached.status, error: cached.error || undefined }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }

    validateCompleteGreekTranscript(cached.greekTranscript, cached.duration);
    const payload = await cachedResponse(cached);
    const migrated = await publishTranscript(videoId, TRANSCRIPT_VERSION, payload);
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=86400",
        "X-GreekTube-Transcript-Source": migrated ? "neon-migrated" : "neon",
        "X-GreekTube-Blob-Configured": transcriptBlobConfigured() ? "1" : "0",
      },
    });
'''
route = replace_once(route, old_get, new_get, "GET Blob-first migration")

old_ready_shortcut = '''    if (!force && cached?.status === "ready" && cached.transcriptVersion === TRANSCRIPT_VERSION) {
      validateCompleteGreekTranscript(cached.greekTranscript, cached.duration);
      return NextResponse.json(await cachedResponse(cached));
    }
'''
new_ready_shortcut = '''    if (!force && cached?.status === "ready" && cached.transcriptVersion === TRANSCRIPT_VERSION) {
      validateCompleteGreekTranscript(cached.greekTranscript, cached.duration);
      const payload = await cachedResponse(cached);
      await publishTranscript(videoId, TRANSCRIPT_VERSION, payload);
      return NextResponse.json(payload);
    }
'''
route = replace_once(route, old_ready_shortcut, new_ready_shortcut, "POST ready Blob publish")

old_greek_finalize = '''      const ready = await getTranscript(videoId);
      return NextResponse.json(await cachedResponse(ready));
'''
new_greek_finalize = '''      const ready = await getTranscript(videoId);
      const payload = await cachedResponse(ready);
      await publishTranscript(videoId, TRANSCRIPT_VERSION, payload);
      return NextResponse.json(payload);
'''
route = replace_once(route, old_greek_finalize, new_greek_finalize, "native Greek Blob publish")

old_final = '''      const ready = await getTranscript(videoId);
      const payload = await cachedResponse(ready);
      return NextResponse.json({ ...payload, title: translatedTitle, translationMethod: translationMode === "google" ? "google_fast_context_v1" : "resumable_repaired_timed_v8", cached: false });
'''
new_final = '''      const ready = await getTranscript(videoId);
      const payload = await cachedResponse(ready);
      const publishedPayload = { ...payload, title: translatedTitle, translationMethod: translationMode === "google" ? "google_fast_context_v1" : "resumable_repaired_timed_v8", cached: false };
      await publishTranscript(videoId, TRANSCRIPT_VERSION, publishedPayload);
      return NextResponse.json(publishedPayload);
'''
route = replace_once(route, old_final, new_final, "final translated Blob publish")
write(route_path, route)

package_path = "package.json"
package = json.loads(read(package_path))
package["version"] = "7.7.0"
write(package_path, json.dumps(package, ensure_ascii=False, indent=2) + "\n")

layout_path = "app/layout.tsx"
layout = read(layout_path)
layout = layout.replace("v7.6.1-production-cleanup", "v7.7.0-blob-transcripts")
write(layout_path, layout)
