# Build Progress

_Last updated: 2026-11-14_

## Status summary
The whole mandatory workflow is implemented in code and builds:

Radar → research report → Develop My Perspective (text/voice) → Studio generation → Guardian → campaign → Buffer connection → approved Buffer post/draft/schedule

`tsc`, `eslint`, `next build`, and 123 unit tests pass. **On 2026-11-14 the core path was exercised live** against real Supabase, Gemini and Buffer, up to a real Buffer draft (see Test status). What hasn't been run live: the browser UI (all live runs called engine/server code directly), scheduling, campaigns, and voice transcription. See KNOWN_LIMITATIONS.md.

## Completed
| Area | What exists | Verified by |
| --- | --- | --- |
| Foundation | Next 16 app, Tailwind 4, shadcn (Base UI), dark design tokens, proxy, `/setup` config page, loading/error/404 states | build, smoke test |
| Database | Full schema plus RLS migration (26 tables), `handle_new_user` trigger, isolated `buffer_credentials` | **live**: migration applied, all 26 tables reachable, two-user RLS test passes 22/22 |
| Auth | Email sign-up/in, `/auth/callback`, onboarding (3 steps), protected `(app)` routes | typecheck only |
| Radar | Web search discovery, URL analysis, RSS/Atom feeds, filters/sort/pagination, relevance with per-factor explanations | unit (scoring, dates, feeds, robots, SSRF) |
| Research | Report generation with source retrieval, verbatim passage verification, conflicts/uncertainties/dates/entities, source fetch status | unit (passage matching) |
| Brain / My Voice | Profile, interests, brand voice, writing samples → editable AI suggestion, knowledge base | typecheck |
| Perspective | Contextual questions, text and MediaRecorder voice capture, transcription route, "Remember" to knowledge | typecheck |
| Studio | Multi-platform generation, editor (autosave, conflict detection, Ctrl+S, char counts, preview, threads), AI rewrite suggestions with diff and versioned apply, adapt-to-platform, versions/restore, sources, generation notes | unit (char counting) |
| Guardian | Rules plus AI review, issue resolve/dismiss/reopen, Guardian center, stale detection | unit (rules, stats, overall status) |
| Campaigns | CRUD, editable phases, add content, per-item phase/date/channels, phase list and month calendar, delete | typecheck |
| Publisher | OAuth+PKCE, API-key connect, org selection, channel sync/toggle, live Buffer posts browser, pre-publication checks, final confirmation, per-channel ledger with idempotency, unknown-outcome reconciliation, disconnect | unit (PKCE, token parsing, GraphQL client, payloads, preflight, input builder) |
| Evolution | Edit feedback capture, "Analyze my edits" → suggested preferences → accept/edit/reject, explicit preferences | typecheck |
| Public landing (`/`) | Logged-out visitors see a landing page (hero, embedded demo video, 6-step how-it-works, real screenshots from the live account in `public/screens/`, Buffer API summary, footer); signed-in users are redirected to `/dashboard`. `/login` and `/signup` link back to `/`. OpenGraph/Twitter meta in the root layout | local `next start` (curl + Playwright), live check after deploy |
| Save to Buffer Ideas (post-submission, additive) | Lightbulb button on Radar cards and "Save to Buffer Ideas" on the research page → `saveDiscoveryToBufferIdeas` (`src/app/actions/ideas.ts`) → `createIdea` (`src/lib/buffer/ideas.ts`) with title, short summary and source link. Every `CreateIdeaPayload` member handled; success only with a returned idea ID; logged to `activity_logs` (`buffer_idea_created`). OAuth now requests `ideas:write` | unit (14 tests in `tests/unit/buffer-ideas.test.ts`); **live 2026-11-14**: Idea `6af8567609a1192bfd721886` created on production and read back via the `ideas` query |
| Command Center | Pipeline counts, top discoveries, Guardian alerts, ready-for-review, upcoming (ledger), campaigns, quick actions | typecheck |
| Memory / Settings | Inspect/edit/delete identity, voice, preferences, knowledge; integration status, privacy, account deletion | typecheck |

## Test status
- **2026-11-14 UI click-through** (Node 22 dev server, demo account):
  - The full demo path works in the browser, up to the final publish confirmation; nothing was sent.
  - Fixed along the way:
    - stale thread label;
    - perspective question not focusing its answer box;
    - raw event dates;
    - redundant campaign selector;
    - thread notice wording.
- **X threads:** sent as `metadata.twitter.thread` (all parts; top-level `text` is part 1). Covered by unit tests: 105 tests pass.
- **2026-11-14 live runs** (scratch scripts that call engine code directly; not checked in):
  - **RLS (22/22 pass).** With two real users:
    - The signup trigger creates the profile and the default voice profile.
    - User B cannot read, update, delete, or forge User A's rows.
    - Neither user can read or write `buffer_credentials`, and neither can write `buffer_connections` or `buffer_publications`.
    - Anonymous users see nothing.
    - Both test users and their data are deleted afterwards.
  - **Full flow on Gemini (5 AI calls, no schema or prompt failures):**
    - Radar from the URL `postgresql.org/about/news/postgresql-18-released-3142/`: 1 discovery, relevance 82.
    - Research report: 7 claims, all 7 supporting passages verified verbatim in the source.
    - A typed perspective was saved.
    - Generated a LinkedIn draft (1,420 chars) and an X thread; both used only the stated perspective.
    - Guardian: LinkedIn passed; X passed with one rule note (only the first post of a thread goes to Buffer).
  - **Buffer (personal API key):**
    - `account`, `channels` (every queried field accepted) and `posts` all work.
    - Connect stored the key encrypted and synced 2 channels (X, LinkedIn).
    - A real LinkedIn **draft** was created: Buffer post ID `6af7c8fe97efac0554d2d982`, ledger row `a7e2ed0c-f261-4fad-96ce-27800a675f6b`. Reading drafts back from Buffer confirmed it.
    - Re-submitting the same approval key returned the recorded result and created no duplicate.
  - **Bug fixed:** the "exceeds the platform limit" note measured the joined X thread instead of each post.
- **2026-11-14: the AI provider was switched to Gemini free tier (TD-019).** One real `generateStructured` call (`analyzeWritingSamples`, model `gemini-3.5-flash`) returned schema-valid output in about 18 s. `webResearch` reports `web_search_unavailable` without calling the provider.
- `npm test`: 7 files, 102 tests, all passing.
- `npm run lint`: clean. `npm run typecheck`: clean. `npm run build`: succeeds.
- Smoke test (production server, no env): pages redirect to `/setup`, `/setup` renders the missing configuration, OAuth routes redirect to `/setup`, and POST API calls return 503 JSON.
- A unit test found a real bug in Guardian's statistics regex (`$3.5 billion` was extracted as `$3.5 b`). Fixed.

## Next tasks (priority order)
1. Click through the same path in the browser UI on Node 22 (`npm run dev`), including the campaign step and the publish confirmation dialog.
2. Buffer: test a scheduled post (`customScheduled`). OAuth was verified live on production on 2026-11-14.
3. Add RSS discovery to the live run, then keep the live scripts as an opt-in `npm run test:live`.
4. Write a Playwright E2E for the demo path.
5. Deploy to Vercel (Node 22), set env vars, and register the production OAuth redirect URI.
6. Deferred: context monitoring, media attachments, CSV metrics import, background research jobs.
