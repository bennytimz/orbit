import type { Metadata } from "next";
import Link from "next/link";
import { BookOpenText } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState, PageHeader, Pill } from "@/components/shared";
import { formatDateTime } from "@/lib/format";
import type { ResearchReport } from "@/types/domain";

export const metadata: Metadata = { title: "Research" };

export default async function ResearchPage() {
  const { supabase, userId } = await requireUser();
  const [{ data }, { data: profile }, { data: inProgress }] = await Promise.all([
    supabase.from("research_reports").select("id, discovery_id, title, summary, claims, uncertainties, conflicts, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
    supabase.from("profiles").select("timezone").eq("user_id", userId).single(),
    supabase.from("discoveries").select("id, title").eq("user_id", userId).eq("status", "saved").order("discovered_at", { ascending: false }).limit(6),
  ]);
  const reports = (data ?? []) as Pick<ResearchReport, "id" | "discovery_id" | "title" | "summary" | "claims" | "uncertainties" | "conflicts" | "created_at">[];
  const tz = (profile?.timezone as string) ?? "UTC";
  // Show the latest report per discovery.
  const latest = [...new Map(reports.map((r) => [r.discovery_id, r])).values()];

  return (
    <div>
      <PageHeader title="Research" description="Source-backed reports for the developments you've investigated." />
      {inProgress?.length ? (
        <div className="mb-6 rounded-xl border border-border p-4">
          <p className="mb-2 text-sm font-medium">Saved discoveries waiting for research</p>
          <ul className="flex flex-wrap gap-2">
            {inProgress.map((d) => (
              <li key={d.id}>
                <Link href={`/research/${d.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  {d.title.length > 60 ? `${d.title.slice(0, 60)}…` : d.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {latest.length === 0 ? (
        <EmptyState icon={BookOpenText} title="No research reports yet" description="Open a discovery in Radar and generate a report." action={<Link href="/radar" className={buttonVariants()}>Go to Radar</Link>} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {latest.map((r) => {
            const verified = r.claims.filter((c) => c.passage_verified).length;
            return (
              <Link key={r.id} href={`/research/${r.discovery_id}`} className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/30">
                <p className="text-xs text-muted-foreground">{formatDateTime(r.created_at, tz)}</p>
                <h3 className="mt-1 font-semibold">{r.title}</h3>
                <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{r.summary}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Pill tone={verified ? "success" : "neutral"}>
                    {verified}/{r.claims.length} passages verified
                  </Pill>
                  {r.conflicts.length ? <Pill tone="warning">{r.conflicts.length} conflict{r.conflicts.length === 1 ? "" : "s"}</Pill> : null}
                  {r.uncertainties.length ? <Pill>{r.uncertainties.length} uncertainties</Pill> : null}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
