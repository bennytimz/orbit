"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserForAction } from "@/lib/auth";
import { ok, runAction, fail, type ActionResult } from "@/lib/action-result";
import { createAdminClient } from "@/lib/supabase/server";
import { analyzeWritingSamples } from "@/engines/brain/perspective";
import type { KnowledgeEntry, UserInterest, UserPreference, VoiceProfile, WritingSample } from "@/types/domain";

const list = (max: number) => z.array(z.string().trim().min(1).max(120)).max(max);
const optionalText = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));

const ProfileInput = z.object({
  full_name: optionalText(120),
  profession: optionalText(160),
  industry: optionalText(160),
  organization: optionalText(160),
  bio: optionalText(2000),
  target_audience: optionalText(1000),
  expertise: list(20),
  preferred_platforms: list(10),
  content_objectives: list(10),
  timezone: z.string().trim().min(1).max(64),
});

function validTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function saveProfile(input: z.input<typeof ProfileInput>, completeOnboarding = false): Promise<ActionResult> {
  return runAction("Could not save your profile.", async () => {
    const { supabase, userId } = await requireUserForAction();
    const data = ProfileInput.parse(input);
    if (!validTimezone(data.timezone)) return fail("Unknown timezone.");
    const { error } = await supabase
      .from("profiles")
      .update({ ...data, ...(completeOnboarding ? { onboarding_completed_at: new Date().toISOString() } : {}) })
      .eq("user_id", userId);
    if (error) throw error;
    revalidatePath("/", "layout");
    return ok(undefined, "Profile saved.");
  });
}

export async function setInterests(topics: { topic: string; priority: number }[]): Promise<ActionResult<UserInterest[]>> {
  return runAction("Could not save interests.", async () => {
    const { supabase, userId } = await requireUserForAction();
    const parsed = z.array(z.object({ topic: z.string().trim().min(1).max(200), priority: z.number().int().min(1).max(3) })).max(30).parse(topics);
    const unique = [...new Map(parsed.map((t) => [t.topic.toLowerCase(), t])).values()];
    await supabase.from("user_interests").delete().eq("user_id", userId);
    if (!unique.length) return ok([]);
    const { data, error } = await supabase.from("user_interests").insert(unique.map((t) => ({ ...t, user_id: userId }))).select("*");
    if (error) throw error;
    revalidatePath("/voice");
    return ok((data as UserInterest[]) ?? [], "Interests saved.");
  });
}

const VoiceInput = z.object({
  tone: optionalText(300),
  formality: optionalText(300),
  personality: optionalText(500),
  vocabulary: optionalText(500),
  sentence_length: optionalText(300),
  humor: optionalText(300),
  technical_depth: optionalText(300),
  writing_preferences: optionalText(2000),
  words_to_avoid: z.array(z.string().trim().min(1).max(80)).max(60),
  preferred_ctas: z.array(z.string().trim().min(1).max(200)).max(20),
});

export async function saveVoice(input: z.input<typeof VoiceInput>): Promise<ActionResult> {
  return runAction("Could not save your voice profile.", async () => {
    const { supabase, userId } = await requireUserForAction();
    const data = VoiceInput.parse(input);
    const { data: existing } = await supabase.from("voice_profiles").select("id").eq("user_id", userId).eq("is_default", true).maybeSingle();
    const { error } = existing
      ? await supabase.from("voice_profiles").update(data).eq("id", existing.id).eq("user_id", userId)
      : await supabase.from("voice_profiles").insert({ ...data, user_id: userId, is_default: true });
    if (error) throw error;
    revalidatePath("/voice");
    return ok(undefined, "Voice profile saved.");
  });
}

export async function addWritingSample(input: { title?: string; body: string; sample_type?: string }): Promise<ActionResult<WritingSample>> {
  return runAction("Could not save the writing sample.", async () => {
    const { supabase, userId } = await requireUserForAction();
    const data = z
      .object({ title: optionalText(200), body: z.string().trim().min(40, "Samples should be at least 40 characters.").max(20000), sample_type: z.string().trim().max(40).default("post") })
      .parse(input);
    const { data: row, error } = await supabase.from("writing_samples").insert({ ...data, user_id: userId }).select("*").single();
    if (error) throw error;
    revalidatePath("/voice");
    return ok(row as WritingSample, "Sample added.");
  });
}

export async function deleteWritingSample(id: string): Promise<ActionResult> {
  return runAction("Could not delete the sample.", async () => {
    const { supabase, userId } = await requireUserForAction();
    const { error } = await supabase.from("writing_samples").delete().eq("id", z.string().uuid().parse(id)).eq("user_id", userId);
    if (error) throw error;
    revalidatePath("/voice");
    return ok(undefined, "Sample deleted.");
  });
}

/**
 * Analyzes writing samples into a SUGGESTED voice profile. Nothing is saved:
 * the user reviews and edits the suggestion before saving it.
 */
