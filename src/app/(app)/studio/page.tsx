import type { Metadata } from "next";
import Link from "next/link";
import { PenLine, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { buttonVariants } from "@/components/ui/button";
import { ContentStatusPill, EmptyState, GuardianPill, PageHeader } from "@/components/shared";
import { StudioFilters } from "@/components/studio/studio-filters";
import { PLATFORMS } from "@/engines/studio/platforms";
import { relativeTime } from "@/lib/format";
import type { ContentAsset } from "@/types/domain";

export const metadata: Metadata = { title: "Studio" };

export default async function StudioPage({ searchParams }: { searchParams: Promise<{ status?: string; platform?: string }> }) {
  const sp = await searchParams;
  const { supabase, userId } = await requireUser();
  let query = supabase.from("content_assets").select("id,title,body,platform,status,guardian_status,updated_at,ai_generated,generation_group").eq("user_id", userId);
  if (sp.status) query = query.eq("status", sp.status);
  else query = query.neq("status", "archived");
  if (sp.platform) query = query.eq("platform", sp.platform);
  const { data } = await query.order("updated_at", { ascending: false }).limit(100);
  const assets = (data ?? []) as Pick<ContentAsset, "id" | "title" | "body" | "platform" | "status" | "guardian_status" | "updated_at" | "ai_generated" | "generation_group">[];

  return (
    <div>
      <PageHeader
        title="Studio"
        description="Draft, adapt and verify platform-specific content. Your edits are versioned and never silently overwritten."
        actions={
          <Link href="/studio/new" className={buttonVariants()}>
            <Plus /> New content
          </Link>
        }
      />
      <StudioFilters />
      {assets.length === 0 ? (
        <EmptyState
          icon={PenLine}
          title="No content yet"
          description="Start from a research report, an idea, or a blank draft."
          action={<Link href="/studio/new" className={buttonVariants()}>Create content</Link>}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <ul className="divide-y divide-border">
            {assets.map((a) => (
              <li key={a.id}>
                <Link href={`/studio/${a.id}`} className="flex flex-col gap-2 p-4 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:gap-4">
                  <span className="w-24 shrink-0 text-xs font-medium text-muted-foreground">{PLATFORMS[a.platform].label}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.title}</p>
                    <p className="truncate text-sm text-muted-foreground">{a.body || "Empty draft"}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <ContentStatusPill status={a.status} />
                    <GuardianPill status={a.guardian_status} />
                    <span className="w-24 text-right text-xs text-muted-foreground">{relativeTime(a.updated_at)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
