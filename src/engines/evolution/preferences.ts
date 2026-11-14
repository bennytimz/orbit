import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateStructured } from "@/lib/ai/client";
import { AIServiceError } from "@/lib/ai/errors";
import type { UserFeedback, UserPreference } from "@/types/domain";

const SuggestionSchema = z.object({
  suggestions: z.array(
    z.object({
      preference_key: z.string(),
      preference_value: z.string(),
      rationale: z.string(),
      confidence: z.enum(["low", "medium", "high"]),
      evidence_count: z.number(),
    }),
  ),
});

/**
 * Compares AI drafts with the user's edited versions and proposes possible
 * recurring preferences. Suggestions are stored with status "suggested" and
 * never affect generation until the user explicitly accepts them.
 */
export async function suggestPreferencesFromEdits(supabase: SupabaseClient, userId: string): Promise<UserPreference[]> {
  const { data } = await supabase
    .from("user_feedback")
    .select("*")
    .eq("user_id", userId)
    .eq("analyzed", false)
    .in("feedback_type", ["edit", "reject", "explicit"])
    .order("created_at", { ascending: false })
    .limit(20);
  const feedback = ((data as UserFeedback[] | null) ?? []).filter(
    (f) => f.feedback_type !== "edit" || (f.original_content && f.edited_content && f.original_content.trim() !== f.edited_content.trim()),
  );
  if (feedback.length < 2) {
    throw new AIServiceError("bad_request", "ORBIT needs at least two edits or feedback notes before it can suggest patterns. Edit a few AI drafts first.");
  }
  const { data: existing } = await supabase.from("user_preferences").select("preference_key, preference_value, status").eq("user_id", userId);

  const out = await generateStructured({
    schema: SuggestionSchema,
    effort: "medium",
    maxTokens: 6000,
    system: `You study how a user edits AI drafts to find RECURRING writing preferences. Only propose a preference if it appears in at least two separate edits or is stated explicitly in feedback. A single edit is often a one-off choice — do not generalize from it.
Each suggestion: short key (e.g. "sentence_length", "opening_style", "avoid_phrase"), a concrete value phrased as an instruction, rationale citing the evidence, confidence, and evidence_count. Don't repeat preferences that already exist. Return an empty list if nothing recurs.`,
    prompt: `Existing preferences (do not repeat):
${((existing ?? []) as { preference_key: string; preference_value: string; status: string }[]).map((p) => `- ${p.preference_key}: ${p.preference_value} (${p.status})`).join("\n") || "none"}

Feedback records:
${feedback
  .map((f, i) =>
    f.feedback_type === "edit"
      ? `<edit n="${i + 1}">\n<ai_draft>${(f.original_content ?? "").slice(0, 2500)}</ai_draft>\n<user_version>${(f.edited_content ?? "").slice(0, 2500)}</user_version>\n</edit>`
      : `<feedback n="${i + 1}" type="${f.feedback_type}">${(f.feedback_text ?? "").slice(0, 1000)}</feedback>`,
  )
  .join("\n")}`,
  });

  const rows = out.suggestions
    .filter((s) => s.evidence_count >= 2 || s.confidence !== "low")
    .slice(0, 6)
    .map((s) => ({
      user_id: userId,
      preference_key: s.preference_key.slice(0, 80),
      preference_value: s.preference_value.slice(0, 500),
      rationale: `${s.rationale} (observed in ${s.evidence_count} record${s.evidence_count === 1 ? "" : "s"})`,
      source: "inferred_from_edits" as const,
      confidence: s.confidence,
      user_confirmed: false,
      status: "suggested" as const,
    }));
  await supabase.from("user_feedback").update({ analyzed: true }).in("id", feedback.map((f) => f.id)).eq("user_id", userId);
  if (!rows.length) return [];
  const { data: inserted, error } = await supabase.from("user_preferences").insert(rows).select("*");
  if (error) throw new Error(`Could not save suggestions: ${error.message}`);
  return (inserted as UserPreference[]) ?? [];
}
