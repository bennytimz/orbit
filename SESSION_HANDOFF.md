# Session Handoff

## PAUSED (2026-11-19, user's PC low on power). Read this first
- **Branch:** `feat/post-commit` (pushed). `main` and production are untouched. Do not merge or deploy before 2026-11-21 (Lagos time).
- **Phase / step:** Phase 2, feature **B (performance loop)**. The code is written, but there is **1 lint error** to fix: `src/components/publishing/performance-panel.tsx:45` (`react-hooks/set-state-in-effect`; it calls `run(false)` in `useEffect`). Fix it by triggering the initial load without a synchronous setState in the effect (e.g. use the `useEffect` + `startTransition`/async IIFE pattern, or load the initial data server-side and pass it as a prop). Then run typecheck, lint, test and build, and commit B.
- **Done:**
  - Phase 1: schema notes in `notes/buffer-schema-2026-11.md`.
  - **A (media + Instagram):** committed `8001f4f` and live-tested (see below). The `publish-dialog.tsx` lint warning was fixed in that commit.
- **Half-done:**
  - B code: `src/lib/buffer/metrics.ts`, `src/engines/evolution/performance.ts`, `src/app/actions/performance.ts`, `src/components/publishing/performance-panel.tsx`, a new section on `src/app/(app)/publishing/page.tsx`, the Memory label "From post performance" for `performance_*` keys, and `tests/unit/performance.test.ts`. Unit tests pass (146/146) and typecheck passes. The lint error above remains. Build has not been re-run since A.
  - B isn't live-verified in the UI yet. Live facts: metrics need `insightsRead`, which only personal API keys get, not OAuth. Production is OAuth-connected, so the panel will show the "needs a personal API key" notice. The personal key does return metrics, for 3 sent X posts that ORBIT didn't create.
- **Not started:**
  - C: group variants via Content Items `createContentItem`. The schema supports it with `posts:write` and needs no scope change. Plan: a new "Send variants together" action over a `generation_group`, all-or-nothing, recording `buffer_content_item_id`.
  - D: RSS check, scheduled-post test (30+ days out, then delete), campaigns check, transcription graceful-failure check.
  - E: Playwright E2E.
  - F: landing page lines and docs (README, KNOWN_LIMITATIONS, TECHNICAL_DECISIONS: add TD-021 "media via 365-day signed URLs", BUILD_PROGRESS).
  - Phase 3 regression. Phase 4 is not before 2026-11-21.
- **Migrations run on the shared Supabase DB (2026-11-19, SQL editor, succeeded):** `supabase/migrations/20261119000000_post_commit_additions.sql`. It is additive only:
  - new tables `content_media` and `buffer_post_metrics` (RLS, owner policies);
  - nullable columns `buffer_publications.media_sent` and `buffer_publications.buffer_content_item_id`;
  - private bucket `orbit-media` (4 MB; jpeg/png/gif; no storage.objects policies).
  - Verified via the service role. The anon key sees nothing.
- **Live Buffer objects:** LinkedIn drafts with an image, both **deleted**:
  - `6afee8affcd8732ff2118ddf`: created, then deleted. Its first readback used the wrong query shape. Confirmed NOT_FOUND after the delete.
  - `6afee8f38840f68c22be40a3`: created, read back (draft, linkedin, image/png asset), deleted, confirmed NOT_FOUND.
  - Test files `live-test/*.png` were removed from `orbit-media`, and the bucket is empty.
  - No Ideas, scheduled posts or other objects were created.
- **Scopes changed:** none.
- **Known breakage on the branch:** only the lint error above. The scratch scripts live in the session scratchpad, not in the repo.
- **Exact next action:** fix the lint error in `performance-panel.tsx`, then run `npm run typecheck && npm run lint && npm test && npm run build` (Node 22). Commit "Add Performance panel …", then continue with C.


_Session ended 2026-11-14. Production: https://orbit-theta-lyart.vercel.app_

