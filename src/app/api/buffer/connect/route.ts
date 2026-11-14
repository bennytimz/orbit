import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { appUrl, bufferOAuthConfig, ConfigurationError } from "@/lib/env";
import { buildAuthorizeUrl, codeChallengeS256, generateCodeVerifier, generateState } from "@/lib/buffer/oauth";
import { encrypt, parseKey } from "@/lib/security/crypto";

const OAUTH_COOKIE = "orbit_buffer_oauth";

/** Starts Buffer OAuth (Authorization Code + PKCE). */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login?next=/publishing", request.url));

  let config;
  let key;
  try {
    config = bufferOAuthConfig();
    key = parseKey(process.env.BUFFER_TOKEN_ENCRYPTION_KEY);
  } catch (error) {
    const reason = error instanceof ConfigurationError ? error.variable : "encryption_key";
    return NextResponse.redirect(new URL(`/publishing?buffer_error=not_configured&detail=${encodeURIComponent(reason)}`, appUrl()));
  }

  const verifier = generateCodeVerifier();
  const state = generateState();
  const sealed = encrypt(
    JSON.stringify({ state, verifier, uid: session.userId, exp: Date.now() + 10 * 60_000 }),
    key,
    "orbit:buffer:oauth-state",
  );
  const response = NextResponse.redirect(
    buildAuthorizeUrl({ clientId: config.clientId, redirectUri: config.redirectUri, state, codeChallenge: codeChallengeS256(verifier) }),
  );
  response.cookies.set(OAUTH_COOKIE, sealed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/buffer",
    maxAge: 600,
  });
  return response;
}
