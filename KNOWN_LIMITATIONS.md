# Known Limitations

## Live verification outstanding (no credentials in this environment)
- **Supabase**: The migration (`supabase/migrations/20261114000000_orbit_core.sql`) has not been applied to a live database. Local `supabase start` was attempted, but the OS killed it for low memory. RLS policies are therefore untested against a real Postgres.
- **AI provider (Gemini free tier)**: On 2026-11-14, voice analysis, URL discovery, the research report, LinkedIn and X generation, and Guardian each ran live once on `gemini-3.5-flash`, all with schema-valid output (see BUILD_PROGRESS.md). That is one sample per prompt, so quality across many topics has not been measured. RSS discovery, AI rewrite and adaptation, perspective questions and preference analysis haven't run live yet.
- **Buffer**: The personal-API-key path is verified live: `account`, `channels`, `posts`, and `createPost` in draft mode, plus idempotent re-submission. Not yet run live: OAuth (no client credentials), queue and custom scheduling, and the error paths of real `createPost` calls.
- **Deepgram**: Transcription is untested live.
- **End-to-end tests**: There are no browser E2E tests. Live runs call engine and server code directly and are not checked in, and the UI has not been clicked through against live services.

## Product limitations
- **No web search discovery**: With the Gemini provider, Radar's "Web search" tab returns a clear "web search unavailable" message. Discovery works from submitted URLs and RSS/Atom feeds only. Radar opens on "From URLs", and the Web search tab explains that it is unavailable instead of offering a button.
- **Free-tier quotas**: Gemini free-tier requests are rate-limited per minute and per day, and they surface as "rate limit or free-tier quota reached". Google's free-tier terms allow submitted content to be used to improve their products, so do not process confidential material on the free tier.
- **Model availability**: Google retires model aliases for new users (e.g. `gemini-2.5-flash`). If the default stops working, set `GEMINI_MODEL`.
- **Media**: No image or video upload, and nothing is attached to Buffer posts. Instagram (and any other media-required channel) is blocked at preflight. Studio produces a clearly labelled *visual brief* instead of images. Image generation is not implemented.
- **Threads**: X threads can be drafted, but only the first post is sent to Buffer.
- **Content Items** (Buffer, experimental) are not used. Each channel is a separate `createPost`.
- **Editing or deleting Buffer posts** is not implemented. Changing a campaign date changes only ORBIT's plan.
- **Analytics**: No engagement metrics are available, because Buffer's public API does not expose them. There is no manual or CSV metric import yet.
- **Context monitoring** (Guardian detecting that scheduled content became outdated) is not implemented. Guardian marks content `stale` after edits, and that is all.
- **Background jobs**: Research runs inside the request, which can take up to about 60 s. There is no job queue or scheduled Radar scans; feeds are scanned on demand.
- **Rate limiting**: Only provider limits apply. There is no application-level rate limiting.
- **Platform limits** (`src/engines/studio/platforms.ts`) reflect commonly documented values and should be re-verified against each platform's current documentation.
- **Statistic matching**: Guardian's "number not in sources" check is substring-based, so "40" also matches "1400". It is a hint, not proof.
- **Node 22 required**: on Node 20, the installed `@supabase/supabase-js` throws "native WebSocket not found" as soon as a client is created, so every Supabase call would fail at runtime. `next build` still passes because it renders no pages. `package.json` `engines` and `.nvmrc` now pin Node 22 (`nvm install 22 && nvm use 22`).
- **Single voice profile**: There is one default voice profile per user. There is no multi-brand support.
