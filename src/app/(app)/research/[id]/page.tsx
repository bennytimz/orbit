import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, PenLine } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { integrations } from "@/lib/env";
import { buttonVariants } from "@/components/ui/button";
import { Notice, PageHeader, Pill } from "@/components/shared";
import { CATEGORY_LABELS } from "@/components/radar/labels";
import { RelevanceMeter } from "@/components/radar/relevance-meter";
import { ReportView } from "@/components/research/report-view";
import { GenerateReportButton } from "@/components/research/generate-report-button";
import { PerspectivePanel } from "@/components/research/perspective-panel";
import { SaveToBufferIdeasButton } from "@/components/buffer/save-to-ideas-button";
import { formatCalendarDate, formatDate, formatDateTime, hostname } from "@/lib/format";
import type { Discovery, Perspective, ResearchReport, ResearchSource } from "@/types/domain";

export const metadata: Metadata = { title: "Research" };

export default async function ResearchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, userId } = await requireUser();
  const [{ data: d }, { data: links }, { data: reports }, { data: perspectives }, { data: profile }] = await Promise.all([
    supabase.from("discoveries").select("*").eq("id", id).eq("user_id", userId).maybeSingle(),
    supabase.from("discovery_sources").select("research_sources(*)").eq("discovery_id", id).eq("user_id", userId),
    supabase.from("research_reports").select("*").eq("discovery_id", id).eq("user_id", userId).order("created_at", { ascending: false }).limit(1),
    supabase.from("perspectives").select("*").eq("discovery_id", id).eq("user_id", userId).order("created_at"),
    supabase.from("profiles").select("timezone").eq("user_id", userId).single(),
  ]);
  if (!d) notFound();
  const discovery = d as Discovery;
  const tz = (profile?.timezone as string) ?? "UTC";
  const sources = ((links ?? []) as unknown as { research_sources: ResearchSource | null }[]).map((l) => l.research_sources).filter((s): s is ResearchSource => !!s);
  const report = ((reports ?? []) as ResearchReport[])[0] ?? null;
  const sourceIndex = new Map(sources.map((s, i) => [s.id, { n: i + 1, source: s }]));
  const status = integrations();

  return (
    <div>
      <Link href="/radar" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Radar
      </Link>
      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-2 normal-case tracking-normal">
            <Pill tone="accent">{CATEGORY_LABELS[discovery.category]}</Pill>
            <span>Discovered {formatDate(discovery.discovered_at, tz)}</span>
            {discovery.event_date ? <span>· Event date: {formatCalendarDate(discovery.event_date)}</span> : <span>· Event date not stated</span>}
          </span>
        }
        title={discovery.title}
        description={discovery.summary}
        actions={
          <>
            <RelevanceMeter score={discovery.relevance_score} factors={discovery.relevance_factors} />
            <Link href={`/studio/new?discovery=${discovery.id}`} className={buttonVariants({ variant: "outline" })}>
              <PenLine /> Create content
            </Link>
            <SaveToBufferIdeasButton discoveryId={discovery.id} />
          </>
        }
      />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-8">
          {discovery.why_it_matters ? (
            <section aria-labelledby="why">
              <h2 id="why" className="mb-2 text-sm font-medium text-muted-foreground">Why it matters to you</h2>
              <p className="text-[15px] leading-relaxed">{discovery.why_it_matters}</p>
              <p className="mt-1 text-xs text-muted-foreground">AI interpretation based on your profile.</p>
            </section>
          ) : null}

          <section aria-labelledby="report">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 id="report" className="text-sm font-medium text-muted-foreground">
                Research report {report ? `· generated ${formatDateTime(report.created_at, tz)}` : ""}
              </h2>
              <GenerateReportButton discoveryId={discovery.id} hasReport={!!report} disabled={!status.ai} />
            </div>
            {report ? (
              <ReportView report={report} sourceIndex={Object.fromEntries([...sourceIndex].map(([k, v]) => [k, { n: v.n, title: v.source.title ?? hostname(v.source.url), url: v.source.url }]))} />
            ) : (
              <Notice title="No report yet">
                Generate a report to retrieve each source, extract claims with verbatim supporting passages, and surface dates, uncertainties and conflicting reports.
                {!status.ai ? " (Requires GEMINI_API_KEY.)" : ""}
              </Notice>
            )}
          </section>

          <section aria-labelledby="sources">
            <h2 id="sources" className="mb-3 text-sm font-medium text-muted-foreground">Sources ({sources.length})</h2>
            <ol className="space-y-2">
              {sources.map((s, i) => (
                <li key={s.id} className="rounded-lg border border-border bg-card p-3.5">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 font-mono text-xs text-muted-foreground">[{i + 1}]</span>
                    <div className="min-w-0 flex-1">
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1 text-sm font-medium hover:text-primary">
                        {s.title ?? s.url}
                        <ExternalLink className="mt-0.5 size-3 shrink-0 opacity-60" aria-hidden />
                      </a>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span>{s.publisher ?? hostname(s.url)}</span>
                        <span>Published: {s.published_at ? formatDate(s.published_at, tz) : s.published_at_text ?? "unknown"}</span>
                        <span>Retrieved: {formatDate(s.retrieved_at, tz)}</span>
                        <span>via {s.provider === "web_search" ? "web search" : s.provider === "rss" ? "RSS" : s.provider === "url" ? "submitted URL" : s.provider}</span>
                      </div>
                      <div className="mt-1.5">
                        {s.fetch_status === "fetched" ? (
                          <Pill tone="success">Full text retrieved</Pill>
                        ) : s.fetch_status === "blocked" ? (
                          <Pill tone="warning">Not retrieved: {String((s.metadata as Record<string, unknown>).last_fetch_error ?? "blocked")}</Pill>
                        ) : s.fetch_status === "failed" ? (
                          <Pill tone="warning">Retrieval failed: {String((s.metadata as Record<string, unknown>).last_fetch_error ?? "error")}</Pill>
                        ) : (
                          <Pill>Search excerpt only</Pill>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="xl:sticky xl:top-6 xl:self-start">
          <PerspectivePanel discoveryId={discovery.id} perspectives={(perspectives as Perspective[]) ?? []} aiAvailable={status.ai} transcriptionAvailable={status.transcription} />
        </aside>
      </div>
    </div>
  );
}
