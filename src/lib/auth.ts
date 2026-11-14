import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/domain";

export interface SessionContext {
  userId: string;
  email: string | null;
  supabase: SupabaseClient;
}

/**
 * Data Access Layer entry point. Validates the session server-side (getUser
 * contacts Supabase Auth, so a forged cookie cannot pass) and returns a
 * user-scoped client. Cached per request.
 */
export const getSession = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { userId: data.user.id, email: data.user.email ?? null, supabase };
});

/** For pages: redirect to login when there is no session. */
export async function requireUser(): Promise<SessionContext> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("You need to be signed in.");
    this.name = "UnauthorizedError";
  }
}

/** For server actions and route handlers: throw instead of redirecting. */
export async function requireUserForAction(): Promise<SessionContext> {
  const session = await getSession();
  if (!session) throw new UnauthorizedError();
  return session;
}

export const getProfile = cache(async (): Promise<Profile | null> => {
  const session = await getSession();
  if (!session) return null;
  const { data } = await session.supabase.from("profiles").select("*").eq("user_id", session.userId).maybeSingle();
  return (data as Profile | null) ?? null;
});
