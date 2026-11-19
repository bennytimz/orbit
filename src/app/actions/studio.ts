"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUserForAction } from "@/lib/auth";
import { fail, ok, runAction, type ActionResult } from "@/lib/action-result";
import { generateContent, suggestTransform, TRANSFORMS } from "@/engines/studio/generate";
import { GENERATABLE_PLATFORMS, PLATFORMS } from "@/engines/studio/platforms";
import type { ContentAsset, ContentStatus, ContentVersion, Platform } from "@/types/domain";
import { removeObjects } from "@/lib/media/store";

const PlatformEnum = z.enum(["linkedin", "x", "threads", "facebook", "instagram", "bluesky", "mastodon", "newsletter", "generic"]);

const GenerateInput = z.object({
  platforms: z.array(z.enum(GENERATABLE_PLATFORMS as [Platform, ...Platform[]])).min(1, "Select at least one platform.").max(6),
  discoveryId: z.string().uuid().nullable(),
  reportId: z.string().uuid().nullable(),
  perspectiveIds: z.array(z.string().uuid()).max(20),
  ideaText: z.string().trim().max(5000).nullable(),
  objective: z.string().trim().max(300).nullable(),
  contentType: z.string().trim().min(1).max(60),
  instructions: z.string().trim().max(2000).nullable(),
  campaignId: z.string().uuid().nullable(),
});

export async function generateDrafts(input: z.input<typeof GenerateInput>): Promise<ActionResult<{ ids: string[]; group: string | null }>> {
  return runAction("Content generation failed. Your existing drafts have not been changed.", async () => {
    const { supabase, userId } = await requireUserForAction();
    const data = GenerateInput.parse(input);
    const assets = await generateContent(supabase, userId, data);
    revalidatePath("/studio");
    revalidatePath("/dashboard");
    return ok({ ids: assets.map((a) => a.id), group: assets[0]?.generation_group ?? null }, `${assets.length} platform draft${assets.length === 1 ? "" : "s"} created.`);
  });
}

export async function createBlankDraft(platform: Platform, title?: string): Promise<ActionResult<{ id: string }>> {
  return runAction("Could not create the draft.", async () => {
    const { supabase, userId } = await requireUserForAction();
    const p = PlatformEnum.parse(platform);
    const { data, error } = await supabase
      .from("content_assets")
      .insert({ user_id: userId, title: title?.trim().slice(0, 200) || `Untitled ${PLATFORMS[p].label} draft`, body: "", platform: p, status: "draft" })
      .select("id")
      .single();
    if (error) throw error;
    revalidatePath("/studio");
    return ok({ id: data.id as string });
  });
}

async function nextVersion(supabase: SupabaseClient, assetId: string): Promise<number> {
  const { data } = await supabase.from("content_versions").select("version_number").eq("content_asset_id", assetId).order("version_number", { ascending: false }).limit(1).maybeSingle();
  return ((data?.version_number as number | undefined) ?? 0) + 1;
}

async function loadAsset(supabase: SupabaseClient, userId: string, id: string): Promise<ContentAsset | null> {
  const { data } = await supabase.from("content_assets").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  return (data as ContentAsset | null) ?? null;
}

const SaveInput = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  body: z.string().max(100000),
  threadParts: z.array(z.string().max(2000)).max(25).nullable(),
  /** Base `updated_at` the editor loaded, for conflict detection. */
  baseUpdatedAt: z.string().nullable(),
  kind: z.enum(["autosave", "manual"]),
});

/**
 * Saves the editor contents. Manual saves create a version; autosaves update
 * the working copy and only snapshot every few minutes. Edits to AI drafts are
 * recorded as feedback for Evolution (the original AI text is preserved).
 */
