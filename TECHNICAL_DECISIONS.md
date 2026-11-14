# Technical Decisions

Each entry records a decision, its rationale, and its consequences.

### TD-001 — Stack: Next.js 16 + Supabase + Anthropic + Buffer
Follows CLAUDE.md §5. Next.js server components and server actions serve as the backend, so there is no separate API service. Supabase provides Postgres, Auth, and RLS.

### TD-002 — shadcn/ui "base-nova" (Base UI primitives)
The shadcn CLI scaffolded Base UI rather than Radix. Triggers therefore use `render={<Button/>}` instead of `asChild`. Native `<select>` (the `NativeSelect` helper) is used for simple choices because it is accessible and reliable on mobile.

### TD-003 — `cacheComponents` / partial prefetching disabled
Almost every screen is per-user data read under RLS, and the gain from static shells is small. Disabling these avoids Suspense/`use cache` constraints on cookies. Pages are dynamic, and mutations call `revalidatePath`.

### TD-004 — Next 16 `proxy.ts` for session refresh and optimistic redirects
The proxy refreshes the session with `getClaims()`. Real authorization happens in the data-access layer (`src/lib/auth.ts`, `getUser()`) and in RLS. When Supabase is not configured, browser navigations go to `/setup`, and non-GET API calls get a 503.

### TD-005 — Research provider: Anthropic server-side web search + RSS + direct URLs _(web search part superseded by TD-019)_
There is no separate search API key to manage. Discovery sources are taken **only** from `web_search_result` blocks and citations returned by the tool, never from model-written text. RSS/Atom feeds and submitted URLs are fetched directly through `safeFetch`, which provides:
- SSRF protection (DNS resolution plus a private-range block on every redirect hop)
- a 2 MB cap and timeouts
- a robots.txt check

### TD-006 — AI calls: structured outputs, Zod, refusal fallback _(provider superseded by TD-019)_
All model calls live in `src/lib/ai/client.ts` and use `client.beta.messages.parse` with `betaZodOutputFormat`. Each call:
- checks `stop_reason` (refusal / max_tokens)
- re-validates output with Zod
- maps failures to `AIServiceError` with a user-safe message

The server-side refusal fallback beta (`server-side-fallback-2026-07-01`, `fallbacks: "default"`) is enabled. Retrieved content is wrapped in `<source>` tags (user text in `<user_content>`) under `UNTRUSTED_CONTENT_RULES`: it is data, never instructions.

### TD-007 — Source integrity
- Catalog IDs (S1…Sn) are validated against the sources actually retrieved; discoveries with no valid sources are dropped.
- Research claims carry `supporting_passage`, and `passage_verified` is set only when the normalized passage appears verbatim in fetched text.
- The UI separates "stated in source", "reported claim", and "AI interpretation".

### TD-008 — Buffer operations (verified against developers.buffer.com on 2026-11-13)
- Endpoint: `POST https://api.buffer.com`
- Queries used: `account`, `channels(input:{organizationId})`, `posts(first, after, input:{organizationId, filter, sort})`
- Mutation used: `createPost(input: CreatePostInput!)`, with the `PostActionSuccess` / `MutationError` union
- Drafts use `saveToDraft: true`, and scheduling uses `mode: customScheduled` plus `dueAt` (UTC)
- Errors: HTTP status and top-level `errors[].extensions.code` are both checked, and typed errors are read inside `data`
- Content Items (experimental) are not used

### TD-009 — Buffer auth: OAuth + PKCE, with a personal API key as an alternative
OAuth state, the PKCE verifier, the user ID, and an expiry are sealed with AES-GCM into an httpOnly cookie scoped to `/api/buffer`, valid for 10 minutes. The token exchange happens server-side. Requested scopes are minimal: `account:read posts:read posts:write offline_access`.

Personal API keys (officially supported by Buffer) let people connect without registering an OAuth app.

### TD-010 — Credential isolation
- Tokens are encrypted with AES-256-GCM and AAD bound to the user and token kind, using a key held in an env var.
- Encrypted tokens are stored in `buffer_credentials`: RLS is on, there are no policies, and `revoke all` from anon/authenticated means only the service role can read them.
- Connections and channels are readable by their owner but written only by the server.

### TD-011 — Single-use refresh tokens
Buffer refresh tokens are single-use, and reusing one revokes the grant. A refresh is claimed with a conditional update on `refresh_lock_until`. Concurrent requests wait and re-read the stored token instead of refreshing again.

### TD-012 — Publishing ledger and idempotency
- The client generates one idempotency key per approval, and the server derives `${key}:${channelId}`, which is unique in `buffer_publications`.
- A pending row is written before the request and finalized afterwards as succeeded, failed, or unknown.
- Network errors, 5xx responses, and UNEXPECTED errors on a mutation are recorded as **unknown**, not failed.
- "Check status" reconciles an unknown row against Buffer's posts by channel, text, and time before anyone retries.
- Each channel is a separate operation, and partial success is reported as such.

