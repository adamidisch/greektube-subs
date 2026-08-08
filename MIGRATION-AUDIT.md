# GreekTube Subs v5.27 — Migration Audit

Export audited: `greektube-subs-source-v5.27-sites-v73-20260808-083714.zip`

## Confirmed architecture

- Next.js 16 / React 19
- TypeScript
- ChatGPT Sites build path uses vinext + Vite
- Cloudflare Worker runtime
- Cloudflare D1 binding named `DB`
- Drizzle ORM with SQLite/D1 schema
- API routes for captions, metadata, application state and admin authentication
- `ADMIN_EDIT_PASSWORD` is read from the runtime environment and is not hard-coded
- No `.env` secrets were present in the exported source

## Persistent data

D1 currently stores:

- `app_state` — shared application/library state
- `personal_states` — per-user/per-browser state
- `video_transcripts` — English/Greek transcript cache, status, progress and processing locks

The transcript layer uses `TRANSCRIPT_VERSION = 4` and a 10-minute processing lock.

## Sites-specific dependencies

The main portability blocker is direct use of `cloudflare:workers` / `env.DB` in server routes and database helpers. The Cloudflare Worker image/runtime adapter is also Sites/Cloudflare-specific.

The ChatGPT authentication helper exists in the exported starter but is not required by the visible GreekTube UI flow. Anonymous users already have a UUID-cookie fallback for personal state.

## Vercel migration

The frontend and Next.js App Router are portable. For Vercel, remove the vinext/Cloudflare worker deployment layer and replace D1 access with a Vercel-compatible database adapter. A practical target is Postgres through a Vercel Marketplace provider such as Neon, preserving the existing logical tables and API contracts.

Do not redesign during migration. First reproduce v5.27 behavior, migrate data, verify all player/subtitle/state/admin functions and only then start design work.

## Validation note

Local `npm ci` could not complete in the ChatGPT sandbox because its internal npm proxy returned a 404 for `zod-validation-error@4.0.2`. This is an environment registry limitation, not evidence of an application dependency error. The exported lockfile references the normal npm dependency graph.
