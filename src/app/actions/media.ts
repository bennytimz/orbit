"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserForAction } from "@/lib/auth";
import { fail, ok, runAction, type ActionResult } from "@/lib/action-result";
import { removeObjects } from "@/lib/media/store";

async function markGuardianStale(supabase: Awaited<ReturnType<typeof requireUserForAction>>["supabase"], userId: string, assetId: string) {
  await supabase.from("content_assets").update({ guardian_status: "stale" }).eq("id", assetId).eq("user_id", userId).neq("guardian_status", "unchecked");
}

export async function deleteMedia(mediaId: string): Promise<ActionResult> {
  return runAction("Could not remove the image.", async () => {
    const { supabase, userId } = await requireUserForAction();
    const id = z.string().uuid().parse(mediaId);
    const { data: row } = await supabase.from("content_media").select("id, storage_path, content_asset_id").eq("id", id).eq("user_id", userId).maybeSingle();
    if (!row) return fail("Image not found.");
    // Never touch another user's object: paths always start with the owner's id.
    if (!String(row.storage_path).startsWith(`${userId}/`)) return fail("Image not found.");
    await removeObjects([row.storage_path as string]);
    const { error } = await supabase.from("content_media").delete().eq("id", id).eq("user_id", userId);
    if (error) throw error;
    await markGuardianStale(supabase, userId, row.content_asset_id as string);
    await supabase.from("activity_logs").insert({ user_id: userId, action: "media_removed", resource_type: "content_asset", resource_id: row.content_asset_id, metadata: { media_id: id } });
    revalidatePath(`/studio/${row.content_asset_id}`);
    return ok(undefined, "Image removed.");
  });
}

export async function updateMediaAltText(mediaId: string, altText: string): Promise<ActionResult> {
  return runAction("Could not save the alt text.", async () => {
    const { supabase, userId } = await requireUserForAction();
    const id = z.string().uuid().parse(mediaId);
    const alt = z.string().trim().max(1000).parse(altText);
    const { data, error } = await supabase.from("content_media").update({ alt_text: alt }).eq("id", id).eq("user_id", userId).select("content_asset_id").maybeSingle();
    if (error) throw error;
    if (!data) return fail("Image not found.");
    revalidatePath(`/studio/${data.content_asset_id}`);
    return ok(undefined, "Alt text saved.");
  });
}
