# Session Handoff

_Session ended 2026-11-14._

## State
- **Branch:** `main`. All work is **uncommitted** in the working tree; the only commit is `92be7b1 Initial commit`. Commit to a feature branch before further work. Commits must use only the configured git user (no co-author lines; see the user-level CLAUDE.md).
- **Health:** typecheck, lint, unit tests (102), and production build all pass.
- **AI:** Gemini free tier (TD-019), verified with one real structured call.
- **Not verified live:** Supabase, Buffer, Deepgram.

## Commands
```bash
npm install
npm run dev          # http://localhost:3000 (redirects to /setup until configured)
npm test             # vitest
npm run lint && npm run typecheck && npm run build
npx supabase db push # after `npx supabase link --project-ref <ref>`; or `npx supabase start` locally (Docker; needs memory)
```

## Environment variables still required
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY` (AI; optional `GEMINI_MODEL`, default `gemini-3.5-flash`), and `BUFFER_TOKEN_ENCRYPTION_KEY` (generate it; see `.env.example`).

For Buffer, either set `BUFFER_CLIENT_ID` and `BUFFER_CLIENT_SECRET` (redirect `${APP_URL}/api/buffer/callback`), or have a personal Buffer API key to paste in Publishing.

Optional: `TRANSCRIPTION_API_KEY` (Deepgram).

## Where things are
- Spec: `CLAUDE.md`. Decisions: `TECHNICAL_DECISIONS.md`. Gaps: `KNOWN_LIMITATIONS.md`.
- Schema: `supabase/migrations/20261114000000_orbit_core.sql`
- Engines: `src/engines/{radar,brain,studio,guardian,campaign,publisher,evolution}`
- Integrations: `src/lib/ai/client.ts`, `src/lib/buffer/*`, `src/lib/research/*`, `src/lib/transcription.ts`
- Server actions: `src/app/actions/*`. Pages: `src/app/(app)/*`. Components: `src/components/*`
- Tests: `tests/unit/*` (Vitest config `vitest.config.mts`; the `server-only` import is stubbed)

## Known errors
None in build, lint, or tests. Live API shapes for Buffer `channels`/`posts`/`createPost` are unconfirmed (see KNOWN_LIMITATIONS.md).

## Exact next action
Create a Supabase project, put its keys in `.env.local`, and run `npx supabase link` then `npx supabase db push`. Sign up two users and confirm each sees only their own data. Then walk the demo path in CLAUDE.md §17 using Radar's URL/RSS discovery; web search is unavailable on Gemini (TD-019).
