"use server";

import { revalidatePath } from "next/cache";
import { requireUserForAction } from "@/lib/auth";
import { fail, ok, runAction, type ActionResult } from "@/lib/action-result";
import { createAdminClient } from "@/lib/supabase/server";
import { BufferApiError } from "@/lib/buffer/client";
import { getAccessToken, getConnection } from "@/lib/buffer/credentials";
import { fetchSentPostMetrics, type PostMetricValue } from "@/lib/buffer/metrics";
import { engagementRate, isStale, performanceInsights, type ScoredPost } from "@/engines/evolution/performance";
import { platformForService } from "@/engines/studio/platforms";
import type { Platform } from "@/types/domain";

export interface PerformanceRow {
  bufferPostId: string;
  contentAssetId: string | null;
  text: string;
  channelName: string | null;
  channelService: string | null;
  sentAt: string | null;
  externalLink: string | null;
  metrics: PostMetricValue[];
  metricsUpdatedAt: string | null;
  engagementRate: number | null;
}

export type PerformanceAvailability = "ok" | "not_connected" | "needs_reauth" | "oauth_no_insights" | "not_set_up";

export interface PerformanceData {
  availability: PerformanceAvailability;
  rows: PerformanceRow[];
  /** Posts ORBIT created in Buffer (any status). */
  orbitPostCount: number;
  lastFetchedAt: string | null;
  refreshed: boolean;
  error: string | null;
}

interface LedgerRow {
  id: string;
  buffer_post_id: string;
  content_asset_id: string | null;
  channel_id: string;
  channel_name: string | null;
  channel_service: string | null;
  text_sent: string;
  media_sent: unknown[] | null;
}

interface CachedRow {
  buffer_post_id: string;
  publication_id: string | null;
  content_asset_id: string | null;
  channel_service: string | null;
  sent_at: string | null;
  external_link: string | null;
  metrics: PostMetricValue[];
  metrics_updated_at: string | null;
  fetched_at: string;
}

