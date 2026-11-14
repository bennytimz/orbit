import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { bufferOAuthConfig } from "@/lib/env";
import { decrypt, encrypt, parseKey } from "@/lib/security/crypto";
import type { BufferConnection } from "@/types/domain";
import { BufferOAuthError, refreshAccessToken, type TokenResponse } from "./oauth";

/**
 * Encrypted credential storage. Only the service-role client touches
 * buffer_credentials; callers must pass the authenticated user's id, and every
 * query is filtered by it.
 */

export class BufferNotConnectedError extends Error {
  constructor(message = "Buffer is not connected.") {
    super(message);
    this.name = "BufferNotConnectedError";
  }
}

export class BufferReauthRequiredError extends Error {
  constructor(message = "Your Buffer connection needs to be renewed.") {
    super(message);
    this.name = "BufferReauthRequiredError";
  }
}

function key() {
  return parseKey(process.env.BUFFER_TOKEN_ENCRYPTION_KEY);
}

/** Additional authenticated data binds a ciphertext to its owner and purpose. */
const aad = (userId: string, kind: "access" | "refresh") => `orbit:buffer:${userId}:${kind}`;

export async function saveConnection(params: {
  userId: string;
  authType: "oauth" | "api_key";
  tokens: TokenResponse;
  account: { id: string; email: string | null };
  organizations: { id: string; name: string }[];
}): Promise<BufferConnection> {
  const admin = createAdminClient();
  const k = key();
  const org = params.organizations[0] ?? null;
  const expiresAt = params.tokens.expires_in ? new Date(Date.now() + params.tokens.expires_in * 1000).toISOString() : null;

  const { data: conn, error } = await admin
    .from("buffer_connections")
    .upsert(
      {
        user_id: params.userId,
        auth_type: params.authType,
        account_id: params.account.id,
        account_email: params.account.email,
        organization_id: org?.id ?? null,
        organization_name: org?.name ?? null,
        organizations: params.organizations,
        scopes: params.tokens.scope ? params.tokens.scope.split(/\s+/) : [],
        token_expires_at: expiresAt,
        status: "active",
        last_error: null,
        connected_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )
    .select("*")
    .single();
  if (error || !conn) throw new Error(`Could not save Buffer connection: ${error?.message}`);

  const { error: credError } = await admin.from("buffer_credentials").upsert(
    {
      connection_id: conn.id,
      user_id: params.userId,
      encrypted_access_token: encrypt(params.tokens.access_token, k, aad(params.userId, "access")),
      encrypted_refresh_token: params.tokens.refresh_token ? encrypt(params.tokens.refresh_token, k, aad(params.userId, "refresh")) : null,
      refresh_lock_until: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "connection_id" },
  );
  if (credError) throw new Error(`Could not store Buffer credentials: ${credError.message}`);
  return conn as BufferConnection;
}

export async function getConnection(userId: string): Promise<BufferConnection | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("buffer_connections").select("*").eq("user_id", userId).maybeSingle();
  return (data as BufferConnection | null) ?? null;
}

export async function markNeedsReauth(userId: string, reason: string) {
  const admin = createAdminClient();
  await admin.from("buffer_connections").update({ status: "needs_reauth", last_error: reason }).eq("user_id", userId);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Returns a valid access token, refreshing it when it expires within 2 minutes.
 * Refresh is guarded by a row lock so concurrent requests never reuse a
 * single-use refresh token.
 */
export async function getAccessToken(userId: string): Promise<{ token: string; connection: BufferConnection }> {
  const admin = createAdminClient();
  const connection = await getConnection(userId);
  if (!connection || connection.status === "disconnected") throw new BufferNotConnectedError();
  if (connection.status === "needs_reauth") throw new BufferReauthRequiredError();
  const k = key();

  for (let attempt = 0; attempt < 6; attempt++) {
    const { data: cred } = await admin.from("buffer_credentials").select("*").eq("connection_id", connection.id).eq("user_id", userId).maybeSingle();
    if (!cred) throw new BufferNotConnectedError();

    const { data: fresh } = await admin.from("buffer_connections").select("token_expires_at").eq("id", connection.id).single();
    const expiresAt = fresh?.token_expires_at ? new Date(fresh.token_expires_at).getTime() : null;
    const needsRefresh = expiresAt !== null && expiresAt - Date.now() < 120_000;

    if (!needsRefresh) {
      return { token: decrypt(cred.encrypted_access_token, k, aad(userId, "access")), connection };
    }
    if (!cred.encrypted_refresh_token) {
      await markNeedsReauth(userId, "Access token expired and no refresh token is available.");
      throw new BufferReauthRequiredError();
    }

    // Claim the refresh lock atomically.
    const nowIso = new Date().toISOString();
    const { data: claimed } = await admin
      .from("buffer_credentials")
      .update({ refresh_lock_until: new Date(Date.now() + 30_000).toISOString() })
      .eq("connection_id", connection.id)
      .or(`refresh_lock_until.is.null,refresh_lock_until.lt.${nowIso}`)
      .select("connection_id");
    if (!claimed || claimed.length === 0) {
      await sleep(1000); // another request is refreshing; re-read afterwards
      continue;
    }

    try {
      const { clientId, clientSecret } = bufferOAuthConfig();
      const tokens = await refreshAccessToken({
        clientId,
        clientSecret,
        refreshToken: decrypt(cred.encrypted_refresh_token, k, aad(userId, "refresh")),
      });
      await admin
        .from("buffer_credentials")
        .update({
          encrypted_access_token: encrypt(tokens.access_token, k, aad(userId, "access")),
          encrypted_refresh_token: tokens.refresh_token ? encrypt(tokens.refresh_token, k, aad(userId, "refresh")) : cred.encrypted_refresh_token,
          refresh_lock_until: null,
          updated_at: new Date().toISOString(),
        })
        .eq("connection_id", connection.id);
      await admin
        .from("buffer_connections")
        .update({
          token_expires_at: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null,
          status: "active",
          last_error: null,
        })
        .eq("id", connection.id);
      return { token: tokens.access_token, connection };
    } catch (error) {
      await admin.from("buffer_credentials").update({ refresh_lock_until: null }).eq("connection_id", connection.id);
      if (error instanceof BufferOAuthError) {
        await markNeedsReauth(userId, `Token refresh failed (${error.oauthError}).`);
        throw new BufferReauthRequiredError();
      }
      throw error;
    }
  }
  throw new Error("Timed out waiting for Buffer token refresh.");
}

export async function deleteConnection(userId: string) {
  const admin = createAdminClient();
  // Cascades to buffer_credentials and buffer_channels. Publication history is kept.
  await admin.from("buffer_connections").delete().eq("user_id", userId);
}
