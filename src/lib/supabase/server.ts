import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { requireEnv, supabaseConfig } from "@/lib/env";

/** User-scoped client: every query runs under the signed-in user's RLS policies. */
export async function createClient(): Promise<SupabaseClient> {
  const { url, anonKey } = supabaseConfig();
  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component; the proxy refreshes the session instead.
        }
      },
    },
  });
}

/**
 * Service-role client. Bypasses RLS — use ONLY in trusted server code for data
 * that users must never reach directly (encrypted Buffer credentials, the
 * publication ledger). Always filter by the authenticated user's id.
 */
export function createAdminClient(): SupabaseClient {
  const { url } = supabaseConfig();
  return createSupabaseClient(url, requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
