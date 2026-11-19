import { randomBytes } from "node:crypto";
import { encrypt, parseKey } from "../../src/lib/security/crypto";
import globalTeardown from "./global-teardown";
import { adminClient, writeState } from "./support";

/**
 * Creates a throwaway, fully onboarded ORBIT user with a fake Buffer API-key
 * connection (two mocked channels). Production and local share one Supabase
 * database, so the user is unique per run and deleted in global teardown.
 * The Buffer token is a dummy: the test server's mock answers every Buffer call.
 */
export default async function globalSetup() {
  await globalTeardown(); // remove a user left behind by an interrupted run
  const admin = adminClient();
  const email = `orbit-e2e-${randomBytes(4).toString("hex")}@example.com`;
  const password = randomBytes(18).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "E2E Founder" } });
  if (error || !data.user) throw new Error(`E2E setup: could not create test user: ${error?.message}`);
  const userId = data.user.id;
  writeState({ userId, email, password });

  const fail = (what: string, e: { message: string } | null) => {
    if (e) throw new Error(`E2E setup: ${what}: ${e.message}`);
  };

  fail(
    "profile",
    (
      await admin
        .from("profiles")
        .update({
          full_name: "E2E Founder",
          profession: "Founder",
          industry: "Developer tools",
          target_audience: "Early-stage technical founders",
          preferred_platforms: ["linkedin", "x"],
          timezone: "Africa/Lagos",
          onboarding_completed_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
    ).error,
  );

  const org = { id: "org_e2e", name: "E2E Organization" };
  const { data: conn, error: connError } = await admin
    .from("buffer_connections")
    .insert({
      user_id: userId,
      auth_type: "api_key",
      account_id: "acct_e2e",
      account_email: "e2e@example.com",
      organization_id: org.id,
      organization_name: org.name,
      organizations: [org],
      scopes: [],
      status: "active",
    })
    .select("id")
    .single();
  fail("buffer connection", connError);
  const key = parseKey(process.env.BUFFER_TOKEN_ENCRYPTION_KEY);
  fail(
    "buffer credentials",
    (
      await admin.from("buffer_credentials").insert({
        connection_id: conn!.id,
        user_id: userId,
        encrypted_access_token: encrypt("e2e-dummy-token", key, `orbit:buffer:${userId}:access`),
      })
    ).error,
  );
  fail(
    "buffer channels",
    (
      await admin.from("buffer_channels").insert([
        { user_id: userId, buffer_connection_id: conn!.id, channel_id: "ch_e2e_linkedin", organization_id: org.id, name: "e2e-linkedin", display_name: "E2E LinkedIn", service: "linkedin" },
        { user_id: userId, buffer_connection_id: conn!.id, channel_id: "ch_e2e_x", organization_id: org.id, name: "e2e_x", display_name: "E2E X", service: "twitter" },
      ])
    ).error,
  );
}
