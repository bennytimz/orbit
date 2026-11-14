"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserForAction } from "@/lib/auth";
import { fail, ok, runAction, type ActionResult } from "@/lib/action-result";
import { DEFAULT_PHASES } from "@/engines/campaign/phases";

const Objective = z.enum([
  "product_launch",
  "brand_awareness",
  "educational",
  "thought_leadership",
  "event_promotion",
  "product_update",
  "customer_acquisition",
  "community_engagement",
  "promotional",
]);

const PhaseSchema = z.object({ key: z.string().trim().min(1).max(40), name: z.string().trim().min(1).max(80), description: z.string().trim().max(300) });

const CampaignInput = z
  .object({
    name: z.string().trim().min(1, "Give the campaign a name.").max(160),
    description: z.string().trim().max(2000).nullable(),
    objective: Objective,
    target_audience: z.string().trim().max(500).nullable(),
    status: z.enum(["planning", "active", "paused", "completed", "archived"]).default("planning"),
    phases: z.array(PhaseSchema).max(10).optional(),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  })
  .refine((c) => !c.start_date || !c.end_date || c.start_date <= c.end_date, { message: "End date must be after the start date.", path: ["end_date"] });

export async function saveCampaign(input: z.input<typeof CampaignInput>, id?: string): Promise<ActionResult<{ id: string }>> {
  return runAction("Could not save the campaign.", async () => {
    const { supabase, userId } = await requireUserForAction();
    const data = CampaignInput.parse(input);
    const payload = { ...data, phases: data.phases ?? DEFAULT_PHASES[data.objective] };
    const query = id
      ? supabase.from("campaigns").update(payload).eq("id", z.string().uuid().parse(id)).eq("user_id", userId)
      : supabase.from("campaigns").insert({ ...payload, user_id: userId });
    const { data: row, error } = await query.select("id").single();
    if (error) throw error;
    revalidatePath("/campaigns");
    revalidatePath(`/campaigns/${row.id}`);
    return ok({ id: row.id as string }, id ? "Campaign updated." : "Campaign created.");
  });
}

export async function deleteCampaign(id: string): Promise<ActionResult> {
  return runAction("Could not delete the campaign.", async () => {
    const { supabase, userId } = await requireUserForAction();
    const { error } = await supabase.from("campaigns").delete().eq("id", z.string().uuid().parse(id)).eq("user_id", userId);
    if (error) throw error;
    revalidatePath("/campaigns");
    return ok(undefined, "Campaign deleted. Its content drafts were kept; Buffer posts are unaffected.");
  });
}

export async function addAssetsToCampaign(campaignId: string, assetIds: string[], phase: string | null): Promise<ActionResult> {
  return runAction("Could not add content to the campaign.", async () => {
    const { supabase, userId } = await requireUserForAction();
    const cid = z.string().uuid().parse(campaignId);
    const ids = z.array(z.string().uuid()).min(1).max(50).parse(assetIds);
    const { data: campaign } = await supabase.from("campaigns").select("id").eq("id", cid).eq("user_id", userId).maybeSingle();
    if (!campaign) return fail("Campaign not found.");
    const { data: owned } = await supabase.from("content_assets").select("id").eq("user_id", userId).in("id", ids);
    const ownedIds = ((owned ?? []) as { id: string }[]).map((o) => o.id);
    if (!ownedIds.length) return fail("Content not found.");
    const { count } = await supabase.from("campaign_assets").select("id", { count: "exact", head: true }).eq("campaign_id", cid);
    const rows = ownedIds.map((assetId, i) => ({ user_id: userId, campaign_id: cid, content_asset_id: assetId, phase, sequence_number: (count ?? 0) + i }));
    const { error } = await supabase.from("campaign_assets").upsert(rows, { onConflict: "campaign_id,content_asset_id", ignoreDuplicates: true });
    if (error) throw error;
    await supabase.from("content_assets").update({ campaign_id: cid }).eq("user_id", userId).in("id", ownedIds);
    revalidatePath(`/campaigns/${cid}`);
    revalidatePath("/studio");
    return ok(undefined, `Added ${ownedIds.length} item${ownedIds.length === 1 ? "" : "s"} to the campaign.`);
  });
}

export async function removeCampaignAsset(campaignAssetId: string): Promise<ActionResult> {
  return runAction("Could not remove the item.", async () => {
    const { supabase, userId } = await requireUserForAction();
    const { data, error } = await supabase.from("campaign_assets").delete().eq("id", z.string().uuid().parse(campaignAssetId)).eq("user_id", userId).select("campaign_id, content_asset_id").single();
    if (error) throw error;
    await supabase.from("content_assets").update({ campaign_id: null }).eq("id", data.content_asset_id).eq("user_id", userId).eq("campaign_id", data.campaign_id);
    revalidatePath(`/campaigns/${data.campaign_id}`);
    return ok(undefined, "Removed from campaign. The draft itself was kept.");
  });
}

const CampaignAssetUpdate = z.object({
  phase: z.string().trim().max(40).nullable().optional(),
  scheduled_at: z.string().datetime({ offset: true }).nullable().optional(),
  channel_ids: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  sequence_number: z.number().int().min(0).max(1000).optional(),
});

/** Local plan only: changing a date here never changes anything already in Buffer. */
export async function updateCampaignAsset(id: string, input: z.input<typeof CampaignAssetUpdate>): Promise<ActionResult> {
  return runAction("Could not update the schedule.", async () => {
    const { supabase, userId } = await requireUserForAction();
    const data = CampaignAssetUpdate.parse(input);
    if (data.channel_ids?.length) {
      const { data: channels } = await supabase.from("buffer_channels").select("channel_id").eq("user_id", userId).in("channel_id", data.channel_ids);
      if ((channels ?? []).length !== data.channel_ids.length) return fail("One or more channels are not connected.");
    }
    const { data: row, error } = await supabase.from("campaign_assets").update(data).eq("id", z.string().uuid().parse(id)).eq("user_id", userId).select("campaign_id").single();
    if (error) throw error;
    revalidatePath(`/campaigns/${row.campaign_id}`);
    return ok(undefined, "Plan updated (local to ORBIT).");
  });
}
