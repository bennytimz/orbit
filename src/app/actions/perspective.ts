"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserForAction } from "@/lib/auth";
import { fail, ok, runAction, type ActionResult } from "@/lib/action-result";
import { generatePerspectiveQuestions } from "@/engines/brain/perspective";
import type { Discovery, Perspective, ResearchReport } from "@/types/domain";

export async function getPerspectiveQuestions(discoveryId: string): Promise<ActionResult<{ question: string; why: string }[]>> {
  return runAction("Could not prepare questions. You can still write your perspective freely.", async () => {
    const { supabase, userId } = await requireUserForAction();
    const id = z.string().uuid().parse(discoveryId);
    const { data: d } = await supabase.from("discoveries").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
    if (!d) return fail("Discovery not found.");
    const { data: r } = await supabase.from("research_reports").select("*").eq("discovery_id", id).eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const questions = await generatePerspectiveQuestions(supabase, userId, d as Discovery, (r as ResearchReport | null) ?? null);
    return ok(questions);
  });
}

const PerspectiveInput = z.object({
  discoveryId: z.string().uuid().nullable(),
  question: z.string().trim().max(500).nullable(),
  content: z.string().trim().min(1, "Write or record a response first.").max(10000),
  inputType: z.enum(["text", "voice"]),
  transcript: z.string().max(20000).nullable(),
});

export async function savePerspective(input: z.input<typeof PerspectiveInput>): Promise<ActionResult<Perspective>> {
  return runAction("Could not save your perspective.", async () => {
    const { supabase, userId } = await requireUserForAction();
    const data = PerspectiveInput.parse(input);
    const { data: row, error } = await supabase
      .from("perspectives")
      .insert({ user_id: userId, discovery_id: data.discoveryId, question: data.question, content: data.content, input_type: data.inputType, transcript: data.transcript })
      .select("*")
      .single();
    if (error) throw error;
    if (data.discoveryId) revalidatePath(`/research/${data.discoveryId}`);
    return ok(row as Perspective, "Perspective saved.");
  });
}

export async function updatePerspective(id: string, content: string): Promise<ActionResult> {
  return runAction("Could not update your perspective.", async () => {
    const { supabase, userId } = await requireUserForAction();
    const { error } = await supabase
      .from("perspectives")
      .update({ content: z.string().trim().min(1).max(10000).parse(content) })
      .eq("id", z.string().uuid().parse(id))
      .eq("user_id", userId);
    if (error) throw error;
    return ok(undefined, "Updated.");
  });
}

export async function deletePerspective(id: string): Promise<ActionResult> {
  return runAction("Could not delete.", async () => {
    const { supabase, userId } = await requireUserForAction();
    const { error } = await supabase.from("perspectives").delete().eq("id", z.string().uuid().parse(id)).eq("user_id", userId);
    if (error) throw error;
    return ok(undefined, "Deleted.");
  });
}
