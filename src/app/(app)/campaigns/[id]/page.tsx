import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader, Pill } from "@/components/shared";
import { CampaignForm } from "@/components/campaigns/campaign-form";
import { CampaignPlanner, type PlannerItem } from "@/components/campaigns/campaign-planner";
import { AddExistingContent } from "@/components/campaigns/add-existing-content";
import { DeleteCampaignButton } from "@/components/campaigns/delete-campaign-button";
import { OBJECTIVE_LABELS } from "@/engines/campaign/phases";
import type { BufferChannelRow, Campaign, ContentAsset } from "@/types/domain";

export const metadata: Metadata = { title: "Campaign" };

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, userId } = await requireUser();
  const { data: row } = await supabase.from("campaigns").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!row) notFound();
  const campaign = row as Campaign;
  const [{ data: items }, { data: channels }, { data: available }, { data: profile }, { data: pubs }] = await Promise.all([
    supabase
      .from("campaign_assets")
      .select("*, content_assets(id, title, body, platform, status, guardian_status)")
      .eq("campaign_id", id)
      .eq("user_id", userId)
      .order("sequence_number"),
    supabase.from("buffer_channels").select("channel_id, name, display_name, service, is_disconnected").eq("user_id", userId).order("name"),
    supabase.from("content_assets").select("id, title, platform, status").eq("user_id", userId).is("campaign_id", null).not("status", "in", "(archived,rejected)").order("updated_at", { ascending: false }).limit(50),
    supabase.from("profiles").select("timezone").eq("user_id", userId).single(),
    supabase.from("buffer_publications").select("campaign_asset_id, operation_status, buffer_post_id, channel_name").eq("user_id", userId).eq("campaign_id", id),
  ]);
  const tz = (profile?.timezone as string) ?? "UTC";
  const pubsByItem = new Map<string, { status: string; postId: string | null; channel: string | null }[]>();
  for (const p of (pubs ?? []) as { campaign_asset_id: string | null; operation_status: string; buffer_post_id: string | null; channel_name: string | null }[]) {
    if (!p.campaign_asset_id) continue;
    const list = pubsByItem.get(p.campaign_asset_id) ?? [];
    list.push({ status: p.operation_status, postId: p.buffer_post_id, channel: p.channel_name });
    pubsByItem.set(p.campaign_asset_id, list);
  }
  const plannerItems: PlannerItem[] = ((items ?? []) as unknown as (PlannerItem & { content_assets: PlannerItem["asset"] | null })[])
    .filter((i) => i.content_assets)
    .map((i) => ({
      id: i.id,
      phase: i.phase,
      scheduled_at: i.scheduled_at,
      channel_ids: i.channel_ids,
      status: i.status,
      asset: i.content_assets!,
      publications: pubsByItem.get(i.id) ?? [],
    }));
  const sentCount = plannerItems.filter((i) => i.status === "sent_to_buffer").length;

  return (
    <div>
      <Link href="/campaigns" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Campaigns
      </Link>
      <PageHeader
        eyebrow={
          <span className="flex flex-wrap gap-1.5 normal-case tracking-normal">
            <Pill tone="accent">{OBJECTIVE_LABELS[campaign.objective]}</Pill>
            <Pill>{campaign.status}</Pill>
          </span>
        }
        title={campaign.name}
        description={campaign.description ?? undefined}
        actions={
          <>
            <Link href={`/studio/new?campaign=${campaign.id}`} className={buttonVariants({ size: "sm" })}>
              <Plus /> Generate content
            </Link>
            <CampaignForm campaign={campaign} />
            <DeleteCampaignButton id={campaign.id} />
          </>
        }
      />
      <div className="mb-6 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
        <span>{campaign.start_date ? `${campaign.start_date} → ${campaign.end_date ?? "open"}` : "No dates set"}</span>
        {campaign.target_audience ? <span>Audience: {campaign.target_audience}</span> : null}
        <span>
          {plannerItems.length} item{plannerItems.length === 1 ? "" : "s"} · {sentCount} sent to Buffer
        </span>
      </div>

      <CampaignPlanner
        items={plannerItems}
        phases={campaign.phases}
        channels={((channels ?? []) as Pick<BufferChannelRow, "channel_id" | "name" | "display_name" | "service" | "is_disconnected">[]).filter((c) => !c.is_disconnected)}
        timeZone={tz}
        startDate={campaign.start_date}
      />

      <div className="mt-8">
        <AddExistingContent campaignId={campaign.id} phases={campaign.phases} assets={(available ?? []) as Pick<ContentAsset, "id" | "title" | "platform" | "status">[]} />
      </div>
    </div>
  );
}
