import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { BufferApiError } from "@/lib/buffer/client";
import { getAccessToken, markNeedsReauth } from "@/lib/buffer/credentials";
import { createPost, fetchChannels, fetchPosts, type CreatePostInput } from "@/lib/buffer/operations";
import { PLATFORMS, countCharacters, platformForService, publishableText } from "@/engines/studio/platforms";
import type { BufferChannelRow, BufferPublication, ContentAsset, GuardianIssue, PublishMode } from "@/types/domain";

/** Re-reads channels from Buffer for the selected organization and stores them. */
export async function syncChannels(userId: string): Promise<BufferChannelRow[]> {
  const { token, connection } = await getAccessToken(userId);
  if (!connection.organization_id) return [];
  const admin = createAdminClient();
  let channels;
  try {
    channels = await fetchChannels(token, connection.organization_id);
  } catch (error) {
    if (error instanceof BufferApiError && error.kind === "unauthorized") await markNeedsReauth(userId, error.message);
    throw error;
  }
  const { data: existing } = await admin.from("buffer_channels").select("channel_id, selected").eq("user_id", userId);
  const selectedById = new Map(((existing ?? []) as { channel_id: string; selected: boolean }[]).map((c) => [c.channel_id, c.selected]));

  // Remove channels no longer returned by Buffer for this organization.
  await admin.from("buffer_channels").delete().eq("user_id", userId).neq("organization_id", connection.organization_id);
  const ids = channels.map((c) => c.id);
  if (ids.length) {
    await admin.from("buffer_channels").delete().eq("user_id", userId).not("channel_id", "in", `(${ids.map((i) => `"${i}"`).join(",")})`);
  } else {
    await admin.from("buffer_channels").delete().eq("user_id", userId);
  }
  if (!channels.length) return [];

  const { data, error } = await admin
    .from("buffer_channels")
    .upsert(
      channels.map((c) => ({
        user_id: userId,
        buffer_connection_id: connection.id,
        channel_id: c.id,
        organization_id: c.organizationId ?? connection.organization_id,
        name: c.name,
        display_name: c.displayName,
        service: c.service,
        avatar: c.avatar,
        is_disconnected: Boolean(c.isDisconnected),
        is_locked: Boolean(c.isLocked),
        is_queue_paused: Boolean(c.isQueuePaused),
        selected: selectedById.get(c.id) ?? true,
      })),
      { onConflict: "user_id,channel_id" },
    )
    .select("*");
  if (error) throw new Error(`Could not store channels: ${error.message}`);
  return (data as BufferChannelRow[]) ?? [];
}

export interface PublishRequest {
  assetId: string;
  channelIds: string[];
  mode: PublishMode;
  dueAt: string | null; // ISO UTC, required for customScheduled
  idempotencyKey: string; // generated per approval by the client
  campaignAssetId: string | null;
  acknowledgeUnchecked: boolean;
}

export interface ChannelOutcome {
  channelId: string;
  channelName: string;
  status: BufferPublication["operation_status"];
  bufferPostId: string | null;
  bufferStatus: string | null;
  dueAt: string | null;
  message: string | null;
  publicationId: string | null;
}

export interface PreflightProblem {
  channelId: string | null;
  message: string;
}

