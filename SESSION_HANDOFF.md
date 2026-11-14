# Session Handoff

_Session ended 2026-11-14._

## State
- **Branch:** `feat/orbit-core` (branched from `main`). Everything is committed. Commits must use only the configured git user (Bennytimz), with no co-author lines; see the user-level CLAUDE.md.
- **Health:** typecheck, lint, 102 unit tests, and production build all pass.
- **Node:** **Node 22 is required** (`.nvmrc`, `package.json` `engines`). On Node 20, supabase-js throws "native WebSocket not found" at runtime. Node 22.23.5 is installed via nvm-windows but is not active by default; run `nvm use 22`.
- **Live services (all verified 2026-11-14):**
  - **Supabase** (`yxsuqkssuzkqihcmjfai`): the migration was applied by hand in the SQL editor, and all 26 tables are reachable. The two-user RLS test passed 22/22, and its test users were deleted.
  - **Gemini** (`gemini-3.5-flash`): the full path ran with schema-valid output:
    - discovery from a URL;
    - research report (7/7 passages verified);
    - generation for LinkedIn and X;
    - Guardian.
  - **Buffer** (personal API key): connected with the key stored encrypted, and 2 channels synced (X `bennytimz`, LinkedIn). A real LinkedIn **draft** was created:
    - Buffer post ID **`6af7c8fe97efac0554d2d982`**
    - ledger row `a7e2ed0c-f261-4fad-96ce-27800a675f6b`
    - It is still a draft in Buffer and has not been published or scheduled.
- **Demo account in Supabase:** `orbit-demo-1794623434761@example.com`. Its password is not in the repo; it is in the session scratchpad file `live/flow-state.json`, or reset it in Supabase → Auth. It holds the discovery, report, perspective, two drafts, Guardian reports and the Buffer connection above. You can sign in as it to see the results in the UI, or delete it from Supabase → Auth.
- **Not verified live:**
  - the browser UI click-through
  - Buffer OAuth and scheduling
  - campaigns
  - RSS discovery
  - Deepgram transcription

## Commands
```bash
nvm use 22
npm install
npm run dev          # http://localhost:3000
npm test             # vitest (unit; no network)
npm run lint && npm run typecheck && npm run build
```
The schema is applied by hand: paste `supabase/migrations/20261114000000_orbit_core.sql` into the Supabase SQL editor. The Supabase CLI isn't logged in on this machine.

## Environment variables
`.env.local` contains:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `BUFFER_TOKEN_ENCRYPTION_KEY`
- `BUFFER_API_KEY`, which is used only by the live scripts. In the app, the key is pasted in Publishing and then stored encrypted. You can remove it from `.env.local`.
- `TRANSCRIPTION_PROVIDER`

Still missing:
- **Optional:** `BUFFER_CLIENT_ID` / `BUFFER_CLIENT_SECRET` (OAuth; redirect `${APP_URL}/api/buffer/callback`), `TRANSCRIPTION_API_KEY` (Deepgram), `GEMINI_MODEL`.
- **For deployment:** `NEXT_PUBLIC_APP_URL`.

## Where things are
- Spec: `CLAUDE.md`. Decisions: `TECHNICAL_DECISIONS.md` (AI provider: TD-019). Gaps: `KNOWN_LIMITATIONS.md`. Progress and live-test record: `BUILD_PROGRESS.md`.
- Schema: `supabase/migrations/20261114000000_orbit_core.sql`
- Engines: `src/engines/{radar,brain,studio,guardian,campaign,publisher,evolution}`
- Integrations: `src/lib/ai/client.ts` (Gemini), `src/lib/buffer/*`, `src/lib/research/*`, `src/lib/transcription.ts`
- Server actions: `src/app/actions/*`. Pages: `src/app/(app)/*`. Components: `src/components/*`
- Tests: `tests/unit/*`. The live scripts (RLS, flow, Buffer) were scratch files and are not in the repo.

## Known errors
- None in the build, lint or tests.
- `next build` on Windows sometimes fails with `ENOTEMPTY ... .next\...`. Re-running fixes it.

## Exact next action
1. Run `nvm use 22 && npm run dev`.
2. Sign up a fresh user and click through the demo path in CLAUDE.md §17: Radar "From URLs" → report → Develop My Perspective → Studio → Guardian → campaign → Publishing (paste the Buffer API key) → publish confirmation, using draft mode.
3. Fix anything the UI exposes that the direct engine runs could not.
