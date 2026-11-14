import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { KnowledgeEntry, Profile, UserInterest, UserPreference, VoiceProfile } from "@/types/domain";

export interface UserContext {
  profile: Profile | null;
  interests: UserInterest[];
  voice: VoiceProfile | null;
  knowledge: KnowledgeEntry[];
  preferences: UserPreference[];
}

/** Loads the identity context shared by Radar, Studio, Guardian and Evolution. */
export async function loadUserContext(supabase: SupabaseClient, userId: string): Promise<UserContext> {
  const [profile, interests, voice, knowledge, preferences] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("user_interests").select("*").eq("user_id", userId).order("priority"),
    supabase.from("voice_profiles").select("*").eq("user_id", userId).eq("is_default", true).maybeSingle(),
    supabase
      .from("knowledge_entries")
      .select("*")
      .eq("user_id", userId)
      .eq("approved_by_user", true)
      .order("updated_at", { ascending: false })
      .limit(40),
    supabase.from("user_preferences").select("*").eq("user_id", userId).eq("status", "accepted").eq("user_confirmed", true),
  ]);
  return {
    profile: (profile.data as Profile | null) ?? null,
    interests: (interests.data as UserInterest[] | null) ?? [],
    voice: (voice.data as VoiceProfile | null) ?? null,
    knowledge: (knowledge.data as KnowledgeEntry[] | null) ?? [],
    preferences: (preferences.data as UserPreference[] | null) ?? [],
  };
}

function line(label: string, value: string | null | undefined | string[]): string | null {
  if (Array.isArray(value)) return value.length ? `${label}: ${value.join(", ")}` : null;
  return value && value.trim() ? `${label}: ${value.trim()}` : null;
}

/** Identity block for prompts. Only user-provided or user-confirmed data is included. */
export function describeIdentity(ctx: UserContext): string {
  const p = ctx.profile;
  const lines = [
    line("Name", p?.full_name),
    line("Profession / role", p?.profession),
    line("Industry", p?.industry),
    line("Organization", p?.organization),
    line("Bio", p?.bio),
    line("Expertise", p?.expertise ?? []),
    line("Target audience", p?.target_audience),
    line("Content objectives", p?.content_objectives ?? []),
    line(
      "Interests",
      ctx.interests.map((i) => (i.priority === 1 ? `${i.topic} (high priority)` : i.topic)),
    ),
  ].filter(Boolean);
  return lines.length ? lines.join("\n") : "The user has not provided profile details yet.";
}

export function describeVoice(ctx: UserContext): string {
  const v = ctx.voice;
  if (!v) return "No voice profile configured. Write in a clear, natural, professional voice.";
  const lines = [
    line("Tone", v.tone),
    line("Formality", v.formality),
    line("Personality", v.personality),
    line("Vocabulary", v.vocabulary),
    line("Sentence length", v.sentence_length),
    line("Humor", v.humor),
    line("Technical depth", v.technical_depth),
    line("Writing preferences", v.writing_preferences),
    line("Never use these words/phrases", v.words_to_avoid),
    line("Preferred calls to action", v.preferred_ctas),
  ].filter(Boolean);
  const prefs = ctx.preferences.map((p) => `- ${p.preference_key}: ${p.preference_value}`);
  return [
    lines.length ? lines.join("\n") : "Voice profile is mostly empty. Write in a clear, natural, professional voice.",
    prefs.length ? `User-confirmed writing preferences:\n${prefs.join("\n")}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function describeKnowledge(ctx: UserContext, limit = 15): string {
  if (!ctx.knowledge.length) return "None recorded.";
  return ctx.knowledge
    .slice(0, limit)
    .map((k) => `- [${k.category}] ${k.title}: ${k.content.slice(0, 400)}`)
    .join("\n");
}