export async function saveDraft(input: z.input<typeof SaveInput>): Promise<ActionResult<{ updatedAt: string }>> {
  return runAction("Could not save. Your text is still in the editor — try again.", async () => {
    const { supabase, userId } = await requireUserForAction();
    const data = SaveInput.parse(input);
    const asset = await loadAsset(supabase, userId, data.id);
    if (!asset) return fail("Draft not found.");
    if (data.baseUpdatedAt && new Date(asset.updated_at).getTime() > new Date(data.baseUpdatedAt).getTime() + 1000) {
      return fail("This draft was changed elsewhere (another tab?). Reload to see the latest version before saving.", "conflict");
    }
    const changed = asset.body !== data.body || asset.title !== data.title || JSON.stringify(asset.thread_parts) !== JSON.stringify(data.threadParts);
    if (!changed && data.kind === "autosave") return ok({ updatedAt: asset.updated_at });

    const bodyChanged = asset.body !== data.body;
    const { data: updated, error } = await supabase
      .from("content_assets")
      .update({
        title: data.title,
        body: data.body,
        thread_parts: data.threadParts && data.threadParts.length > 1 ? data.threadParts : null,
        ...(bodyChanged && asset.guardian_status !== "unchecked" ? { guardian_status: "stale" } : {}),
      })
      .eq("id", asset.id)
      .eq("user_id", userId)
      .select("updated_at")
      .single();
    if (error) throw error;

    let snapshot = data.kind === "manual";
    if (!snapshot && bodyChanged) {
      const { data: last } = await supabase.from("content_versions").select("created_at").eq("content_asset_id", asset.id).order("version_number", { ascending: false }).limit(1).maybeSingle();
      snapshot = !last || Date.now() - new Date(last.created_at as string).getTime() > 5 * 60_000;
    }
    if (snapshot && bodyChanged) {
      await supabase.from("content_versions").insert({
        user_id: userId,
        content_asset_id: asset.id,
        version_number: await nextVersion(supabase, asset.id),
        body: data.body,
        thread_parts: data.threadParts,
        change_type: data.kind === "manual" ? "user_edit" : "autosave",
      });
    }
    if (data.kind === "manual" && bodyChanged && asset.ai_generated && asset.original_ai_body) {
      // Keep one evolving edit record per asset rather than one per keystroke-save.
      const { data: fb } = await supabase.from("user_feedback").select("id").eq("content_asset_id", asset.id).eq("feedback_type", "edit").eq("analyzed", false).maybeSingle();
      if (fb) await supabase.from("user_feedback").update({ edited_content: data.body }).eq("id", fb.id).eq("user_id", userId);
      else
        await supabase.from("user_feedback").insert({ user_id: userId, content_asset_id: asset.id, feedback_type: "edit", original_content: asset.original_ai_body, edited_content: data.body });
    }
    return ok({ updatedAt: updated.updated_at as string }, data.kind === "manual" ? "Saved." : undefined);
  });
}

const TransformInput = z.object({
  id: z.string().uuid(),
  kind: z.enum([...(Object.keys(TRANSFORMS) as [keyof typeof TRANSFORMS, ...(keyof typeof TRANSFORMS)[]]), "adapt", "custom"]),
  targetPlatform: PlatformEnum.optional(),
  customInstruction: z.string().trim().max(1000).optional(),
});

/** Returns an AI suggestion only. The editor shows it side by side; nothing is overwritten. */
export async function suggestRewrite(input: z.input<typeof TransformInput>) {
  return runAction("The AI rewrite failed. Your draft has not been changed.", async () => {
    const { supabase, userId } = await requireUserForAction();
    const data = TransformInput.parse(input);
    const asset = await loadAsset(supabase, userId, data.id);
    if (!asset) return fail("Draft not found.");
    if (!asset.body.trim()) return fail("Write something first, or generate a draft.");
    const suggestion = await suggestTransform(supabase, userId, asset, data.kind, { targetPlatform: data.targetPlatform, customInstruction: data.customInstruction });
    return ok(suggestion);
  });
}

/** Accepting a suggestion snapshots the current text first, so it is always recoverable. */
export async function acceptRewrite(input: { id: string; body: string; threadParts: string[]; note: string; currentBody: string }): Promise<ActionResult<{ updatedAt: string }>> {
  return runAction("Could not apply the rewrite. Your draft has not been changed.", async () => {
    const { supabase, userId } = await requireUserForAction();
    const data = z
      .object({ id: z.string().uuid(), body: z.string().max(100000), threadParts: z.array(z.string().max(2000)).max(25), note: z.string().max(500), currentBody: z.string().max(100000) })
      .parse(input);
    const asset = await loadAsset(supabase, userId, data.id);
    if (!asset) return fail("Draft not found.");
    let v = await nextVersion(supabase, asset.id);
    await supabase.from("content_versions").insert({
      user_id: userId,
      content_asset_id: asset.id,
      version_number: v++,
      body: data.currentBody,
      thread_parts: asset.thread_parts,
      change_type: "before_ai_transform",
      note: "Snapshot before applying AI rewrite",
    });
    const threadParts = data.threadParts.length > 1 ? data.threadParts : null;
    const { data: updated, error } = await supabase
      .from("content_assets")
      .update({ body: data.body, thread_parts: threadParts, guardian_status: asset.guardian_status === "unchecked" ? "unchecked" : "stale" })
      .eq("id", asset.id)
      .eq("user_id", userId)
      .select("updated_at")
      .single();
    if (error) throw error;
    await supabase.from("content_versions").insert({
      user_id: userId,
      content_asset_id: asset.id,
      version_number: v,
      body: data.body,
      thread_parts: threadParts,
      change_type: "ai_transform",
      note: data.note.slice(0, 500),
    });
    revalidatePath(`/studio/${asset.id}`);
    return ok({ updatedAt: updated.updated_at as string }, "Rewrite applied. The previous text is saved in version history.");
  });
}

