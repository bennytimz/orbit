import type { Metadata } from "next";
import Link from "next/link";
import { Radar as RadarIcon } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { integrations } from "@/lib/env";
import { EmptyState, Notice, PageHeader } from "@/components/shared";
import { DiscoverPanel } from "@/components/radar/discover-panel";
import { DiscoveryCard, type DiscoveryWithSources } from "@/components/radar/discovery-card";
import { RadarFilters } from "@/components/radar/radar-filters";
import type { ResearchFeed } from "@/types/domain";

export const metadata: Metadata = { title: "Radar" };

const PAGE_SIZE = 24;

export default async function RadarPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; status?: string; sort?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const { supabase, userId } = await requireUser();
  const page = Math.max(1, Number(sp.page) || 1);

  let query = supabase
    .from("discoveries")
    .select("*, discovery_sources(research_sources(id, url, title, publisher, published_at, published_at_text, provider))", { count: "exact" })
    .eq("user_id", userId);
  if (sp.category) query = query.eq("category", sp.category);
  if (sp.status === "saved") query = query.eq("status", "saved");
  else if (sp.status === "dismissed") query = query.eq("status", "dismissed");
  else if (sp.status === "all") query = query;
  else query = query.neq("status", "dismissed");
  if (sp.q?.trim()) {
    const term = sp.q.trim().replace(/[%_,()]/g, " ");
    query = query.or(`title.ilike.%${term}%,summary.ilike.%${term}%`);
  }
  query = sp.sort === "recent" ? query.order("discovered_at", { ascending: false }) : query.order("relevance_score", { ascending: false, nullsFirst: false }).order("discovered_at", { ascending: false });
  const [{ data, count }, { data: feeds }, { data: profile }] = await Promise.all([
    query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    supabase.from("research_feeds").select("*").eq("user_id", userId).order("created_at"),
    supabase.from("profiles").select("timezone").eq("user_id", userId).single(),
  ]);
  const discoveries = (data ?? []) as unknown as DiscoveryWithSources[];
  const status = integrations();
  const tz = (profile?.timezone as string) ?? "UTC";
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  return (
    <div>
      <PageHeader title="Radar" description="Discover developments worth your attention. Every discovery links to the sources it came from, and relevance scores show their reasoning." />
      {!status.ai ? (
        <div className="mb-6">
          <Notice tone="warning" title="AI analysis unavailable">
            GEMINI_API_KEY is not configured, so Radar cannot analyze sources. Existing discoveries remain available.
          </Notice>
        </div>
      ) : null}
      <DiscoverPanel feeds={(feeds as ResearchFeed[]) ?? []} webSearchAvailable={status.webSearch} />
      <div className="mt-8">
        <RadarFilters />
        {discoveries.length === 0 ? (
          <EmptyState
            icon={RadarIcon}
            title={sp.q || sp.category || sp.status ? "No discoveries match these filters" : "No discoveries yet"}
            description={sp.q || sp.category || sp.status ? "Try clearing the filters." : "Search a topic above, analyze a URL, or scan your feeds. Radar will turn what it finds into source-backed opportunities."}
          />
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {discoveries.map((d) => (
                <DiscoveryCard key={d.id} discovery={d} timeZone={tz} />
              ))}
            </div>
            {totalPages > 1 ? (
              <nav className="mt-6 flex items-center justify-center gap-3 text-sm" aria-label="Pagination">
                {page > 1 ? <Link className="text-primary hover:underline" href={{ query: { ...sp, page: page - 1 } }}>Previous</Link> : null}
                <span className="text-muted-foreground">Page {page} of {totalPages}</span>
                {page < totalPages ? <Link className="text-primary hover:underline" href={{ query: { ...sp, page: page + 1 } }}>Next</Link> : null}
              </nav>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