async function ledger(userId: string): Promise<LedgerRow[]> {
  const { data } = await createAdminClient()
    .from("buffer_publications")
    .select("id, buffer_post_id, content_asset_id, channel_id, channel_name, channel_service, text_sent, media_sent")
    .eq("user_id", userId)
    .eq("operation_status", "succeeded")
    .not("buffer_post_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);
  return (data as LedgerRow[] | null) ?? [];
}

/**
 * Metrics for posts ORBIT sent. Opening the panel refreshes from Buffer at most
 * every 12 h (Buffer itself refreshes daily); `force` refreshes now.
 */
export async function loadPerformance(force = false): Promise<ActionResult<PerformanceData>> {
  return runAction("Could not load performance data.", async () => {
    const { userId } = await requireUserForAction();
    const admin = createAdminClient();
    const empty = (availability: PerformanceAvailability, error: string | null = null, orbitPostCount = 0): PerformanceData => ({
      availability,
      rows: [],
      orbitPostCount,
      lastFetchedAt: null,
      refreshed: false,
      error,
    });

    const probe = await admin.from("buffer_post_metrics").select("fetched_at").eq("user_id", userId).order("fetched_at", { ascending: false }).limit(1);
    if (probe.error) return ok(empty("not_set_up"));
    const connection = await getConnection(userId).catch(() => null);
    if (!connection) return ok(empty("not_connected"));
    if (connection.status !== "active") return ok(empty("needs_reauth"));

    const pubs = await ledger(userId);
    if (connection.auth_type !== "api_key") return ok(empty("oauth_no_insights", null, pubs.length));

    const lastFetchedAt = (probe.data?.[0] as { fetched_at: string } | undefined)?.fetched_at ?? null;
    let refreshed = false;
    let error: string | null = null;
    if (pubs.length && (force || isStale(lastFetchedAt))) {
      try {
        const { token } = await getAccessToken(userId);
        if (!connection.organization_id) return fail("Select a Buffer organization first.");
        const byPost = new Map(pubs.map((p) => [p.buffer_post_id, p]));
        const sent = await fetchSentPostMetrics(token, { organizationId: connection.organization_id, channelIds: [...new Set(pubs.map((p) => p.channel_id))] });
        const now = new Date().toISOString();
        const rows = sent
          .filter((p) => byPost.has(p.id))
          .map((p) => {
            const pub = byPost.get(p.id)!;
            return {
              user_id: userId,
              buffer_post_id: p.id,
              publication_id: pub.id,
              content_asset_id: pub.content_asset_id,
              channel_id: p.channelId,
              channel_service: p.channelService,
              buffer_status: p.status,
              sent_at: p.sentAt,
              external_link: p.externalLink,
              metrics: p.metrics ?? [],
              metrics_updated_at: p.metricsUpdatedAt,
              fetched_at: now,
            };
          });
        if (rows.length) {
          const { error: upsertError } = await admin.from("buffer_post_metrics").upsert(rows, { onConflict: "user_id,buffer_post_id" });
          if (upsertError) throw new Error(upsertError.message);
        }
        refreshed = true;
      } catch (e) {
        // Keep showing cached data; explain what failed.
        if (e instanceof BufferApiError && (e.kind === "forbidden" || e.kind === "unauthorized")) {
          error = "Buffer did not allow ORBIT to read metrics with this connection. Metrics need a personal API key with Insights access.";
        } else if (e instanceof BufferApiError && e.kind === "rate_limited") {
          error = "Buffer rate limit reached. Showing the last saved metrics.";
        } else {
          error = "Could not refresh metrics from Buffer. Showing the last saved metrics.";
        }
      }
    }

    const { data: cached } = await admin
      .from("buffer_post_metrics")
      .select("buffer_post_id, publication_id, content_asset_id, channel_service, sent_at, external_link, metrics, metrics_updated_at, fetched_at")
      .eq("user_id", userId)
      .order("sent_at", { ascending: false, nullsFirst: false })
      .limit(100);
    const byPost = new Map(pubs.map((p) => [p.buffer_post_id, p]));
    const rows: PerformanceRow[] = ((cached as CachedRow[] | null) ?? []).map((c) => ({
      bufferPostId: c.buffer_post_id,
      contentAssetId: c.content_asset_id,
      text: byPost.get(c.buffer_post_id)?.text_sent ?? "",
      channelName: byPost.get(c.buffer_post_id)?.channel_name ?? null,
      channelService: c.channel_service,
      sentAt: c.sent_at,
      externalLink: c.external_link,
      metrics: c.metrics ?? [],
      metricsUpdatedAt: c.metrics_updated_at,
      engagementRate: engagementRate(c.metrics),
    }));
    const latest = ((cached as CachedRow[] | null) ?? []).reduce<string | null>((m, c) => (!m || c.fetched_at > m ? c.fetched_at : m), refreshed ? new Date().toISOString() : lastFetchedAt);
    return ok({ availability: "ok", rows, orbitPostCount: pubs.length, lastFetchedAt: latest, refreshed, error });
  });
}

/**
 * Turns cached metrics into preference suggestions. They are stored as
 * "suggested" and change nothing until the user accepts them in Memory.
 */
export async function suggestFromPerformance(): Promise<ActionResult<{ count: number }>> {
  return runAction("Could not analyze performance.", async () => {
    const { supabase, userId } = await requireUserForAction();
    const admin = createAdminClient();
    const [{ data: cached }, pubs] = await Promise.all([
      admin.from("buffer_post_metrics").select("buffer_post_id, content_asset_id, channel_service, metrics").eq("user_id", userId),
      ledger(userId),
    ]);
    const metricRows = (cached as { buffer_post_id: string; content_asset_id: string | null; channel_service: string | null; metrics: PostMetricValue[] }[] | null) ?? [];
    if (!metricRows.length) return fail("No metrics yet. Buffer reports metrics only for sent posts, about a day after they publish.");
    const assetIds = [...new Set(metricRows.map((r) => r.content_asset_id).filter((x): x is string => !!x))];
    const { data: assets } = assetIds.length
      ? await supabase.from("content_assets").select("id, platform, thread_parts").eq("user_id", userId).in("id", assetIds)
      : { data: [] };
    const assetById = new Map(((assets ?? []) as { id: string; platform: Platform; thread_parts: string[] | null }[]).map((a) => [a.id, a]));
    const pubByPost = new Map(pubs.map((p) => [p.buffer_post_id, p]));
    const scored: ScoredPost[] = metricRows.map((r) => {
      const pub = pubByPost.get(r.buffer_post_id);
      const asset = r.content_asset_id ? assetById.get(r.content_asset_id) : undefined;
      return {
        features: {
          platform: r.channel_service ? platformForService(r.channel_service) : (asset?.platform ?? null),
          isThread: (asset?.thread_parts?.length ?? 0) > 1 && r.channel_service === "twitter",
          hasMedia: Array.isArray(pub?.media_sent) && pub.media_sent.length > 0,
          length: pub?.text_sent.length ?? 0,
        },
        engagementRate: engagementRate(r.metrics),
      };
    });
    const insights = performanceInsights(scored);
    if (!insights.length) {
      return ok({ count: 0 }, `No clear pattern yet across ${scored.length} post${scored.length === 1 ? "" : "s"}. ORBIT needs at least 3 posts on each side of a comparison and a 1.5× difference.`);
    }
    const { data: existing } = await supabase.from("user_preferences").select("preference_key, preference_value, status").eq("user_id", userId);
    const seen = new Set(((existing ?? []) as { preference_key: string; preference_value: string }[]).map((p) => `${p.preference_key}::${p.preference_value}`));
    const rows = insights
      .filter((i) => !seen.has(`${i.preference_key}::${i.preference_value}`))
      .map((i) => ({
        user_id: userId,
        preference_key: i.preference_key,
        preference_value: i.preference_value,
        rationale: i.rationale,
        source: "inferred_from_feedback" as const,
        confidence: i.confidence,
        user_confirmed: false,
        status: "suggested" as const,
      }));
    if (!rows.length) return ok({ count: 0 }, "These patterns are already in your preferences.");
    const { error } = await supabase.from("user_preferences").insert(rows);
    if (error) throw new Error(error.message);
    await supabase.from("activity_logs").insert({ user_id: userId, action: "performance_suggestions", resource_type: "user_preferences", metadata: { count: rows.length } });
    revalidatePath("/memory");
    return ok({ count: rows.length }, `${rows.length} suggestion${rows.length === 1 ? "" : "s"} added to Memory for your review. Nothing changes until you accept.`);
  });
}
