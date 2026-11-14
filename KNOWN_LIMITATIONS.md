# Known Limitations

## Live verification outstanding (no credentials in this environment)
- **Supabase**: The migration (`supabase/migrations/20261114000000_orbit_core.sql`) has not been applied to a live database. Local `supabase start` was attempted, but the OS killed it for low memory. RLS policies are therefore untested against a real Postgres.
- **AI provider (Gemini free tier)**: The provider was verified with one real structured-output call on 2026-11-14 (see TD-019). The full engine prompts (discovery analysis, research reports, generation, Guardian, voice analysis) have not yet run end to end against Gemini, and output quality may differ from the Claude models the prompts were written for.
- **Buffer**: There are no OAuth client credentials and no API key, so no real `account`, `channels`, `posts`, or `createPost` call has run. GraphQL operations were written against the docs (TD-008) and unit-tested with mocked responses only.
  - `createPost` omits `assets` and `needsApproval`. If the live schema requires either, add it in `src/lib/buffer/operations.ts`.
  - The `posts` query's `filter`/`sort` shape and the `channels` fields (`isDisconnected`, `isLocked`, `isQueuePaused`, `avatar`, `displayName`) need confirming against the live schema.
- **Deepgram**: Transcription is untested live.
- **End-to-end tests**: None yet. The workflow is verified only by typecheck, lint, the build, unit tests, and an unconfigured smoke test.

## Product limitations
- **No web search discovery**: With the Gemini provider, Radar's "Web search" tab returns a clear "web search unavailable" message. Discovery works from submitted URLs and RSS/Atom feeds only. The tab is still visible in the UI; hiding it or defaulting to "From URLs" is a follow-up.
- **Free-tier quotas**: Gemini free-tier requests are rate-limited per minute and per day, and they surface as "rate limit or free-tier quota reached". Google's free-tier terms allow submitted content to be used to improve their products, so do not process confidential material on the free tier.
- **Stale provider wording**: Several in-app notices and the Settings page still say "ANTHROPIC_API_KEY" or "Anthropic Claude". The gating behind them now follows GEMINI_API_KEY, but the text is out of date.
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
- **Node 20**: `@supabase/supabase-js` warns that Node ≤ 20 is deprecated. Use Node 22+ for deployment.
- **Single voice profile**: There is one default voice profile per user. There is no multi-brand support.
