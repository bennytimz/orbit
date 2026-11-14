# Build Progress

_Last updated: 2026-11-14_

## Status summary
The whole mandatory workflow is implemented in code and builds:

Radar → research report → Develop My Perspective (text/voice) → Studio generation → Guardian → campaign → Buffer connection → approved Buffer post/draft/schedule

`tsc`, `eslint`, `next build`, and 102 unit tests pass. **Supabase and Buffer have not been exercised live yet.** The AI provider (Gemini) is verified with one real call. See KNOWN_LIMITATIONS.md.

## Completed
| Area | What exists | Verified by |
| --- | --- | --- |
| Foundation | Next 16 app, Tailwind 4, shadcn (Base UI), dark design tokens, proxy, `/setup` config page, loading/error/404 states | build, smoke test |
| Database | Full schema plus RLS migration (26 tables), `handle_new_user` trigger, isolated `buffer_credentials` | **not applied live** |
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
| Command Center | Pipeline counts, top discoveries, Guardian alerts, ready-for-review, upcoming (ledger), campaigns, quick actions | typecheck |
| Memory / Settings | Inspect/edit/delete identity, voice, preferences, knowledge; integration status, privacy, account deletion | typecheck |

## Test status
- **2026-11-14: the AI provider was switched to Gemini free tier (TD-019).** One real `generateStructured` call (`analyzeWritingSamples`, model `gemini-3.5-flash`) returned schema-valid output in about 18 s. `webResearch` reports `web_search_unavailable` without calling the provider.
- `npm test`: 7 files, 102 tests, all passing.
- `npm run lint`: clean. `npm run typecheck`: clean. `npm run build`: succeeds.
- Smoke test (production server, no env): pages redirect to `/setup`, `/setup` renders the missing configuration, OAuth routes redirect to `/setup`, and POST API calls return 503 JSON.
- A unit test found a real bug in Guardian's statistics regex (`$3.5 billion` was extracted as `$3.5 b`). Fixed.

## Next tasks (priority order)
1. Apply the migration to a Supabase project and test sign-up, the profile trigger, and RLS isolation with two users.
2. With `GEMINI_API_KEY` (already set), run Radar (URLs/RSS) → report → perspective → generation → Guardian live, and fix any schema or prompt issues. Update the stale "ANTHROPIC_API_KEY" wording in UI notices and Settings.
3. Connect a real Buffer account (API key first, then OAuth). Verify `account`/`channels`/`posts`/`createPost` against the live schema, then create a real draft and a scheduled post.
4. Write a Playwright E2E for the demo path.
5. Deploy to Vercel (Node 22), set env vars, and register the production OAuth redirect URI.
6. Deferred: context monitoring, media attachments, CSV metrics import, background research jobs.
