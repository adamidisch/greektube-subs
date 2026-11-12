# GreekTube export contract v1

Read-only, one-way export for LOGI / MIE. GreekTube does not know who reads it and nothing in GreekTube changes when it is read.

## Access

- Header: `Authorization: Bearer <EXPORT_API_TOKEN>`
- `EXPORT_API_TOKEN` lives only in Vercel environment variables (GreekTube) and, for the consumer, as `GREEKTUBE_EXPORT_TOKEN` (LOGI).
- Responses: `Cache-Control: no-store`, `X-Export-Schema: greektube.export.v1`.
- Errors: `401 unauthorized`, `503 export_not_configured`, `400 invalid_video_id`, `404 not_found`, `500 export_failed`.

## GET /api/export/v1/videos

Every video with ready Greek subtitles.

```json
{ "schema": "greektube.export.v1", "count": 2, "videos": [
  { "youtubeId": "NDeaXZ5KpM4", "title": "…", "channel": "…", "durationSeconds": 812,
    "category": "Medical", "speaker": "Dr. Sarah Myhill", "transcriptVersion": 12, "greekSource": "owner_reviewed", "publishedRevision": 4,
    "updatedAt": "2026-11-12T16:58:03Z", "url": "https://greektubesubs.com/?video=NDeaXZ5KpM4" } ] }
```

## GET /api/export/v1/videos/:youtubeId

```json
{ "schema": "greektube.export.v1", "youtubeId": "…", "title": "…", "channel": "…",
  "durationSeconds": 812, "originalLanguage": "en", "transcriptVersion": 12,
  "greekSource": "owner_reviewed", "publishedRevision": 4, "sourceHash": "…",
  "updatedAt": "…", "url": "…", "cueCount": 250, "englishAligned": true,
  "cues": [ { "index": 0, "start": 0.0, "end": 3.2, "en": "…", "el": "…" } ] }
```

## Selection

`category` is the owner's category from the shared library (`Medical`, `Other`, …). LOGI imports only `Medical`. A new video reaches LOGI only after the owner sets it to Medical in the editor. `speaker` is the verified speaker name, or empty.

## Rules for consumers

- Claims are extracted from `en` (the speaker's own words). `el` is for display only: it may be shortened for reading speed.
- Re-import a video only when `publishedRevision` or `updatedAt` changes.
- `greekSource`: `owner_reviewed` = published owner revision; `automatic` = pipeline translation.
- Selection (which videos enter LOGI) is decided on the consumer side.
- A breaking change ships as `/api/export/v2`; v1 keeps its shape.