export async function restoreVersion(assetId: string, versionId: string): Promise<ActionResult<{ body: string; threadParts: string[] | null; updatedAt: string }>> {
  return runAction("Could not restore that version.", async () => {
    const { supabase, userId } = await requireUserForAction();
    const asset = await loadAsset(supabase, userId, z.string().uuid().parse(assetId));
    if (!asset) return fail("Draft not found.");
    const { data: version } = await supabase.from("content_versions").select("*").eq("id", z.string().uuid().parse(versionId)).eq("content_asset_id", asset.id).eq("user_id", userId).maybeSingle();
    if (!version) return fail("Version not found.");
    const v = version as ContentVersion;
    let n = await nextVersion(supabase, asset.id);
    await supabase.from("content_versions").insert({ user_id: userId, content_asset_id: asset.id, version_number: n++, body: asset.body, thread_parts: asset.thread_parts, change_type: "before_ai_transform", note: `Snapshot before restoring v${v.version_number}` });
    const { data: updated, error } = await supabase
      .from("content_assets")
      .update({ body: v.body, thread_parts: v.thread_parts, guardian_status: asset.guardian_status === "unchecked" ? "unchecked" : "stale" })
      .eq("id", asset.id)
      .eq("user_id", userId)
      .select("updated_at")
      .single();
    if (error) throw error;
    await supabase.from("content_versions").insert({ user_id: userId, content_asset_id: asset.id, version_number: n, body: v.body, thread_parts: v.thread_parts, change_type: "restore", note: `Restored v${v.version_number}` });
    revalidatePath(`/studio/${asset.id}`);
    return ok({ body: v.body, threadParts: v.thread_parts, updatedAt: updated.updated_at as string }, `Restored version ${v.version_number}.`);
  });
}

export async function setContentStatus(id: string, status: ContentStatus, feedbackText?: string): Promise<ActionResult> {
  return runAction("Could not update the status.", async () => {
    const { supabase, userId } = await requireUserForAction();
    const s = z.enum(["idea", "draft", "in_review", "approved", "rejected", "archived"]).parse(status);
    const asset = await loadAsset(supabase, userId, z.string().uuid().parse(id));
    if (!asset) return fail("Draft not found.");
    const { error } = await supabase.from("content_assets").update({ status: s }).eq("id", asset.id).eq("user_id", userId);
    if (error) throw error;
    if (s === "rejected" || (s === "approved" && asset.ai_generated)) {
      await supabase.from("user_feedback").insert({
        user_id: userId,
        content_asset_id: asset.id,
        feedback_type: s === "rejected" ? "reject" : "approve",
        original_content: asset.original_ai_body,
        edited_content: asset.body,
        feedback_text: feedbackText?.trim().slice(0, 2000) || null,
      });
    }
    revalidatePath("/studio");
    revalidatePath(`/studio/${asset.id}`);
    return ok(undefined, `Marked as ${s.replace("_", " ")}.`);
  });
}

export async function deleteDraft(id: string): Promise<ActionResult> {
  return runAction("Could not delete the draft.", async () => {
    const { supabase, userId } = await requireUserForAction();
    const assetId = z.string().uuid().parse(id);
    // Image files are removed with the draft unless Buffer was given their URL:
    // a scheduled post fetches its image when it publishes.
    const orphanPaths = await unsentMediaPaths(supabase, userId, assetId);
    const { error } = await supabase.from("content_assets").delete().eq("id", assetId).eq("user_id", userId);
    if (error) throw error;
    if (orphanPaths.length) await removeObjects(orphanPaths).catch((e) => console.error("[orbit] Could not remove draft images", e instanceof Error ? e.message : e));
    revalidatePath("/studio");
    return ok(undefined, "Draft deleted. Anything already sent to Buffer is unaffected.");
  });
}

/** Storage paths of a draft's images that were never sent to Buffer. Errors return [] so nothing Buffer may need is deleted. */
async function unsentMediaPaths(supabase: SupabaseClient, userId: string, assetId: string): Promise<string[]> {
  const [media, sent] = await Promise.all([
    supabase.from("content_media").select("id,storage_path").eq("content_asset_id", assetId).eq("user_id", userId),
    supabase.from("buffer_publications").select("media_sent").eq("content_asset_id", assetId).eq("user_id", userId).not("media_sent", "is", null),
  ]);
  if (media.error || sent.error || !media.data?.length) return [];
  const sentIds = new Set<string>();
  for (const row of sent.data ?? []) for (const m of (row.media_sent as { media_id?: string }[] | null) ?? []) if (m.media_id) sentIds.add(m.media_id);
  return media.data.filter((m) => !sentIds.has(m.id as string)).map((m) => m.storage_path as string);
}