## State
- **Save to Buffer Ideas (2026-11-14, post-submission, additive only):**
  - Code: `src/lib/buffer/ideas.ts` (mutation + `interpretCreateIdeaPayload`), `src/app/actions/ideas.ts` (`saveDiscoveryToBufferIdeas`), `src/components/buffer/save-to-ideas-button.tsx`. One-line inserts in `src/components/radar/discovery-card.tsx` (lightbulb icon in the right-hand icon row) and `src/app/(app)/research/[id]/page.tsx` (header actions). Tests: `tests/unit/buffer-ideas.test.ts`.
  - `BUFFER_SCOPES` now includes `ideas:write`. Production was reconnected via OAuth: the consent screen listed Your Account, Your Posts, and Your Ideas ("Create and manage ideas on your behalf"); the stored token scopes are `account:read posts:read posts:write ideas:write offline_access`. LinkedIn and X channels reloaded.
  - Live test on production: PostgreSQL 18 discovery saved → Buffer Idea **`6af8567609a1192bfd721886`** (org `6af7549d676fbe883b3cea48`), read back via the `ideas` query with matching title/summary/source link. No posts were created.
  - Duplicate protection: items with a recorded Idea ID render "Saved to Ideas ✓" (disabled; icon-only check on Radar cards with that label as tooltip/aria-label) and `saveIdeaOnce` refuses repeats without calling Buffer. The Connect with Buffer blurb now mentions creating ideas. Unit-tested only; not re-tested live.
  - Landing page Buffer API list has the line "createIdea: save discoveries to Buffer Ideas (added after submission)".
  - Not done: viewing the Idea in publish.buffer.com in Chrome (the extension has no permission on that domain); verified via the API instead.
- **Landing page (2026-11-14):** `/` is now public for logged-out visitors (`src/proxy.ts` exact-match `/`; signed-in `/` goes to `/dashboard`). Page: `src/app/page.tsx`. Screenshots in `public/screens/` were taken read-only from the live account with Playwright (name/email hidden; the publish screenshot stops at the final confirmation, nothing was sent). Share metadata: `src/app/layout.tsx`, which uses `NEXT_PUBLIC_APP_URL` as `metadataBase`.
- **Branch:** `main`, with `feat/orbit-core` fast-forward merged into it. Both branches are pushed to `origin` (github.com/bennytimz/orbit). Commits must use only the configured git user (Bennytimz), with no co-author lines; see the user-level CLAUDE.md.
- **Health:** typecheck, lint (1 pre-existing warning in publish-dialog.tsx), 128 unit tests, and production build all pass.
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
- **UI click-through (2026-11-14, Node 22 dev server):** completed as the demo account, stopping at the final confirmation without sending:
  - sign-in and Command Center;
  - Radar ("From URLs" default);
  - research report;
  - Develop My Perspective (AI questions) and a typed answer;
  - Studio editor (X thread);
  - Guardian re-run;
  - creating a campaign and adding both drafts;
  - the publish dialog with the thread preview, then the final confirmation.

  The Buffer ledger still holds only the one LinkedIn draft. In dev mode each page compiles on first visit and takes about 10 s, so judge speed on a production build.
- **X threads:** sent to Buffer as `metadata.twitter.thread` (schema-introspected, unit-tested). No live thread post has been created yet.
- **Not verified live:**
  - Buffer scheduling (OAuth verified live on production on 2026-11-14)
  - a real X thread post
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
- **Optional:** `BUFFER_CLIENT_ID` / `BUFFER_CLIENT_SECRET` (OAuth; redirect `${APP_URL}/api/buffer/callback`; set on Vercel Production along with `BUFFER_REDIRECT_URI`, and the live site is connected via OAuth), `TRANSCRIPTION_API_KEY` (Deepgram), `GEMINI_MODEL`.
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
1. Deploy to Vercel:
   - Set the Node.js version to 22.x.
   - Set the env vars from the Vercel list in the README.
   - Add `${NEXT_PUBLIC_APP_URL}/auth/callback` to Supabase Auth → URL configuration.
2. Smoke-test the deployed app on the same demo path, using draft mode only.
3. Optional: with explicit approval, create one live X thread draft to confirm `metadata.twitter.thread` end to end.
