"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserForAction } from "@/lib/auth";
import { fail, ok, runAction, type ActionResult } from "@/lib/action-result";
import { extractArticle } from "@/lib/research/extract";
import { fetchFeed } from "@/lib/research/rss";
import { assertPublicUrl, FetchBlockedError } from "@/lib/research/safe-fetch";
import { discoverFromFeedItems, discoverFromItems, discoverFromWeb, FEED_MAX_ITEMS, type DiscoverResult } from "@/engines/radar/discover";
import { buildResearchReport } from "@/engines/radar/research";
import type { Discovery, ResearchFeed } from "@/types/domain";

type DiscoverSummary = { count: number; sourcesFound: number; dropped: number; firstId: string | null };

function summarize(r: DiscoverResult): DiscoverSummary {
  return { count: r.discoveries.length, sourcesFound: r.sourcesFound, dropped: r.dropped, firstId: r.discoveries[0]?.id ?? null };
}

export async function discoverWeb(query: string): Promise<ActionResult<DiscoverSummary>> {
  return runAction("Research is temporarily unavailable. Your saved work is safe.", async () => {
    const { supabase, userId } = await requireUserForAction();
    const q = z.string().trim().max(300).parse(query);
    const result = await discoverFromWeb(supabase, userId, q || null);
    revalidatePath("/radar");
    revalidatePath("/dashboard");
    if (!result.discoveries.length) return fail("Sources were found, but none could be turned into a well-supported discovery. Try a more specific topic.");
    return ok(summarize(result), `${result.discoveries.length} discover${result.discoveries.length === 1 ? "y" : "ies"} from ${result.sourcesFound} sources.`);
  });
}

export async function discoverFromUrls(urls: string[], focus: string): Promise<ActionResult<DiscoverSummary & { failures: { url: string; reason: string }[] }>> {
  return runAction("Could not analyze those URLs.", async () => {
    const { supabase, userId } = await requireUserForAction();
    const list = z.array(z.string().trim().url("Enter valid URLs (including https://).")).min(1).max(5).parse(urls);
    const outcomes = await Promise.all(list.map(async (url) => ({ url, outcome: await extractArticle(url) })));
    const failures = outcomes.filter((o) => !o.outcome.ok).map((o) => ({ url: o.url, reason: o.outcome.ok ? "" : o.outcome.reason }));
    const items = outcomes.flatMap((o) =>
      o.outcome.ok
        ? [
            {
              source: {
                url: o.outcome.article.url,
                title: o.outcome.article.title,
                publisher: o.outcome.article.publisher,
                publishedAtIso: o.outcome.article.publishedAt,
                provider: "url" as const,
                excerpt: o.outcome.article.text,
                contentHash: o.outcome.article.contentHash,
                fetchStatus: "fetched" as const,
              },
              passages: [o.outcome.article.text.slice(0, 6000)],
            },
          ]
        : [],
    );
    if (!items.length) return fail(`None of the URLs could be retrieved: ${failures.map((f) => f.reason).join(" ")}`);
    const result = await discoverFromItems(supabase, userId, items, focus.trim() || "User-submitted sources", "url");
    revalidatePath("/radar");
    return ok({ ...summarize(result), failures }, `Analyzed ${items.length} source${items.length === 1 ? "" : "s"}.`);
  });
}

export async function addFeed(url: string): Promise<ActionResult<ResearchFeed>> {
  return runAction("Could not add the feed.", async () => {
    const { supabase, userId } = await requireUserForAction();
    const clean = z.string().trim().url().parse(url);
    try {
      await assertPublicUrl(clean);
    } catch (e) {
      if (e instanceof FetchBlockedError) return fail(e.message);
      throw e;
    }
    let title: string | null = null;
    try {
      title = (await fetchFeed(clean)).title;
    } catch (e) {
      return fail(`Could not read that feed: ${e instanceof Error ? e.message : "unknown error"}`);
    }
    const { data, error } = await supabase.from("research_feeds").insert({ user_id: userId, url: clean, title }).select("*").single();
    if (error) return fail(error.code === "23505" ? "You already follow this feed." : "Could not save the feed.");
    revalidatePath("/radar");
    revalidatePath("/settings");
    return ok(data as ResearchFeed, "Feed added.");
  });
}

