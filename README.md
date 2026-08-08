# GreekTube Subs

GreekTube Subs is a Next.js application for watching YouTube videos with Greek subtitles, translated transcripts, saved moments and a persistent video library.

## Current architecture

- Next.js 16 / React 19 / TypeScript
- Vercel for Production and Preview deployments
- Neon PostgreSQL for persistent application state and transcript cache
- Supadata native transcripts before the translation pipeline
- Browser-local state as a resilience layer for personal preferences and progress

The active database adapter is `db/postgres.ts`, which reads `DATABASE_URL` and connects through `@neondatabase/serverless`.

The application does **not** depend on Cloudflare Workers, Cloudflare D1, vinext or Wrangler at runtime.

## Environment variables

Configure these in Vercel for Production and Preview:

- `DATABASE_URL` — Neon PostgreSQL connection string
- `ADMIN_EDIT_PASSWORD` — administrator edit password
- `SUPADATA_API_KEY` — Supadata transcript API key

Do not commit secret values to the repository.

## Local development

Requirements:

- Node.js `>=22.13.0`

Commands:

```bash
npm install
npm run dev
npm run build
npm run lint
```

## Data

The application creates and uses these PostgreSQL tables:

- `app_state` — shared library/application state
- `personal_states` — per-browser personal state
- `video_transcripts` — transcript cache, translation output, processing status and locks

The API routes use the Neon adapter directly and preserve the existing application contracts.

## Deployment workflow

- `main` — Production and `greektubesubs.com`
- `dev` — Vercel Preview for work in progress

Changes should be developed and validated on `dev` first. Only an approved version should be promoted to `main`.

## Migration history

The project originally came from ChatGPT Sites and used a vinext/Cloudflare Worker/D1 starter. That deployment layer has been removed. `MIGRATION-AUDIT.md` is retained only as historical documentation of the migration to Vercel + Neon.
