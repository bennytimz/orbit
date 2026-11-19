// E2E-only fetch interceptor. Loaded into the Next.js test server through
// NODE_OPTIONS="--import ./tests/e2e/mocks/preload.mjs" by playwright.config.ts.
// It is never imported by application code and is not part of the build.
//
// - Gemini (generativelanguage.googleapis.com): schema-valid fixture JSON.
// - Buffer (api.buffer.com, auth.buffer.com): fixture GraphQL responses. createPost,
//   createIdea and createContentItem are REFUSED, so a test can never create
//   anything, even by accident.
// - https://example.com/orbit-e2e/*: a fixture article (example.com resolves
//   publicly, so ORBIT's SSRF check passes, but the request never leaves the process).
// Everything else (Supabase) passes through unchanged.

const realFetch = globalThis.fetch;
const FIXTURE_URL_PREFIX = "https://example.com/orbit-e2e/";

const ARTICLE_TEXT =
  "PostgreSQL 18 introduces an asynchronous I/O subsystem that can improve read performance by issuing multiple storage requests concurrently. " +
  "The release also adds a native uuidv7() function for timestamp-ordered UUIDs, and virtual generated columns become the default. " +
  "Administrators can choose an AIO method with the new io_method setting. Planner statistics are now preserved through major-version upgrades.";

const ARTICLE_HTML = `<!doctype html><html><head><title>PostgreSQL 18 released (E2E fixture)</title>
<meta property="og:site_name" content="ORBIT E2E Fixtures"><meta property="article:published_time" content="2026-09-25T00:00:00Z"></head>
<body><article><h1>PostgreSQL 18 released (E2E fixture)</h1>${ARTICLE_TEXT.split(". ").map((s) => `<p>${s}.</p>`).join("")}</article></body></html>`;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

async function bodyText(input, init) {
  if (init?.body && typeof init.body === "string") return init.body;
  if (input instanceof Request) return input.clone().text();
  if (init?.body instanceof Uint8Array) return new TextDecoder().decode(init.body);
  return "";
}

// ---------------------------------------------------------------- Gemini
const factor = (score, reason) => ({ score, reason });
const FIXTURES = {
  discoveries: () => ({
    discoveries: [
      {
        title: "PostgreSQL 18 adds asynchronous I/O and native UUIDv7",
        summary: "PostgreSQL 18 introduces an asynchronous I/O subsystem, native uuidv7() and virtual generated columns by default.",
        category: "product_update",
        topics: ["PostgreSQL", "databases"],
        entities: ["PostgreSQL"],
        source_ids: ["S1"],
        key_findings: [{ text: "PostgreSQL 18 introduces an asynchronous I/O subsystem.", source_ids: ["S1"], basis: "verified_in_source" }],
        why_it_matters: "Database defaults for early-stage teams are shifting.",
        content_angles: [{ angle: "Boring defaults are now fast defaults", format: "LinkedIn analysis", rationale: "Relevant to founders choosing a stack." }],
        event_date: "unknown",
        confidence: "high",
        impact_assessment: "Moderate for teams already on PostgreSQL.",
        factors: {
          interest_match: factor(80, "Matches the stated interest in databases."),
          expertise_match: factor(70, "Close to the user's engineering background."),
          audience_relevance: factor(75, "Founders choose databases early."),
          potential_impact: factor(60, "Performance gains need tuning."),
          discussion_potential: factor(65, "Defaults spark debate."),
          novelty: factor(55, "Major release."),
          source_credibility: factor(70, "Fixture source."),
        },
      },
    ],
  }),
  content_opportunities: () => ({
    title: "PostgreSQL 18: asynchronous I/O and UUIDv7",
    summary: "The release adds an asynchronous I/O subsystem, native uuidv7() and virtual generated columns by default.",
    key_findings: [{ text: "PostgreSQL 18 adds an asynchronous I/O subsystem.", source_ids: ["S1"], basis: "verified_in_source" }],
    claims: [
      {
        text: "PostgreSQL 18 adds a native uuidv7() function.",
        source_ids: ["S1"],
        supporting_passage: "The release also adds a native uuidv7() function for timestamp-ordered UUIDs",
        basis: "verified_in_source",
        confidence: "high",
      },
      { text: "Most teams will need tuning to benefit.", source_ids: [], supporting_passage: "", basis: "interpretation", confidence: "medium" },
    ],
    entities: [{ name: "PostgreSQL", type: "software", role: "subject" }],
    important_dates: [{ date: "unknown", description: "Release date not stated in the source text.", date_type: "event", source_ids: ["S1"] }],
    uncertainties: ["Only one source was available."],
    conflicts: [],
    implications: ["Default database choices for new projects may shift."],
    content_opportunities: [{ angle: "Boring defaults are now fast", format: "LinkedIn post", rationale: "Founder audience." }],
  }),
  questions: () => ({
    questions: [
      { question: "Do you agree that PostgreSQL is now the default choice for early-stage teams?", why: "Agreement or disagreement." },
      { question: "What do people overlook about asynchronous I/O?", why: "What others miss." },
    ],
  }),
  variants: () => ({
    variants: [
      {
        platform: "linkedin",
        title: "PostgreSQL 18 and boring defaults",
        body: "Most early-stage teams pick their database by habit. With PostgreSQL 18 adding an asynchronous I/O subsystem and a native uuidv7() function, the boring default keeps getting stronger.\n\nIn my view, founders should benchmark before reaching for niche databases.",
        thread_parts: [],
        source_ids_used: ["S1"],
        claims: [{ text: "PostgreSQL 18 adds a native uuidv7() function.", source_ids: ["S1"] }],
        perspective_used: ["Founders should benchmark before reaching for niche databases."],
        visual_brief: "",
        notes: "",
      },
      {
        platform: "x",
        title: "PostgreSQL 18 thread",
        body: "PostgreSQL 18 adds an asynchronous I/O subsystem.\n\nIn my view, benchmark before reaching for niche databases.",
        thread_parts: ["PostgreSQL 18 adds an asynchronous I/O subsystem.", "In my view, benchmark before reaching for niche databases."],
        source_ids_used: ["S1"],
        claims: [{ text: "PostgreSQL 18 adds an asynchronous I/O subsystem.", source_ids: ["S1"] }],
        perspective_used: ["Benchmark before reaching for niche databases."],
        visual_brief: "",
        notes: "",
      },
    ],
  }),
  other_issues: () => ({
    summary: "The factual claims match the provided source. (E2E fixture)",
    claims: [
      {
        claim: "PostgreSQL 18 adds a native uuidv7() function.",
        status: "supported",
        source_ids: ["S1"],
        supporting_passage: "The release also adds a native uuidv7() function for timestamp-ordered UUIDs",
        explanation: "Stated in the source.",
        recommended_correction: "",
      },
    ],
    other_issues: [],
  }),
};