export async function analyzeVoice(instructions: string | null): Promise<ActionResult<Awaited<ReturnType<typeof analyzeWritingSamples>>>> {
  return runAction("Voice analysis failed. Your profile has not been changed.", async () => {
    const { supabase, userId } = await requireUserForAction();
    const { data } = await supabase.from("writing_samples").select("title, body").eq("user_id", userId).order("created_at", { ascending: false }).limit(10);
    const samples = (data as { title: string | null; body: string }[] | null) ?? [];
    if (!samples.length && !instructions?.trim()) return fail("Add at least one writing sample or describe your voice first.");
    const analysis = await analyzeWritingSamples(samples, instructions?.trim() || null);
    await supabase
      .from("voice_profiles")
      .update({
        sample_analysis: { analyzed_at: new Date().toISOString(), sample_count: samples.length, observations: analysis.observations, caveats: analysis.caveats },
      })
      .eq("user_id", userId)
      .eq("is_default", true);
    return ok(analysis);
  });
}

const KnowledgeInput = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(5000),
  category: z.enum(["expertise", "observation", "opinion", "experience", "project", "fact", "preference", "topic"]),
  source_type: z.enum(["manual", "perspective", "voice", "onboarding"]).default("manual"),
  source_reference: z.string().max(500).nullable().optional(),
});

/** Knowledge entries saved by the user are explicitly confirmed by definition. */
export async function saveKnowledge(input: z.input<typeof KnowledgeInput>, id?: string): Promise<ActionResult<KnowledgeEntry>> {
  return runAction("Could not save to memory.", async () => {
    const { supabase, userId } = await requireUserForAction();
    const data = KnowledgeInput.parse(input);
    const payload = { ...data, approved_by_user: true, confidence: "confirmed" as const };
    const query = id
      ? supabase.from("knowledge_entries").update(payload).eq("id", z.string().uuid().parse(id)).eq("user_id", userId)
      : supabase.from("knowledge_entries").insert({ ...payload, user_id: userId });
    const { data: row, error } = await query.select("*").single();
    if (error) throw error;
    revalidatePath("/memory");
    revalidatePath("/voice");
    return ok(row as KnowledgeEntry, "Saved to memory.");
  });
}

export async function deleteKnowledge(id: string): Promise<ActionResult> {
  return runAction("Could not delete the entry.", async () => {
    const { supabase, userId } = await requireUserForAction();
    const { error } = await supabase.from("knowledge_entries").delete().eq("id", z.string().uuid().parse(id)).eq("user_id", userId);
    if (error) throw error;
    revalidatePath("/memory");
    return ok(undefined, "Deleted.");
  });
}

export async function addPreference(input: { preference_key: string; preference_value: string }): Promise<ActionResult<UserPreference>> {
  return runAction("Could not save the preference.", async () => {
    const { supabase, userId } = await requireUserForAction();
    const data = z.object({ preference_key: z.string().trim().min(1).max(80), preference_value: z.string().trim().min(1).max(500) }).parse(input);
    const { data: row, error } = await supabase
      .from("user_preferences")
      .insert({ ...data, user_id: userId, source: "explicit", confidence: "high", user_confirmed: true, status: "accepted" })
      .select("*")
      .single();
    if (error) throw error;
    revalidatePath("/memory");
    return ok(row as UserPreference, "Preference saved.");
  });
}

export async function reviewPreference(id: string, decision: "accepted" | "rejected", editedValue?: string): Promise<ActionResult> {
  return runAction("Could not update the preference.", async () => {
    const { supabase, userId } = await requireUserForAction();
    const update: Record<string, unknown> = { status: decision, user_confirmed: decision === "accepted" };
    if (editedValue?.trim()) update.preference_value = editedValue.trim().slice(0, 500);
    const { error } = await supabase.from("user_preferences").update(update).eq("id", z.string().uuid().parse(id)).eq("user_id", userId);
    if (error) throw error;
    revalidatePath("/memory");
    return ok(undefined, decision === "accepted" ? "Preference accepted — Studio will apply it." : "Suggestion dismissed.");
  });
}

export async function deletePreference(id: string): Promise<ActionResult> {
  return runAction("Could not delete the preference.", async () => {
    const { supabase, userId } = await requireUserForAction();
    const { error } = await supabase.from("user_preferences").delete().eq("id", z.string().uuid().parse(id)).eq("user_id", userId);
    if (error) throw error;
    revalidatePath("/memory");
    return ok(undefined, "Deleted.");
  });
}

/** Permanently deletes the account and all ORBIT data (cascades from auth.users). */
export async function deleteAccount(confirmation: string): Promise<ActionResult> {
  return runAction("Could not delete your account.", async () => {
    const { supabase, userId } = await requireUserForAction();
    if (confirmation !== "DELETE") return fail('Type "DELETE" to confirm.');
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw error;
    await supabase.auth.signOut();
    return ok(undefined, "Your account and all ORBIT data were deleted. Buffer content already sent to Buffer is not affected.");
  });
}

export async function getVoiceForEdit(): Promise<VoiceProfile | null> {
  const { supabase, userId } = await requireUserForAction();
  const { data } = await supabase.from("voice_profiles").select("*").eq("user_id", userId).eq("is_default", true).maybeSingle();
  return (data as VoiceProfile | null) ?? null;
}
