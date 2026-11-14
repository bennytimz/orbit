import { createHash, randomBytes } from "node:crypto";

/**
 * Buffer OAuth 2.0 Authorization Code + PKCE (required for all Buffer clients).
 * Docs: https://developers.buffer.com/guides/authentication.html
 */

export const BUFFER_AUTHORIZE_URL = "https://auth.buffer.com/auth";
export const BUFFER_TOKEN_URL = "https://auth.buffer.com/token";

/**
 * Minimum scopes for implemented operations:
 * - account:read  → account + organizations + channels
 * - posts:read    → list scheduled/draft/sent posts, reconcile ambiguous operations
 * - posts:write   → create posts and drafts
 * - ideas:write   → createIdea (Save to Buffer Ideas)
 * - offline_access → refresh token, so the connection survives the 1h access token
 */
export const BUFFER_SCOPES = ["account:read", "posts:read", "posts:write", "ideas:write", "offline_access"] as const;

export function generateCodeVerifier(): string {
  // 32 random bytes → 43-char base64url string (RFC 7636 allows 43-128).
  return randomBytes(32).toString("base64url");
}

export function codeChallengeS256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function generateState(): string {
  return randomBytes(24).toString("base64url");
}

export function buildAuthorizeUrl(params: { clientId: string; redirectUri: string; state: string; codeChallenge: string; scopes?: readonly string[] }): string {
  const url = new URL(BUFFER_AUTHORIZE_URL);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", (params.scopes ?? BUFFER_SCOPES).join(" "));
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in?: number;
  scope?: string;
}

export class BufferOAuthError extends Error {
  constructor(
    public readonly oauthError: string,
    message: string,
  ) {
    super(message);
    this.name = "BufferOAuthError";
  }
}

export function parseTokenResponse(status: number, json: unknown): TokenResponse {
  const obj = (json ?? {}) as Record<string, unknown>;
  if (status >= 400 || typeof obj.error === "string") {
    const code = typeof obj.error === "string" ? obj.error : `http_${status}`;
    const description = typeof obj.error_description === "string" ? obj.error_description : "Token request failed.";
    throw new BufferOAuthError(code, description);
  }
  if (typeof obj.access_token !== "string" || !obj.access_token) {
    throw new BufferOAuthError("invalid_response", "Buffer did not return an access token.");
  }
  return {
    access_token: obj.access_token,
    refresh_token: typeof obj.refresh_token === "string" ? obj.refresh_token : undefined,
    token_type: typeof obj.token_type === "string" ? obj.token_type : "Bearer",
    expires_in: typeof obj.expires_in === "number" ? obj.expires_in : undefined,
    scope: typeof obj.scope === "string" ? obj.scope : undefined,
  };
}

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(BUFFER_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams(body).toString(),
      signal: controller.signal,
    });
    const json = await res.json().catch(() => ({}));
    return parseTokenResponse(res.status, json);
  } finally {
    clearTimeout(timer);
  }
}

export function exchangeCode(params: { clientId: string; clientSecret?: string; code: string; redirectUri: string; codeVerifier: string }) {
  const body: Record<string, string> = {
    client_id: params.clientId,
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    code_verifier: params.codeVerifier,
  };
  if (params.clientSecret) body.client_secret = params.clientSecret;
  return postToken(body);
}

/** Refresh tokens are single-use: the response carries a new refresh token. */
export function refreshAccessToken(params: { clientId: string; clientSecret?: string; refreshToken: string }) {
  const body: Record<string, string> = {
    client_id: params.clientId,
    grant_type: "refresh_token",
    refresh_token: params.refreshToken,
  };
  if (params.clientSecret) body.client_secret = params.clientSecret;
  return postToken(body);
}