export async function removeFeed(id: string): Promise<ActionResult> {
  return runAction("Could not remove the feed.", async () => {
    const { supabase, userId } = await requireUserForAction();
    await supabase.from("research_feeds").delete().eq("id", z.string().uuid().parse(id)).eq("user_id", userId);
    revalidatePath("/radar");
    revalidatePath("/settings");
    return ok(undefined, "Feed removed.");
  });
}

/** Reads recent items from followed feeds and analyzes them into discoveries. */
export async function scanFeeds(): Promise<ActionResult<DiscoverSummary & { feedErrors: string[] }>> {
  return runAction("Feed scan failed. Your saved work is safe.", async () => {
    const { supabase, userId } = await requireUserForAction();
    const { data } = await supabase.from("research_feeds").select("*").eq("user_id", userId);
    const feeds = (data as ResearchFeed[] | null) ?? [];
    if (!feeds.length) return fail("You don't follow any feeds yet. Add an RSS or Atom feed first.");
    const feedErrors: string[] = [];
    const cutoff = Date.now() - 14 * 86_400_000;
    const items: Parameters<typeof discoverFromItems>[2] = [];
    await Promise.all(
      feeds.map(async (feed) => {
        try {
          const parsed = await fetchFeed(feed.url);
          await supabase.from("research_feeds").update({ last_fetched_at: new Date().toISOString(), last_error: null, title: feed.title ?? parsed.title }).eq("id", feed.id).eq("user_id", userId);
          parsed.items
            .filter((i) => !i.publishedAt || new Date(i.publishedAt).getTime() >= cutoff)
            .slice(0, 6)
            .forEach((i) =>
              items.push({
                source: { url: i.url, title: i.title, publisher: parsed.title, publishedAtIso: i.publishedAt, provider: "rss", excerpt: i.summary },
                passages: i.summary ? [i.summary] : [],
              }),
            );
        } catch (e) {
          const msg = e instanceof Error ? e.message : "unknown error";
          feedErrors.push(`${feed.title ?? feed.url}: ${msg}`);
          await supabase.from("research_feeds").update({ last_error: msg }).eq("id", feed.id).eq("user_id", userId);
        }
      }),
    );
    if (!items.length) return fail(feedErrors.length ? `No feed items could be read. ${feedErrors.join(" ")}` : "No feed items from the last 14 days.");
    // Newest first; discoverFromFeedItems analyzes only the most recent few, in small sequential batches.
    items.sort((a, b) => (b.source.publishedAtIso ?? "").localeCompare(a.source.publishedAtIso ?? ""));
    const result = await discoverFromFeedItems(supabase, userId, items, "Recent items from followed feeds");
    revalidatePath("/radar");
    const skipped = result.failedBatches ? ` ${result.failedBatches} of ${result.batches} batches timed out or failed and were skipped.` : "";
    return ok(
      { ...summarize(result), feedErrors },
      `${result.discoveries.length} discoveries from the ${Math.min(items.length, FEED_MAX_ITEMS)} most recent of ${items.length} feed items.${skipped}`,
    );
  });
}

export async function setDiscoveryStatus(id: string, status: Discovery["status"]): Promise<ActionResult> {
  return runAction("Could not update the discovery.", async () => {
    const { supabase, userId } = await requireUserForAction();
    const s = z.enum(["new", "saved", "reviewed", "dismissed", "in_progress", "used"]).parse(status);
    const { error } = await supabase.from("discoveries").update({ status: s }).eq("id", z.string().uuid().parse(id)).eq("user_id", userId);
    if (error) throw error;
    revalidatePath("/radar");
    revalidatePath(`/research/${id}`);
    return ok(undefined);
  });
}

export async function generateReport(discoveryId: string): Promise<ActionResult<{ reportId: string; unfetched: { url: string; reason: string | null }[] }>> {
  return runAction("Research is temporarily unavailable. Your saved work is safe.", async () => {
    const { supabase, userId } = await requireUserForAction();
    const id = z.string().uuid().parse(discoveryId);
    const result = await buildResearchReport(supabase, userId, id);
    revalidatePath(`/research/${id}`);
    revalidatePath("/research");
    return ok(
      {
        reportId: result.report.id,
        unfetched: result.sourceStatuses.filter((s) => !s.fetched).map((s) => ({ url: s.source.url, reason: s.reason })),
      },
      "Research report ready.",
    );
  });
}
