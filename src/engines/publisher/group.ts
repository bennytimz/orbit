import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { BufferApiError } from "@/lib/buffer/client";
import { getAccessToken, markNeedsReauth } from "@/lib/buffer/credentials";
import { createContentItem, type CreateContentItemResult } from "@/lib/buffer/content-items";
import { buildImageAssets } from "@/engines/studio/media";
import { BUFFER_URL_TTL_SECONDS, listAssetMedia, signedUrls } from "@/lib/media/store";
import { platformForService, publishableParts, publishableText } from "@/engines/studio/platforms";
import { buildCreateInput, preflight, type ChannelOutcome, type PreflightProblem } from "./publish";
import type { BufferChannelRow, BufferPublication, ContentAsset, GuardianIssue } from "@/types/domain";

/** Scheduling options offered for grouped sends. */
export type GroupMode = "draft" | "addToQueue" | "customScheduled";

export interface GroupPublishRequest {
  /** One variant per channel: which draft goes to which channel. */
  pairs: { assetId: string; channelId: string }[];
  mode: GroupMode;
  dueAt: string | null;
  idempotencyKey: string;
  acknowledgeUnchecked: boolean;
}

/** Structural checks that don't need the database. Exported for tests. */
export function groupProblems(pairs: GroupPublishRequest["pairs"], assets: Pick<ContentAsset, "id" | "generation_group">[]): string[] {
  const out: string[] = [];
  if (pairs.length < 2) out.push("Choose at least two variants to send together.");
  const channels = pairs.map((p) => p.channelId);
  if (new Set(channels).size !== channels.length) out.push("Buffer allows one post per channel in a content item. Pick a different channel for each variant.");
  const groups = new Set(pairs.map((p) => assets.find((a) => a.id === p.assetId)?.generation_group ?? null));
  if (groups.has(null) || groups.size !== 1) out.push("Only variants generated together (the same piece of content) can be grouped.");
  return out;
}

/** Maps each requested channel to its outcome from a createContentItem result. Exported for tests. */
export function outcomesFromContentItem(
  result: CreateContentItemResult,
  channelIds: string[],
): Record<string, { status: BufferPublication["operation_status"]; postId: string | null; bufferStatus: string | null; dueAt: string | null; message: string | null }> {
  const out: ReturnType<typeof outcomesFromContentItem> = {};
  for (const id of channelIds) {
    if (result.ok) {
      const post = result.posts.find((p) => p.channelId === id);
      out[id] = post
        ? { status: "succeeded", postId: post.id, bufferStatus: post.status, dueAt: post.dueAt, message: null }
        : { status: "unknown", postId: null, bufferStatus: null, dueAt: null, message: "Buffer created the content item but didn't list a post for this channel. Use “Check status” before retrying." };
    } else {
      // The failure payload has no item ID, and posts may already exist. Never assume failure.
      const reason = result.channelErrors[id] ?? result.generalErrors[0] ?? result.message;
      out[id] = { status: "unknown", postId: null, bufferStatus: null, dueAt: null, message: `${reason} Buffer may still have created this post. Use “Check status” before retrying.` };
    }
  }
  return out;
}

/**
 * Sends platform variants of one piece of content to Buffer as a single
 * content item (one post per channel). Every variant passes the same
 * preflight as single sends, and each channel gets its own ledger row.
 */