### TD-013 — Guardian = deterministic rules + AI review
Rules cover limits, placeholders, avoided words, generic phrasing, unsupported statistics and years, duplicates, missing media, and traceability. They run without AI.

The AI review classifies claims (supported / partially supported / unsupported / conflicting / unable to verify) against source text and flags experiences attributed to the user that the perspective doesn't support.

A new run marks earlier open issues `superseded` rather than "resolved". Editing marks the result `stale`.

### TD-014 — Edits and AI transforms
- Autosave runs 2.5 s after the last change, with conflict detection via `baseUpdatedAt`.
- A version snapshot is taken at most every 5 minutes during autosave and on every manual save.
- AI rewrites are suggestions shown side by side. Applying one saves a `before_ai_transform` version first.
- Restoring a version also creates a version.

### TD-015 — Preference learning requires confirmation
Edits are recorded as `user_feedback`. Analysis creates `suggested` preferences, and only accepted ones (`user_confirmed = true`) reach generation prompts.

### TD-016 — Transcription: Deepgram (optional)
Deepgram uses a simple REST upload (`nova-3`). Audio is held only in the browser until the user clicks Transcribe, and the server streams it to the provider without storing it.

### TD-017 — Threads and media
Studio supports X threads, but ORBIT sends only the first post to Buffer, and this is stated in the UI and by Guardian. There are no media uploads, so media-required platforms (Instagram) are blocked at preflight rather than sent and allowed to fail.

### TD-018 — Timezones
Timestamps are stored in UTC. The user's IANA zone lives in `profiles.timezone`. `datetime-local` input is converted with `zonedLocalToUtc`, which iterates the offset to handle DST, and is unit-tested across zones.

### TD-019 — AI provider switched to Google Gemini free tier (2026-11-14)
The project had no Anthropic credits. Only `src/lib/ai/client.ts` was rewritten; its exports and behaviour contract are unchanged:
- `generateStructured`, `webResearch`, `UNTRUSTED_CONTENT_RULES`, `Effort`, the result types, and `AIServiceError` codes all stay the same, so no engine code changed.
- `getAnthropic` remains as a deprecated alias of the new `getAIClient`.

How calls work now:
- **SDK:** `@google/genai` (`ai.models.generateContent`), using `GEMINI_API_KEY`.
- **Model:** `GEMINI_MODEL`, default `gemini-3.5-flash`. Models were probed with the project key on 2026-11-14:
  - `gemini-3.5-flash` answered in about 3 s; the API reported `modelVersion: gemini-3.6-flash`, so Google routes the alias.
  - `gemini-2.5-flash` returned 404 ("no longer available to new users").
  - `gemini-3.8-flash` and `gemini-flash-latest` did not respond within 40–120 s.
- **Structured output:** `responseMimeType: application/json` plus `responseJsonSchema` generated from the same Zod schemas with `z.toJSONSchema(schema, { io: "input" })`. The response is `JSON.parse`d, then **re-validated with Zod**, which remains the source of truth.
- **Effort mapping:** `low|medium|high` maps to `thinkingLevel` on Gemini 3+, and to `thinkingBudget` (1024/4096/8192) on Gemini 2.x. Thinking tokens count against `maxOutputTokens`, so 8192 tokens of headroom are added to each caller's budget (cap 65,536).
- **Safety and errors:**
  - `promptFeedback.blockReason` and the SAFETY/PROHIBITED_CONTENT/BLOCKLIST/SPII/RECITATION finish reasons map to `refused`; `MAX_TOKENS` maps to `truncated`.
  - `ApiError` statuses map as 401/403 → `auth_failed`, 429 → `rate_limited` (free-tier quota), 400/404 → `bad_request`, and everything else → `provider_unavailable`.
  - Each request has a 120 s timeout and 2 attempts.
  - The Anthropic server-side refusal fallback (TD-006) no longer applies.
- **Web search:** `webResearch` throws `AIServiceError("web_search_unavailable")` immediately with a user-safe message, and makes no provider call. Radar's web-search action therefore shows a clear message, and discovery uses submitted URLs and RSS/Atom feeds (fetched directly via `safeFetch`, TD-005). Gemini's Google Search grounding was deliberately not adopted here.
- **`src/lib/env.ts` (necessary companion change):**
  - adds `aiModel()` and `DEFAULT_GEMINI_MODEL`, plus `integrations().ai / aiProvider / aiModel / webSearch`
  - the temporary `anthropic` / `anthropicModel` aliases were later removed; all callers now use `integrations().ai` and `aiModel()`, and the UI wording says Gemini/`GEMINI_API_KEY`
