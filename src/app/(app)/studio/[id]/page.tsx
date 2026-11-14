import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { integrations } from "@/lib/env";
import { getConnection } from "@/lib/buffer/credentials";
import { ContentEditor } from "@/components/studio/content-editor";
import { GuardianPanel } from "@/components/guardian/guardian-panel";
import { PublishDialog } from "@/components/publishing/publish-dialog";
import { AddToCampaign } from "@/components/campaigns/add-to-campaign";
import { ContentStatusPill, GuardianPill } from "@/components/shared";
import { PLATFORMS } from "@/engines/studio/platforms";
import type { BufferChannelRow, ContentAsset, ContentVersion, GuardianIssue, GuardianReport, ResearchSource } from "@/types/domain";

export const metadata: Metadata = { title: "Editor" };

export default async function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, userId } = await requireUser();
  const { data: row } = await supabase.from("content_assets").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!row) notFound();
  const asset = row as ContentAsset;
  const status = integrations();

  const [{ data: versions }, { data: sourceRows }, { data: reports }, { data: siblings }, { data: channels }, { data: campaigns }, { data: profile }, { data: campaignAssets }] = await Promise.all([
    supabase.from("content_versions").select("*").eq("content_asset_id", id).eq("user_id", userId).order("version_number", { ascending: false }).limit(30),
    supabase.from("content_sources").select("claim_text, research_sources(id, url, title, publisher, published_at)").eq("content_asset_id", id).eq("user_id", userId),
    supabase.from("guardian_reports").select("*").eq("content_asset_id", id).eq("user_id", userId).order("checked_at", { ascending: false }).limit(1),
    asset.generation_group
      ? supabase.from("content_assets").select("id, platform, title").eq("user_id", userId).eq("generation_group", asset.generation_group).order("created_at")
      : Promise.resolve({ data: [] }),
    supabase.from("buffer_channels").select("*").eq("user_id", userId).order("name"),
    supabase.from("campaigns").select("id, name").eq("user_id", userId).neq("status", "archived").order("created_at", { ascending: false }),
    supabase.from("profiles").select("timezone").eq("user_id", userId).single(),
    supabase.from("campaign_assets").select("id, campaign_id, scheduled_at, channel_ids").eq("content_asset_id", id).eq("user_id", userId),
  ]);
  const report = ((reports ?? []) as GuardianReport[])[0] ?? null;
  const { data: issues } = report
    ? await supabase.from("guardian_issues").select("*").eq("guardian_report_id", report.id).eq("user_id", userId).order("created_at")
    : { data: [] };
  const connection = status.serviceRole ? await getConnection(userId).catch(() => null) : null;

  const sources = new Map<string, { source: Pick<ResearchSource, "id" | "url" | "title" | "publisher" | "published_at">; claims: string[] }>();
  for (const r of (sourceRows ?? []) as unknown as { claim_text: string | null; research_sources: Pick<ResearchSource, "id" | "url" | "title" | "publisher" | "published_at"> | null }[]) {
    if (!r.research_sources) continue;
    const entry = sources.get(r.research_sources.id) ?? { source: r.research_sources, claims: [] };
    if (r.claim_text) entry.claims.push(r.claim_text);
    sources.set(r.research_sources.id, entry);
  }
  const tz = (profile?.timezone as string) ?? "UTC";
  const ca = ((campaignAssets ?? []) as { id: string; campaign_id: string; scheduled_at: string | null; channel_ids: string[] }[])[0] ?? null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href="/studio" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Studio
        </Link>
        {(siblings ?? []).length > 1 ? (
          <nav aria-label="Platform variants" className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
            {((siblings ?? []) as { id: string; platform: ContentAsset["platform"] }[]).map((s) => (
              <Link
                key={s.id}
                href={`/studio/${s.id}`}
                aria-current={s.id === id ? "page" : undefined}
                className={`rounded-md px-2.5 py-1 text-xs ${s.id === id ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {PLATFORMS[s.platform].label}
              </Link>
            ))}
          </nav>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <ContentStatusPill status={asset.status} />
          <GuardianPill status={asset.guardian_status} />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <ContentEditor
          asset={asset}
          versions={(versions as ContentVersion[]) ?? []}
          sources={[...sources.values()]}
          timeZone={tz}
          aiAvailable={status.ai}
        />
        <div className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <PublishDialog
            asset={asset}
            channels={(channels as BufferChannelRow[]) ?? []}
            connection={connection ? { status: connection.status, organizationName: connection.organization_name } : null}
            openIssues={((issues as GuardianIssue[]) ?? []).filter((i) => i.review_status === "open")}
            timeZone={tz}
            campaignAsset={ca}
          />
          <GuardianPanel assetId={asset.id} report={report} issues={(issues as GuardianIssue[]) ?? []} guardianStatus={asset.guardian_status} aiAvailable={status.ai} />
          <AddToCampaign assetId={asset.id} campaigns={(campaigns ?? []) as { id: string; name: string }[]} currentCampaignId={asset.campaign_id} />
        </div>
      </div>
    </div>
  );
}
