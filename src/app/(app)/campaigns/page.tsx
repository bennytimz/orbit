import type { Metadata } from "next";
import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { EmptyState, PageHeader, Pill } from "@/components/shared";
import { CampaignForm } from "@/components/campaigns/campaign-form";
import { OBJECTIVE_LABELS } from "@/engines/campaign/phases";
import type { Campaign } from "@/types/domain";

export const metadata: Metadata = { title: "Campaigns" };

export default async function CampaignsPage() {
  const { supabase, userId } = await requireUser();
  const [{ data }, { data: assets }] = await Promise.all([
    supabase.from("campaigns").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    supabase.from("campaign_assets").select("campaign_id, status, scheduled_at").eq("user_id", userId),
  ]);
  const campaigns = (data ?? []) as Campaign[];
  const stats = new Map<string, { total: number; sent: number; scheduled: number }>();
  for (const a of (assets ?? []) as { campaign_id: string; status: string; scheduled_at: string | null }[]) {
    const s = stats.get(a.campaign_id) ?? { total: 0, sent: 0, scheduled: 0 };
    s.total++;
    if (a.status === "sent_to_buffer") s.sent++;
    if (a.scheduled_at) s.scheduled++;
    stats.set(a.campaign_id, s);
  }

  return (
    <div>
      <PageHeader title="Campaigns" description="Group content into coordinated campaigns with phases, channels and a schedule." actions={<CampaignForm />} />
      {campaigns.length === 0 ? (
        <EmptyState icon={FolderKanban} title="No campaigns yet" description="Create a campaign, then add drafts from Studio and plan when each goes out." action={<CampaignForm />} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {campaigns.map((c) => {
            const s = stats.get(c.id) ?? { total: 0, sent: 0, scheduled: 0 };
            return (
              <Link key={c.id} href={`/campaigns/${c.id}`} className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/30">
                <div className="mb-2 flex flex-wrap gap-1.5">
                  <Pill tone="accent">{OBJECTIVE_LABELS[c.objective]}</Pill>
                  <Pill tone={c.status === "active" ? "success" : "neutral"}>{c.status}</Pill>
                </div>
                <h3 className="font-semibold">{c.name}</h3>
                {c.description ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{c.description}</p> : null}
                <p className="mt-3 text-xs text-muted-foreground">
                  {c.start_date ? `${c.start_date} → ${c.end_date ?? "open"}` : "No dates set"} · {s.total} item{s.total === 1 ? "" : "s"} · {s.scheduled} planned · {s.sent} sent to Buffer
                </p>
                {s.total ? (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <div className="h-full bg-success" style={{ width: `${(s.sent / s.total) * 100}%` }} />
                  </div>
                ) : null}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
