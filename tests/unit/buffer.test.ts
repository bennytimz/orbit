import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { BUFFER_SCOPES, BufferOAuthError, buildAuthorizeUrl, codeChallengeS256, generateCodeVerifier, generateState, parseTokenResponse } from "@/lib/buffer/oauth";
import { BufferApiError, classifyGraphQLErrors, executeGraphQL } from "@/lib/buffer/client";
import { interpretCreatePayload } from "@/lib/buffer/operations";

describe("PKCE", () => {
  it("generates RFC 7636-compliant verifiers", () => {
    const v = generateCodeVerifier();
    expect(v).toMatch(/^[A-Za-z0-9\-._~]{43,128}$/);
    expect(generateCodeVerifier()).not.toBe(v);
  });

  it("derives an S256 challenge", () => {
    // RFC 7636 Appendix B test vector.
    expect(codeChallengeS256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    const v = generateCodeVerifier();
    expect(codeChallengeS256(v)).toBe(createHash("sha256").update(v).digest("base64url"));
  });

  it("generates unpredictable state", () => {
    expect(generateState()).not.toBe(generateState());
    expect(generateState().length).toBeGreaterThanOrEqual(32);
  });

  it("builds the authorize URL with minimal scopes", () => {
    const url = new URL(buildAuthorizeUrl({ clientId: "cid", redirectUri: "http://localhost:3000/api/buffer/callback", state: "st", codeChallenge: "ch" }));
    expect(url.origin + url.pathname).toBe("https://auth.buffer.com/auth");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe("ch");
    expect(url.searchParams.get("state")).toBe("st");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/buffer/callback");
    expect(url.searchParams.get("scope")?.split(" ")).toEqual([...BUFFER_SCOPES]);
    expect(BUFFER_SCOPES).not.toContain("ideas:write");
  });
});

describe("token response parsing", () => {
  it("parses a successful response", () => {
    expect(parseTokenResponse(200, { access_token: "a", refresh_token: "r", expires_in: 3600, token_type: "Bearer", scope: "posts:read" })).toEqual({
      access_token: "a",
      refresh_token: "r",
      expires_in: 3600,
      token_type: "Bearer",
      scope: "posts:read",
    });
  });

  it("surfaces OAuth errors", () => {
    try {
      parseTokenResponse(400, { error: "invalid_grant", error_description: "Code expired" });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(BufferOAuthError);
      expect((e as BufferOAuthError).oauthError).toBe("invalid_grant");
    }
  });

  it("rejects 200 responses without a token", () => {
    expect(() => parseTokenResponse(200, {})).toThrow(BufferOAuthError);
  });
});

describe("GraphQL error classification", () => {
  it.each([
    ["UNAUTHORIZED", "unauthorized"],
    ["FORBIDDEN", "forbidden"],
    ["NOT_FOUND", "not_found"],
    ["RATE_LIMIT_EXCEEDED", "rate_limited"],
    ["UNEXPECTED", "server"],
    [undefined, "graphql"],
  ])("%s -> %s", (code, kind) => {
    expect(classifyGraphQLErrors([{ message: "m", extensions: { code } }]).kind).toBe(kind);
  });
});

const respond = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers }));

describe("executeGraphQL", () => {
  it("returns data and sends a bearer token", async () => {
    const fetchImpl = respond(200, { data: { account: { id: "1" } } });
    await expect(executeGraphQL("tok", "query { account { id } }", {}, { fetchImpl })).resolves.toEqual({ account: { id: "1" } });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.buffer.com");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok");
  });

  it("treats HTTP 200 with errors as a failure", async () => {
    const fetchImpl = respond(200, { data: null, errors: [{ message: "Not authorized", extensions: { code: "UNAUTHORIZED" } }] });
    await expect(executeGraphQL("tok", "q", {}, { fetchImpl })).rejects.toMatchObject({ kind: "unauthorized" });
  });

  it("parses Retry-After on 429", async () => {
    const fetchImpl = respond(429, {}, { "retry-after": "30" });
    await expect(executeGraphQL("tok", "q", {}, { fetchImpl })).rejects.toMatchObject({ kind: "rate_limited", retryAfterSeconds: 30, ambiguous: false });
  });

  it("marks network failures on mutations as ambiguous, but not on queries", async () => {
    const fail = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(executeGraphQL("tok", "m", {}, { fetchImpl: fail, mutation: true })).rejects.toMatchObject({ kind: "network", ambiguous: true });
    await expect(executeGraphQL("tok", "q", {}, { fetchImpl: fail })).rejects.toMatchObject({ kind: "network", ambiguous: false });
  });

  it("marks 5xx and UNEXPECTED on mutations as ambiguous", async () => {
    await expect(executeGraphQL("tok", "m", {}, { fetchImpl: respond(502, { errors: [] }), mutation: true })).rejects.toMatchObject({ kind: "server", ambiguous: true });
    await expect(
      executeGraphQL("tok", "m", {}, { fetchImpl: respond(200, { errors: [{ message: "boom", extensions: { code: "UNEXPECTED" } }] }), mutation: true }),
    ).rejects.toMatchObject({ kind: "server", ambiguous: true });
  });

  it("maps 401 to unauthorized", async () => {
    const err = (await executeGraphQL("tok", "q", {}, { fetchImpl: respond(401, {}) }).catch((e: unknown) => e)) as BufferApiError;
    expect(err).toBeInstanceOf(BufferApiError);
    expect(err.kind).toBe("unauthorized");
  });
});

describe("createPost payload interpretation", () => {
  it("accepts PostActionSuccess", () => {
    const r = interpretCreatePayload({ __typename: "PostActionSuccess", post: { id: "p1", text: "t", dueAt: null, status: "draft", channelId: "c1" } });
    expect(r).toEqual({ ok: true, post: { id: "p1", text: "t", dueAt: null, status: "draft", channelId: "c1" } });
  });

  it("surfaces typed MutationError messages", () => {
    expect(interpretCreatePayload({ __typename: "MutationError", message: "Text too long" })).toEqual({ ok: false, errorType: "MutationError", message: "Text too long" });
  });

  it("never treats an empty payload as success", () => {
    expect(interpretCreatePayload(null).ok).toBe(false);
    expect(interpretCreatePayload({ __typename: "PostActionSuccess" }).ok).toBe(false);
  });
});
