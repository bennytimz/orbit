import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { appUrl, bufferOAuthConfig } from "@/lib/env";
import { BufferOAuthError, exchangeCode } from "@/lib/buffer/oauth";
import { fetchAccount } from "@/lib/buffer/operations";
import { saveConnection } from "@/lib/buffer/credentials";
import { decrypt, parseKey, safeEqual } from "@/lib/security/crypto";
import { syncChannels } from "@/engines/publisher/publish";

const OAUTH_COOKIE = "orbit_buffer_oauth";

function done(params: Record<string, string>) {
  const url = new URL("/publishing", appUrl());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const response = NextResponse.redirect(url);
  response.cookies.set(OAUTH_COOKIE, "", { path: "/api/buffer", maxAge: 0 });
  return response;
}

/** OAuth redirect target: validates state, exchanges the code server-side, stores encrypted tokens. */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login?next=/publishing", request.url));

  const params = request.nextUrl.searchParams;
  const error = params.get("error");
  if (error) return done({ buffer_error: error === "access_denied" ? "denied" : "auth_failed" });

  const code = params.get("code");
  const state = params.get("state");
  const sealed = request.cookies.get(OAUTH_COOKIE)?.value;
  if (!code || !state || !sealed) return done({ buffer_error: "invalid_state" });

  let stored: { state: string; verifier: string; uid: string; exp: number };
  try {
    stored = JSON.parse(decrypt(sealed, parseKey(process.env.BUFFER_TOKEN_ENCRYPTION_KEY), "orbit:buffer:oauth-state"));
  } catch {
    return done({ buffer_error: "invalid_state" });
  }
  if (!safeEqual(stored.state, state) || stored.uid !== session.userId || Date.now() > stored.exp) {
    return done({ buffer_error: "invalid_state" });
  }

  try {
    const config = bufferOAuthConfig();
    const tokens = await exchangeCode({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      code,
      redirectUri: config.redirectUri,
      codeVerifier: stored.verifier,
    });
    const account = await fetchAccount(tokens.access_token);
    await saveConnection({ userId: session.userId, authType: "oauth", tokens, account, organizations: account.organizations });
    try {
      await syncChannels(session.userId);
    } catch {
      return done({ buffer: "connected", warning: "channels" });
    }
    await session.supabase.from("activity_logs").insert({ user_id: session.userId, action: "buffer_connected", resource_type: "buffer_connection", metadata: { auth_type: "oauth" } });
    return done({ buffer: "connected" });
  } catch (err) {
    console.error("[orbit] Buffer OAuth callback failed:", err instanceof BufferOAuthError ? err.oauthError : err instanceof Error ? err.message : "unknown");
    return done({ buffer_error: err instanceof BufferOAuthError ? err.oauthError : "auth_failed" });
  }
}
