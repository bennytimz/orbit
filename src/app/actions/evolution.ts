"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserForAction } from "@/lib/auth";
import { ok, runAction, type ActionResult } from "@/lib/action-result";
import { suggestPreferencesFromEdits } from "@/engines/evolution/preferences";

export async function analyzeMyEdits(): Promise<ActionResult<{ count: number }>> {
  return runAction("Could not analyze your edits.", async () => {
    const { supabase, userId } = await requireUserForAction();
    const suggestions = await suggestPreferencesFromEdits(supabase, userId);
    revalidatePath("/memory");
    return ok(
      { count: suggestions.length },
      suggestions.length ? `${suggestions.length} possible preference${suggestions.length === 1 ? "" : "s"} to review.` : "No recurring patterns found yet.",
    );
  });
}

export async function submitFeedback(assetId: string | null, text: string): Promise<ActionResult> {
  return runAction("Could not save feedback.", async () => {
    const { supabase, userId } = await requireUserForAction();
    const { error } = await supabase.from("user_feedback").insert({
      user_id: userId,
      content_asset_id: assetId ? z.string().uuid().parse(assetId) : null,
      feedback_type: "explicit",
      feedback_text: z.string().trim().min(1).max(2000).parse(text),
    });
    if (error) throw error;
    return ok(undefined, "Thanks — ORBIT will consider this when you next analyze your edits.");
  });
}
