"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { appUrl } from "@/lib/env";
import type { ActionResult } from "@/lib/action-result";

const Credentials = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters.").max(200),
  fullName: z.string().trim().max(120).optional(),
});

function safeNext(next: FormDataEntryValue | null): string {
  const value = typeof next === "string" ? next : "";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

export async function signIn(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const parsed = Credentials.omit({ fullName: true }).safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { ok: false, error: error.message === "Invalid login credentials" ? "Incorrect email or password." : error.message };
  redirect(safeNext(form.get("next")));
}

export async function signUp(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const parsed = Credentials.safeParse({ email: form.get("email"), password: form.get("password"), fullName: form.get("fullName") || undefined });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.fullName ?? "" }, emailRedirectTo: `${appUrl()}/auth/callback?next=/onboarding` },
  });
  if (error) return { ok: false, error: error.message };
  if (!data.session) {
    return { ok: true, data: undefined, message: "Check your email to confirm your account, then sign in." };
  }
  redirect("/onboarding");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
