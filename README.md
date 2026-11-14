# ORBIT

**Everything happening around you. Turned into something worth saying.**

ORBIT is a content-intelligence and distribution platform. It discovers developments relevant to you and builds source-backed research. It captures your own perspective (by text or voice) and drafts platform-specific content in your voice. Before anything ships, it checks the drafts for unsupported claims and other problems, organizes them into campaigns, and sends approved posts to your channels through Buffer.

```
Radar → Research → Develop My Perspective → Studio → Guardian → Campaigns → Buffer
```

## Stack

- Next.js 16 (App Router, `src/proxy.ts`), React 19, TypeScript (strict), Tailwind CSS 4, shadcn/ui (Base UI), Lucide icons
- Supabase Postgres + Auth, with row-level security on every user-owned table
- Anthropic Claude (`claude-opus-5-5` by default) for analysis and drafting, plus Anthropic web search as the research provider
- Buffer GraphQL API (`https://api.buffer.com`), using OAuth 2.0 + PKCE or a personal API key
- Deepgram for optional voice-note transcription
- Vitest for unit tests

## Getting started

```bash
npm install
cp .env.example .env.local      # fill in values (see below)
npx supabase link --project-ref <ref> && npx supabase db push   # or: npx supabase start (local, needs Docker)
npm run dev
```

Open http://localhost:3000. If configuration is missing, ORBIT redirects to `/setup`, which lists what is needed.

### Required configuration

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Auth and database |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only: Buffer credentials, publishing ledger, account deletion |
| `ANTHROPIC_API_KEY` | Discovery, research reports, drafting, Guardian AI review |
| `BUFFER_TOKEN_ENCRYPTION_KEY` | AES-256-GCM key for stored Buffer tokens (32 bytes, base64/hex) |
| `BUFFER_CLIENT_ID`, `BUFFER_CLIENT_SECRET` | Optional: Buffer OAuth. Without them, use a personal API key |
| `TRANSCRIPTION_API_KEY` | Optional: Deepgram transcription |

Register the Buffer OAuth redirect URI exactly as `${NEXT_PUBLIC_APP_URL}/api/buffer/callback`.

Configure the Supabase Auth site URL and redirect URLs to include `${NEXT_PUBLIC_APP_URL}/auth/callback`.

## Scripts

| Command | |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm test` | Unit tests (Vitest) |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |

## Safety guarantees

- Nothing is sent to Buffer without an explicit final approval (`approved: true` is enforced server-side). Every attempt is recorded per channel in an idempotent ledger. Uncertain outcomes are reconciled with Buffer before any retry.
- Sources come only from what was actually retrieved. Quoted passages are checked verbatim against the fetched source text.
- AI never invents personal experiences or opinions. Your perspective responses are the only source of first-person content.
- AI rewrites are suggestions shown side by side. Applying one saves a version first.
- Tokens are encrypted at rest with AES-256-GCM, held in a table that no client session can read, and never sent to the browser or logged.

Project tracking files: `BUILD_PROGRESS.md`, `TECHNICAL_DECISIONS.md`, `KNOWN_LIMITATIONS.md`, `SESSION_HANDOFF.md`.
