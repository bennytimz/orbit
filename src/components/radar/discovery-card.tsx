"use client";

import Link from "next/link";
import { Bookmark, BookmarkCheck, ExternalLink, EyeOff, Undo2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Pill } from "@/components/shared";
import { useAction } from "@/hooks/use-action";
import { setDiscoveryStatus } from "@/app/actions/radar";
import { formatDate, hostname } from "@/lib/format";
import type { Discovery, ResearchSource } from "@/types/domain";
import { CATEGORY_LABELS } from "./labels";
import { RelevanceMeter } from "./relevance-meter";

export type DiscoveryWithSources = Discovery & {
  discovery_sources: { research_sources: Pick<ResearchSource, "id" | "url" | "title" | "publisher" | "published_at" | "published_at_text" | "provider"> | null }[];
};

export function DiscoveryCard({ discovery: d, timeZone }: { discovery: DiscoveryWithSources; timeZone: string }) {
  const status = useAction(setDiscoveryStatus, { silentSuccess: true });
  const sources = d.discovery_sources.map((s) => s.research_sources).filter((s): s is NonNullable<typeof s> => !!s);
  const newest = sources.map((s) => s.published_at).filter(Boolean).sort().at(-1) ?? null;
  const saved = d.status === "saved";

  return (
    <article className="flex flex-col rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/30">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill tone="accent">{CATEGORY_LABELS[d.category]}</Pill>
          {d.status === "in_progress" ? <Pill>In progress</Pill> : null}
          {d.status === "used" ? <Pill tone="success">Used</Pill> : null}
          {d.status === "reviewed" ? <Pill>Researched</Pill> : null}
        </div>
        <RelevanceMeter score={d.relevance_score} factors={d.relevance_factors} />
      </div>
      <h3 className="text-[15px] leading-snug font-semibold">
        <Link href={`/research/${d.id}`} className="hover:text-primary focus-visible:underline focus-visible:outline-none">
          {d.title}
        </Link>
      </h3>
      <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{d.summary}</p>
      {d.why_it_matters ? (
        <p className="mt-3 line-clamp-2 border-l-2 border-primary/40 pl-3 text-sm text-foreground/80">
          <span className="sr-only">Why it matters: </span>
          {d.why_it_matters}
        </p>
      ) : null}
      {d.topics.length ? (
        <div className="mt-3 flex flex-wrap gap-1">
          {d.topics.slice(0, 4).map((t) => (
            <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {t}
            </span>
          ))}
        </div>
      ) : null}
      <div className="mt-auto pt-4">
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>
            {sources.length} source{sources.length === 1 ? "" : "s"}
            {sources[0] ? ` · ${sources[0].publisher ?? hostname(sources[0].url)}` : ""}
          </span>
          <span>{newest ? `Published ${formatDate(newest, timeZone)}` : "Publication date unknown"}</span>
          {d.event_date ? <span>Event: {d.event_date}</span> : null}
        </div>
        <div className="flex items-center gap-1.5">
          <Link href={`/research/${d.id}`} className={buttonVariants({ size: "sm" })}>
            Open research
          </Link>
          {sources[0] ? (
            <a href={sources[0].url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "ghost", size: "icon-sm" })} aria-label="Open primary source in a new tab">
              <ExternalLink />
            </a>
          ) : null}
          <div className="ml-auto flex gap-1">
            <Button variant="ghost" size="icon-sm" disabled={status.pending} aria-label={saved ? "Unsave" : "Save"} onClick={() => status.run(d.id, saved ? "new" : "saved")}>
              {saved ? <BookmarkCheck className="text-primary" /> : <Bookmark />}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={status.pending}
              aria-label={d.status === "dismissed" ? "Restore" : "Dismiss"}
              onClick={() => status.run(d.id, d.status === "dismissed" ? "new" : "dismissed")}
            >
              {d.status === "dismissed" ? <Undo2 /> : <EyeOff />}
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}
