import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { EmptyState, GuardianPill, PageHeader, Pill } from "@/components/shared";
import { IssueItem } from "@/components/guardian/guardian-panel";
import { PLATFORMS } from "@/engines/studio/platforms";
import type { ContentAsset, GuardianIssue } from "@/types/domain";

export const metadata: Metadata = { title: "Guardian" };

export default async function GuardianPage({ searchParams }: { searchParams: Promise<{ severity?: string }> }) {
  const sp = await searchParams;
  const { supabase, userId } = await requireUser();
  let q = supabase.from("guardian_issues").select("*").eq("user_id", userId).eq("review_status", "open");
  if (sp.severity) q = q.eq("severity", sp.severity);
  const [{ data: issues }, { data: attention }] = await Promise.all([
    q.order("created_at", { ascending: false }).limit(200),
    supabase
      .from("content_assets")
      .select("id, title, platform, status, guardian_status")
      .eq("user_id", userId)
      .in("guardian_status", ["unchecked", "stale", "blocking"])
      .in("status", ["draft", "in_review", "approved", "scheduled"])
      .order("updated_at", { ascending: false })
      .limit(30),
  ]);
  const list = (issues ?? []) as GuardianIssue[];
  const assetIds = [...new Set(list.map((i) => i.content_asset_id))];
  const { data: assets } = assetIds.length ? await supabase.from("content_assets").select("id, title, platform, guardian_status").eq("user_id", userId).in("id", assetIds) : { data: [] };
  const assetMap = new Map(((assets ?? []) as Pick<ContentAsset, "id" | "title" | "platform" | "guardian_status">[]).map((a) => [a.id, a]));
  const byAsset = new Map<string, GuardianIssue[]>();
  for (const i of list) byAsset.set(i.content_asset_id, [...(byAsset.get(i.content_asset_id) ?? []), i]);
  const counts = { blocking: list.filter((i) => i.severity === "blocking").length, warning: list.filter((i) => i.severity === "warning").length, info: list.filter((i) => i.severity === "info").length };
  const needsCheck = ((attention ?? []) as Pick<ContentAsset, "id" | "title" | "platform" | "status" | "guardian_status">[]).filter((a) => a.guardian_status !== "blocking");

  return (
    <div>
      <PageHeader title="Guardian" description="Open quality issues across your content: unsupported claims, platform limits, outdated details and voice drift." />
      <nav className="mb-6 flex flex-wrap gap-2" aria-label="Filter by severity">
        {[
          ["", `All open (${list.length})`],
          ["blocking", `Blocking (${counts.blocking})`],
          ["warning", `Warnings (${counts.warning})`],
          ["info", `Info (${counts.info})`],
        ].map(([k, label]) => (
          <Link
            key={k}
            href={k ? `/guardian?severity=${k}` : "/guardian"}
            className={`rounded-lg border px-3 py-1.5 text-sm ${(sp.severity ?? "") === k ? "border-primary/60 bg-primary/10" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {needsCheck.length ? (
        <section className="mb-8 rounded-xl border border-warning/30 bg-warning/5 p-4">
          <h2 className="mb-2 text-sm font-semibold">Not checked since last edit ({needsCheck.length})</h2>
          <ul className="flex flex-wrap gap-2">
            {needsCheck.map((a) => (
              <li key={a.id}>
                <Link href={`/studio/${a.id}`} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm hover:border-primary/40">
                  <span className="text-xs text-muted-foreground">{PLATFORMS[a.platform].label}</span>
                  {a.title.length > 50 ? `${a.title.slice(0, 50)}…` : a.title}
                  <GuardianPill status={a.guardian_status} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {list.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="No open issues" description="Run Guardian from any draft in Studio. Findings that need your attention will appear here." />
      ) : (
        <div className="space-y-6">
          {[...byAsset.entries()].map(([assetId, assetIssues]) => {
            const a = assetMap.get(assetId);
            return (
              <section key={assetId} className="rounded-xl border border-border bg-card p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  {a ? <span className="text-xs text-muted-foreground">{PLATFORMS[a.platform].label}</span> : null}
                  <Link href={`/studio/${assetId}`} className="font-medium hover:text-primary">
                    {a?.title ?? "Content"}
                  </Link>
                  {a ? <GuardianPill status={a.guardian_status} /> : null}
                  <Pill className="ml-auto">{assetIssues.length} open</Pill>
                </div>
                <ul className="space-y-2">
                  {assetIssues.map((i) => (
                    <IssueItem key={i.id} issue={i} compact={i.severity === "info"} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
