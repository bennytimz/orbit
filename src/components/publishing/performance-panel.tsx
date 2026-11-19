"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ExternalLink, Lightbulb, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice, Pill } from "@/components/shared";
import { useAction } from "@/hooks/use-action";
import { loadPerformance, suggestFromPerformance, type PerformanceData } from "@/app/actions/performance";
import { metricValue } from "@/engines/evolution/performance";
import { formatDateTime } from "@/lib/format";

const COLUMNS: { type: string; label: string }[] = [
  { type: "impressions", label: "Impressions" },
  { type: "reactions", label: "Reactions" },
  { type: "comments", label: "Comments" },
  { type: "reposts", label: "Reposts" },
  { type: "clicks", label: "Clicks" },
];

function fmt(v: number | null, pct = false) {
  if (v === null) return "–";
  return pct ? `${v.toFixed(2)}%` : Math.round(v).toLocaleString();
}

/**
 * Metrics Buffer reports for posts ORBIT sent. Loads cached values and lets the
 * server refresh them from Buffer when they are older than 12 hours.
 */
export function PerformancePanel({ timeZone }: { timeZone: string }) {
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const load = useAction(loadPerformance, { silentSuccess: true });
  const suggest = useAction(suggestFromPerformance);

  const run = async (force: boolean) => {
    const r = await load.run(force);
    if (r.ok) {
      setData(r.data);
      setLoadError(null);
    } else setLoadError(r.error);
  };

  // Load once when the panel opens; the server refreshes from Buffer only if the cache is stale.
  useEffect(() => {
    let cancelled = false;
    loadPerformance(false)
      .then((r) => {
        if (cancelled) return;
        if (r.ok) setData(r.data);
        else setLoadError(r.error);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Could not load performance data.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="mt-8" aria-labelledby="performance-heading">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 id="performance-heading" className="text-base font-semibold">
          Performance
        </h2>
        {data?.availability === "ok" ? (
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" onClick={() => run(true)} disabled={load.pending}>
              {load.pending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Refresh
            </Button>
            <Button size="sm" variant="outline" onClick={() => suggest.run()} disabled={suggest.pending || !data.rows.length}>
              {suggest.pending ? <Loader2 className="animate-spin" /> : <Lightbulb />} Suggest preferences
            </Button>
          </div>
        ) : null}
      </div>
      <p className="mb-3 text-sm text-muted-foreground">
        Metrics Buffer reports for posts ORBIT sent. Buffer refreshes them from each network about once a day; ORBIT re-reads them at most every 12 hours. Suggestions go to{" "}
        <Link href="/memory" className="underline">
          Memory
        </Link>{" "}
        and change nothing until you accept them.
      </p>

      {!data && !loadError ? (
        <p className="flex items-center gap-2 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading metrics…
        </p>
      ) : null}
      {loadError ? <Notice tone="danger" title="Couldn't load performance">{loadError}</Notice> : null}

      {data?.availability === "not_set_up" ? <Notice tone="warning">Performance tracking isn&apos;t set up on this server yet (database migration pending).</Notice> : null}
      {data?.availability === "not_connected" ? <Notice>Connect Buffer to see how the posts ORBIT sends perform.</Notice> : null}
      {data?.availability === "needs_reauth" ? <Notice tone="warning">Your Buffer connection needs to be renewed before metrics can be read.</Notice> : null}
      {data?.availability === "oauth_no_insights" ? (
        <Notice title="Metrics need a personal API key connection">
          Buffer only lets personal API keys read post metrics (the <code>insightsRead</code> scope can&apos;t be granted through OAuth). This account is connected with OAuth, so ORBIT can&apos;t read metrics for its {data.orbitPostCount} Buffer post
          {data.orbitPostCount === 1 ? "" : "s"}. To see them, disconnect and reconnect with a Buffer personal API key.
        </Notice>
      ) : null}

      {data?.availability === "ok" ? (
        <>
          {data.error ? (
            <div className="mb-3">
              <Notice tone="warning">{data.error}</Notice>
            </div>
          ) : null}
          {data.rows.length ? (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Post</th>
                    <th className="px-3 py-2 font-medium">Sent</th>
                    {COLUMNS.map((c) => (
                      <th key={c.type} className="px-3 py-2 text-right font-medium">
                        {c.label}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right font-medium">Eng. rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.rows.map((r) => (
                    <tr key={r.bufferPostId} className="align-top">
                      <td className="max-w-xs px-3 py-2.5">
                        {r.contentAssetId ? (
                          <Link href={`/studio/${r.contentAssetId}`} className="line-clamp-2 hover:text-primary">
                            {r.text || r.bufferPostId}
                          </Link>
                        ) : (
                          <span className="line-clamp-2">{r.text || r.bufferPostId}</span>
                        )}
                        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          {r.channelName ?? r.channelService}
                          {r.externalLink ? (
                            <a href={r.externalLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline">
                              View <ExternalLink className="size-3" />
                            </a>
                          ) : null}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">{r.sentAt ? formatDateTime(r.sentAt, timeZone) : "–"}</td>
                      {COLUMNS.map((c) => (
                        <td key={c.type} className="px-3 py-2.5 text-right tabular-nums">
                          {fmt(metricValue(r.metrics, c.type))}
                        </td>
                      ))}
                      <td className="px-3 py-2.5 text-right tabular-nums">{fmt(r.engagementRate, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {data.orbitPostCount
                ? `None of the ${data.orbitPostCount} post${data.orbitPostCount === 1 ? "" : "s"} ORBIT created in Buffer has been sent yet. Buffer reports metrics only for sent posts, about a day after they publish.`
                : "ORBIT hasn't sent any posts to Buffer yet."}
            </p>
          )}
          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <Pill>Source: Buffer post metrics</Pill>
            {data.lastFetchedAt ? `Last read from Buffer ${formatDateTime(data.lastFetchedAt, timeZone)}.` : "Not read from Buffer yet."}
          </p>
        </>
      ) : null}
    </section>
  );
}