/** Validates a publish request without contacting Buffer. Exported for tests via pure helper below. */
export function preflight(
  asset: Pick<ContentAsset, "body" | "thread_parts" | "status" | "guardian_status">,
  openIssues: Pick<GuardianIssue, "severity" | "review_status" | "title">[],
  channels: Pick<BufferChannelRow, "channel_id" | "name" | "service" | "is_disconnected" | "is_locked">[],
  req: Pick<PublishRequest, "channelIds" | "mode" | "dueAt" | "acknowledgeUnchecked">,
  now: Date = new Date(),
): PreflightProblem[] {
  const problems: PreflightProblem[] = [];
  const text = publishableText(asset.body, asset.thread_parts);
  if (!text.trim()) problems.push({ channelId: null, message: "The content is empty." });
  if (asset.status === "archived" || asset.status === "rejected") problems.push({ channelId: null, message: `Content is ${asset.status}.` });
  const blocking = openIssues.filter((i) => i.review_status === "open" && i.severity === "blocking");
  if (blocking.length) {
    problems.push({ channelId: null, message: `Resolve ${blocking.length} blocking Guardian issue(s) first: ${blocking.map((b) => b.title).join("; ")}` });
  }
  if ((asset.guardian_status === "unchecked" || asset.guardian_status === "stale") && !req.acknowledgeUnchecked) {
    problems.push({ channelId: null, message: "Guardian has not checked the current version. Run Guardian or explicitly acknowledge." });
  }
  if (!req.channelIds.length) problems.push({ channelId: null, message: "Select at least one channel." });
  if (req.mode === "customScheduled") {
    const due = req.dueAt ? new Date(req.dueAt) : null;
    if (!due || Number.isNaN(due.getTime())) problems.push({ channelId: null, message: "Choose a date and time for scheduling." });
    else if (due.getTime() < now.getTime() + 60_000) problems.push({ channelId: null, message: "The scheduled time must be in the future." });
  }
  for (const id of req.channelIds) {
    const ch = channels.find((c) => c.channel_id === id);
    if (!ch) {
      problems.push({ channelId: id, message: "Channel not found in your connected Buffer organization." });
      continue;
    }
    if (ch.is_disconnected) problems.push({ channelId: id, message: `${ch.name} is disconnected in Buffer. Reconnect it in Buffer first.` });
    if (ch.is_locked) problems.push({ channelId: id, message: `${ch.name} is locked in Buffer (plan limit).` });
    const platform = platformForService(ch.service);
    if (platform) {
      const spec = PLATFORMS[platform];
      if (spec.requiresMedia) problems.push({ channelId: id, message: `${spec.label} requires an image or video, and ORBIT does not attach media yet.` });
      if (spec.maxChars && countCharacters(text, platform) > spec.maxChars) {
        problems.push({ channelId: id, message: `Too long for ${spec.label} (${countCharacters(text, platform)}/${spec.maxChars}).` });
      }
    }
  }
  return problems;
}

export function buildCreateInput(text: string, channelId: string, mode: PublishMode, dueAt: string | null, aiAssisted: boolean): CreatePostInput {
  const input: CreatePostInput = {
    text,
    channelId,
    schedulingType: "automatic",
    mode: mode === "draft" ? "addToQueue" : mode,
    aiAssisted,
    source: "orbit",
  };
  if (mode === "draft") input.saveToDraft = true;
  if (mode === "customScheduled" && dueAt) input.dueAt = new Date(dueAt).toISOString();
  return input;
}

