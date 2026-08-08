# GreekTube Subs — Historical Migration Audit

This document records the architecture of the original ChatGPT Sites export and the migration completed on 2026-08-08. It is historical documentation, not the current runtime specification.

## Original export

The exported v5.27 ChatGPT Sites project used:

- Next.js 16 / React 19 / TypeScript
- vinext + Vite
- Cloudflare Worker runtime
- Cloudflare D1 database binding named `DB`
- Drizzle ORM with SQLite/D1 schema

The original persistent data model contained:

- `app_state`
- `personal_states`
- `video_transcripts`

## Completed Vercel migration

The application was migrated to:

- standard Next.js build (`next build`)
- Vercel Production and Preview deployments
- Neon PostgreSQL through `@neondatabase/serverless`
- `DATABASE_URL` for database configuration
- `ADMIN_EDIT_PASSWORD` through Vercel environment variables
- Supadata native transcript retrieval before the existing Greek translation pipeline

The active database adapter is `db/postgres.ts`. Current API routes use that adapter directly.

## Cleanup status

The old deployment layer is no longer part of the active project. Cloudflare Worker, D1, vinext, Vite/Sites build helpers, SQLite Drizzle migrations and starter examples were removed from the `dev` branch after the Vercel/Neon migration was verified.

The current architecture is documented in `README.md`.