export async function publishVariantsAsContentItem(
  supabase: SupabaseClient,
  userId: string,
  req: GroupPublishRequest,
): Promise<{ outcomes: ChannelOutcome[]; problems: PreflightProblem[]; contentItemId: string | null }> {
  const admin = createAdminClient();
  const assetIds = [...new Set(req.pairs.map((p) => p.assetId))];
  const [{ data: assetRows }, { data: channelRows }, { data: issueRows }] = await Promise.all([
    supabase.from("content_assets").select("*").eq("user_id", userId).in("id", assetIds),
    supabase.from("buffer_channels").select("*").eq("user_id", userId),
    supabase.from("guardian_issues").select("content_asset_id, severity, review_status, title").eq("user_id", userId).in("content_asset_id", assetIds).eq("review_status", "open"),
  ]);
  const assets = (assetRows as ContentAsset[] | null) ?? [];
  const channels = (channelRows as BufferChannelRow[] | null) ?? [];
  const issues = (issueRows as (GuardianIssue & { content_asset_id: string })[] | null) ?? [];
  if (assets.length !== assetIds.length) return { outcomes: [], problems: [{ channelId: null, message: "Content not found." }], contentItemId: null };

  const structural = groupProblems(req.pairs, assets);
  if (structural.length) return { outcomes: [], problems: structural.map((message) => ({ channelId: null, message })), contentItemId: null };

  // Idempotency: if this approval was already attempted, show the recorded results instead of resubmitting.
  const keys = req.pairs.map((p) => `${req.idempotencyKey}:${p.channelId}`);
  const { data: existing } = await admin.from("buffer_publications").select("*").eq("user_id", userId).in("idempotency_key", keys);
  if ((existing ?? []).length) {
    return {
      outcomes: ((existing as BufferPublication[]) ?? []).map((e) => ({
        channelId: e.channel_id,
        channelName: e.channel_name ?? e.channel_id,
        status: e.operation_status,
        bufferPostId: e.buffer_post_id,
        bufferStatus: e.buffer_status,
        dueAt: e.due_at,
        message: "This approval was already submitted; showing the recorded result.",
        publicationId: e.id,
      })),
      problems: [],
      contentItemId: null,
    };
  }

  const mediaByAsset = new Map(await Promise.all(assetIds.map(async (id) => [id, await listAssetMedia(supabase, userId, id)] as const)));
  const problems: PreflightProblem[] = [];
  for (const pair of req.pairs) {
    const asset = assets.find((a) => a.id === pair.assetId)!;
    const p = preflight(asset, issues.filter((i) => i.content_asset_id === asset.id), channels, { channelIds: [pair.channelId], mode: req.mode, dueAt: req.dueAt, acknowledgeUnchecked: req.acknowledgeUnchecked }, new Date(), mediaByAsset.get(asset.id) ?? []);
    problems.push(...p.map((x) => ({ ...x, message: `${asset.title}: ${x.message}` })));
  }
  if (problems.length) return { outcomes: [], problems, contentItemId: null };

  const { token, connection } = await getAccessToken(userId);
  if (!connection.organization_id) return { outcomes: [], problems: [{ channelId: null, message: "Select a Buffer organization first." }], contentItemId: null };

  const allMedia = [...mediaByAsset.values()].flat();
  const urls = allMedia.length ? await signedUrls(allMedia.map((m) => m.storage_path), BUFFER_URL_TTL_SECONDS) : new Map<string, string>();
  if (allMedia.some((m) => !urls.has(m.storage_path))) {
    return { outcomes: [], problems: [{ channelId: null, message: "Could not prepare the attached images for Buffer. Nothing was sent; try again." }], contentItemId: null };
  }

  // Prepare every variant and its pending ledger row before contacting Buffer.
  const prepared = req.pairs.map((pair) => {
    const asset = assets.find((a) => a.id === pair.assetId)!;
    const channel = channels.find((c) => c.channel_id === pair.channelId)!;
    const media = mediaByAsset.get(asset.id) ?? [];
    const assetsInput = buildImageAssets(media.map((m) => ({ url: urls.get(m.storage_path)!, alt_text: m.alt_text })));
    const parts = publishableParts(asset.body, asset.thread_parts, platformForService(channel.service));
    return {
      asset,
      channel,
      input: buildCreateInput(parts, channel.channel_id, req.mode, req.dueAt, asset.ai_generated, assetsInput.length ? { assets: assetsInput, service: channel.service } : undefined),
      text: publishableText(asset.body, asset.thread_parts),
      mediaSent: media.length ? media.map((m) => ({ media_id: m.id, mime: m.mime_type })) : null,
    };
  });
  const { data: ledgerRows, error: ledgerError } = await admin
    .from("buffer_publications")
    .insert(
      prepared.map((p) => ({
        user_id: userId,
        content_asset_id: p.asset.id,
        campaign_id: p.asset.campaign_id,
        idempotency_key: `${req.idempotencyKey}:${p.channel.channel_id}`,
        channel_id: p.channel.channel_id,
        channel_name: p.channel.name,
        channel_service: p.channel.service,
        mode: req.mode,
        text_sent: p.text,
        scheduled_at: req.mode === "customScheduled" ? req.dueAt : null,
        operation_status: "pending",
        ...(p.mediaSent ? { media_sent: p.mediaSent } : {}),
      })),
    )
    .select("*");
  if (ledgerError || !ledgerRows || ledgerRows.length !== prepared.length) {
    return { outcomes: [], problems: [{ channelId: null, message: "Could not record the operation; nothing was sent." }], contentItemId: null };
  }
  const ledgerByChannel = new Map((ledgerRows as BufferPublication[]).map((l) => [l.channel_id, l]));

  let result: CreateContentItemResult;
  try {
    result = await createContentItem(token, { organizationId: connection.organization_id, title: prepared[0].asset.title.slice(0, 200), posts: prepared.map((p) => p.input) });
  } catch (error) {
    const apiError = error instanceof BufferApiError ? error : null;
    if (apiError?.kind === "unauthorized") await markNeedsReauth(userId, apiError.message);
    const ambiguous = apiError ? apiError.ambiguous : true;
    const message = apiError?.message ?? "Unexpected error while contacting Buffer.";
    const outcomes: ChannelOutcome[] = [];
    for (const p of prepared) {
      const ledger = ledgerByChannel.get(p.channel.channel_id)!;
      await admin
        .from("buffer_publications")
        .update({
          operation_status: ambiguous ? "unknown" : "failed",
          error_message: ambiguous ? `${message} The post may or may not have been created — check before retrying.` : message,
          error_type: apiError?.kind ?? "unexpected",
          completed_at: new Date().toISOString(),
        })
        .eq("id", ledger.id);
      outcomes.push({ channelId: p.channel.channel_id, channelName: p.channel.name, status: ambiguous ? "unknown" : "failed", bufferPostId: null, bufferStatus: null, dueAt: null, message, publicationId: ledger.id });
    }
    return { outcomes, problems: [], contentItemId: null };
  }

  const mapped = outcomesFromContentItem(result, prepared.map((p) => p.channel.channel_id));
  const contentItemId = result.ok ? result.contentItemId : null;
  const outcomes: ChannelOutcome[] = [];
  for (const p of prepared) {
    const o = mapped[p.channel.channel_id];
    const ledger = ledgerByChannel.get(p.channel.channel_id)!;
    await admin
      .from("buffer_publications")
      .update({
        operation_status: o.status,
        buffer_post_id: o.postId,
        buffer_status: o.bufferStatus,
        due_at: o.dueAt,
        buffer_content_item_id: contentItemId,
        error_message: o.message,
        error_type: result.ok ? null : "content_item_failure",
        completed_at: new Date().toISOString(),
      })
      .eq("id", ledger.id);
    outcomes.push({ channelId: p.channel.channel_id, channelName: p.channel.name, status: o.status, bufferPostId: o.postId, bufferStatus: o.bufferStatus, dueAt: o.dueAt, message: o.message, publicationId: ledger.id });
  }

  const succeededAssets = new Set(prepared.filter((p) => mapped[p.channel.channel_id].status === "succeeded").map((p) => p.asset.id));
  for (const p of prepared) {
    if (!succeededAssets.has(p.asset.id)) continue;
    succeededAssets.delete(p.asset.id);
    await supabase.from("content_assets").update({ status: req.mode === "draft" ? "approved" : "scheduled" }).eq("id", p.asset.id).eq("user_id", userId);
    await supabase.from("user_feedback").insert({ user_id: userId, content_asset_id: p.asset.id, feedback_type: "approve", edited_content: p.text, original_content: p.asset.original_ai_body });
  }
  if (prepared[0].asset.discovery_id && outcomes.some((o) => o.status === "succeeded")) {
    await supabase.from("discoveries").update({ status: "used" }).eq("id", prepared[0].asset.discovery_id).eq("user_id", userId);
  }
  await supabase.from("activity_logs").insert({
    user_id: userId,
    action: "buffer_publish_group",
    resource_type: "content_asset",
    resource_id: prepared[0].asset.id,
    metadata: { mode: req.mode, content_item_id: contentItemId, results: outcomes.map((o) => ({ channel: o.channelName, status: o.status, buffer_post_id: o.bufferPostId })) },
  });
  return { outcomes, problems: [], contentItemId };
}