function geminiResponse(url, text) {
  const body = JSON.parse(text || "{}");
  const schema = body.generationConfig?.responseJsonSchema ?? body.generationConfig?.responseSchema ?? {};
  const keys = Object.keys(schema.properties ?? {});
  const fixture = Object.keys(FIXTURES).find((k) => keys.includes(k));
  if (!fixture) {
    return json({ error: { code: 400, message: `E2E mock has no Gemini fixture for schema keys: ${keys.join(",")}`, status: "INVALID_ARGUMENT" } }, 400);
  }
  return json({
    candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(FIXTURES[fixture]()) }] }, finishReason: "STOP", index: 0 }],
    usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
    modelVersion: "e2e-mock",
  });
}

// ---------------------------------------------------------------- Buffer
const ORG = { id: "org_e2e", name: "E2E Organization" };
const CHANNELS = [
  { id: "ch_e2e_linkedin", name: "e2e-linkedin", displayName: "E2E LinkedIn", service: "linkedin", avatar: null, isQueuePaused: false, isDisconnected: false, isLocked: false, organizationId: ORG.id },
  { id: "ch_e2e_x", name: "e2e_x", displayName: "E2E X", service: "twitter", avatar: null, isQueuePaused: false, isDisconnected: false, isLocked: false, organizationId: ORG.id },
];

function bufferResponse(text) {
  const { query = "" } = JSON.parse(text || "{}");
  if (/\bmutation\b/.test(query)) {
    // Tests stop before approval. Refuse loudly if anything tries to write.
    return json({ errors: [{ message: "E2E mock refuses Buffer mutations.", extensions: { code: "FORBIDDEN" } }] });
  }
  if (query.includes("OrbitAccount")) return json({ data: { account: { id: "acct_e2e", email: "e2e@example.com", organizations: [ORG] } } });
  if (query.includes("OrbitChannels")) return json({ data: { channels: CHANNELS } });
  if (query.includes("posts(")) return json({ data: { posts: { edges: [], pageInfo: { hasNextPage: false, endCursor: null } } } });
  if (query.includes("ideas(")) return json({ data: { ideas: { edges: [], pageInfo: { hasNextPage: false, endCursor: null } } } });
  return json({ errors: [{ message: "E2E mock: unknown Buffer query.", extensions: { code: "UNEXPECTED" } }] });
}

globalThis.fetch = async function e2eFetch(input, init) {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    return realFetch(input, init);
  }
  if (host === "generativelanguage.googleapis.com") return geminiResponse(url, await bodyText(input, init));
  if (host === "api.buffer.com") return bufferResponse(await bodyText(input, init));
  if (host === "auth.buffer.com") return json({ error: "e2e_mock", error_description: "OAuth is not available in E2E tests." }, 400);
  if (url.startsWith(FIXTURE_URL_PREFIX)) return new Response(ARTICLE_HTML, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
  if (host === "example.com") return new Response("Not found", { status: 404 });
  return realFetch(input, init);
};

if (process.env.ORBIT_E2E_MOCK_LOG) console.log("[e2e-mock] fetch interceptor installed");