export async function publishToBuffer(
  supabase: SupabaseClient,
  userId: string,
  req: PublishRequest,
): Promise<{ outcomes: ChannelOutcome[]; problems: PreflightProblem[] }> {
  const admin = createAdminClient();
  const { data: assetRow } = await supabase.from("content_assets").select("*").eq("id", req.assetId).eq("user_id", userId).maybeSingle();
  if (!assetRow) return { outcomes: [], problems: [{ channelId: null, message: "Content not found." }] };
  const asset = assetRow as ContentAsset;

  const [{ data: issues }, { data: channelRows }] = await Promise.all([
    supabase.from("guardian_issues").select("severity, review_status, title").eq("content_asset_id", asset.id).eq("user_id", userId).eq("review_status", "open"),
    supabase.from("buffer_channels").select("*").eq("user_id", userId),
  ]);
  const channels = (channelRows as BufferChannelRow[] | null) ?? [];
  const problems = preflight(asset, (issues as GuardianIssue[] | null) ?? [], channels, req);
  if (problems.length) return { outcomes: [], problems };

  const { token } = await getAccessToken(userId);
  const text = publishableText(asset.body, asset.thread_parts);
  const outcomes: ChannelOutcome[] = [];

  for (const channelId of req.channelIds) {
    const channel = channels.find((c) => c.channel_id === channelId)!;
    const key = `${req.idempotencyKey}:${channelId}`;

    // Idempotency: an existing ledger row for this approval+channel means the
    // request was already attempted. Never resubmit it blindly.
    const { data: existing } = await admin.from("buffer_publications").select("*").eq("user_id", userId).eq("idempotency_key", key).maybeSingle();
    if (existing) {
      const e = existing as BufferPublication;
      outcomes.push({
        channelId,
        channelName: channel.name,
        status: e.operation_status,
        bufferPostId: e.buffer_post_id,
        bufferStatus: e.buffer_status,
        dueAt: e.due_at,
        message: "This approval was already submitted; showing the recorded result.",
        publicationId: e.id,
      });
      continue;
    }

    const { data: ledger, error: ledgerError } = await admin
      .from("buffer_publications")
      .insert({
        user_id: userId,
        content_asset_id: asset.id,
        campaign_id: asset.campaign_id,
        campaign_asset_id: req.campaignAssetId,
        idempotency_key: key,
        channel_id: channelId,
        channel_name: channel.name,
        channel_service: channel.service,
        mode: req.mode,
        text_sent: text,
        scheduled_at: req.mode === "customScheduled" ? req.dueAt : null,
        operation_status: "pending",
      })
      .select("*")
      .single();
    if (ledgerError || !ledger) {
      outcomes.push({ channelId, channelName: channel.name, status: "failed", bufferPostId: null, bufferStatus: null, dueAt: null, message: "Could not record the operation; nothing was sent.", publicationId: null });
      continue;
    }

    try {
      const result = await createPost(token, buildCreateInput(text, channelId, req.mode, req.dueAt, asset.ai_generated));
      if (result.ok) {
        await admin
          .from("buffer_publications")
          .update({
            operation_status: "succeeded",
            buffer_post_id: result.post.id,
            buffer_status: result.post.status,
            due_at: result.post.dueAt,
            completed_at: new Date().toISOString(),
          })
          .eq("id", ledger.id);
        outcomes.push({ channelId, channelName: channel.name, status: "succeeded", bufferPostId: result.post.id, bufferStatus: result.post.status, dueAt: result.post.dueAt, message: null, publicationId: ledger.id });
      } else {
        await admin
          .from("buffer_publications")
          .update({ operation_status: "failed", error_message: result.message, error_type: result.errorType, completed_at: new Date().toISOString() })
          .eq("id", ledger.id);
        outcomes.push({ channelId, channelName: channel.name, status: "failed", bufferPostId: null, bufferStatus: null, dueAt: null, message: result.message, publicationId: ledger.id });
      }
    } catch (error) {
      const apiError = error instanceof BufferApiError ? error : null;
      if (apiError?.kind === "unauthorized") await markNeedsReauth(userId, apiError.message);
      const ambiguous = apiError ? apiError.ambiguous : true;
      const message = apiError?.message ?? "Unexpected error while contacting Buffer.";
      await admin
        .from("buffer_publications")
        .update({
          operation_status: ambiguous ? "unknown" : "failed",
          error_message: ambiguous ? `${message} The post may or may not have been created — check before retrying.` : message,
          error_type: apiError?.kind ?? "unexpected",
          completed_at: new Date().toISOString(),
        })
        .eq("id", ledger.id);
      outcomes.push({
        channelId,
        channelName: channel.name,
        status: ambiguous ? "unknown" : "failed",
        bufferPostId: null,
        bufferStatus: null,
        dueAt: null,
        message: ambiguous ? `${message} Outcome uncertain — use “Check status” before retrying.` : message,
        publicationId: ledger.id,
      });
      if (apiError?.kind === "unauthorized" || apiError?.kind === "rate_limited") {
        // Stop: subsequent channels would fail the same way. Record them as not attempted.
        for (const remaining of req.channelIds.slice(req.channelIds.indexOf(channelId) + 1)) {
          const ch = channels.find((c) => c.channel_id === remaining)!;
          outcomes.push({ channelId: remaining, channelName: ch.name, status: "failed", bufferPostId: null, bufferStatus: null, dueAt: null, message: "Not attempted because an earlier request failed.", publicationId: null });
        }
        break;
      }
    }
  }

  const succeeded = outcomes.filter((o) => o.status === "succeeded");
  if (succeeded.length) {
    const newStatus = req.mode === "draft" ? "approved" : "scheduled";
    await supabase.from("content_assets").update({ status: newStatus }).eq("id", asset.id).eq("user_id", userId);
    if (req.campaignAssetId) {
      await supabase
        .from("campaign_assets")
        .update({ status: succeeded.length === req.channelIds.length ? "sent_to_buffer" : "partially_sent" })
        .eq("id", req.campaignAssetId)
        .eq("user_id", userId);
    }
    if (asset.discovery_id) await supabase.from("discoveries").update({ status: "used" }).eq("id", asset.discovery_id).eq("user_id", userId);
  } else if (req.campaignAssetId && outcomes.some((o) => o.status === "failed")) {
    await supabase.from("campaign_assets").update({ status: "failed" }).eq("id", req.campaignAssetId).eq("user_id", userId);
  }
  await supabase.from("activity_logs").insert({
    user_id: userId,
    action: "buffer_publish",
    resource_type: "content_asset",
    resource_id: asset.id,
    metadata: { mode: req.mode, results: outcomes.map((o) => ({ channel: o.channelName, status: o.status, buffer_post_id: o.bufferPostId })) },
  });
  if (succeeded.length) {
    await supabase.from("user_feedback").insert({ user_id: userId, content_asset_id: asset.id, feedback_type: "approve", edited_content: text, original_content: asset.original_ai_body });
  }
  return { outcomes, problems: [] };
}

/**
 * Resolves an `unknown` operation by looking for the post in Buffer. Only after
 * confirming absence is the operation marked failed (and thus safe to retry).
 */
export async function reconcilePublication(userId: string, publicationId: string): Promise<BufferPublication> {
  const admin = createAdminClient();
  const { data } = await admin.from("buffer_publications").select("*").eq("id", publicationId).eq("user_id", userId).maybeSingle();
  if (!data) throw new Error("Operation not found.");
  const pub = data as BufferPublication;
  if (pub.operation_status !== "unknown" && pub.operation_status !== "pending") return pub;

  const { token, connection } = await getAccessToken(userId);
  if (!connection.organization_id) throw new Error("No Buffer organization selected.");
  const attemptedAt = new Date(pub.attempted_at).getTime();
  const normalized = (s: string | null) => (s ?? "").replace(/\s+/g, " ").trim();
  let after: string | undefined;
  let match: { id: string; status: string; dueAt: string | null } | null = null;
  for (let page = 0; page < 4 && !match; page++) {
    const res = await fetchPosts(token, { organizationId: connection.organization_id, channelIds: [pub.channel_id], first: 25, after });
    for (const p of res.posts) {
      const created = p.createdAt ? new Date(p.createdAt).getTime() : null;
      if (normalized(p.text) === normalized(pub.text_sent) && (created === null || created >= attemptedAt - 120_000)) {
        match = { id: p.id, status: p.status, dueAt: p.dueAt };
        break;
      }
    }
    if (!res.hasNextPage || !res.endCursor) break;
    after = res.endCursor;
  }
  const update = match
    ? { operation_status: "succeeded", buffer_post_id: match.id, buffer_status: match.status, due_at: match.dueAt, error_message: "Confirmed in Buffer after an uncertain response." }
    : { operation_status: "failed", error_message: "Not found in Buffer after an uncertain response. It is safe to retry." };
  const { data: updated } = await admin.from("buffer_publications").update({ ...update, completed_at: new Date().toISOString() }).eq("id", pub.id).select("*").single();
  return updated as BufferPublication;
}
