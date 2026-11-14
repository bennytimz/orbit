import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { integrations } from "@/lib/env";
import { PageHeader } from "@/components/shared";
import { NewContentForm, type DiscoveryOption } from "@/components/studio/new-content-form";

export const metadata: Metadata = { title: "New content" };

export default async function NewContentPage({ searchParams }: { searchParams: Promise<{ discovery?: string; campaign?: string; start?: string }> }) {
  const sp = await searchParams;
  const { supabase, userId } = await requireUser();
  const [{ data: discoveries }, { data: perspectives }, { data: reports }, { data: campaigns }, { data: profile }] = await Promise.all([
    supabase.from("discoveries").select("id, title").eq("user_id", userId).neq("status", "dismissed").order("discovered_at", { ascending: false }).limit(50),
    supabase.from("perspectives").select("discovery_id").eq("user_id", userId),
    supabase.from("research_reports").select("discovery_id").eq("user_id", userId),
    supabase.from("campaigns").select("id, name").eq("user_id", userId).neq("status", "archived").order("created_at", { ascending: false }),
    supabase.from("profiles").select("preferred_platforms").eq("user_id", userId).single(),
  ]);
  const perspectiveCount = new Map<string, number>();
  for (const p of (perspectives ?? []) as { discovery_id: string | null }[]) if (p.discovery_id) perspectiveCount.set(p.discovery_id, (perspectiveCount.get(p.discovery_id) ?? 0) + 1);
  const withReport = new Set(((reports ?? []) as { discovery_id: string }[]).map((r) => r.discovery_id));
  const options: DiscoveryOption[] = ((discoveries ?? []) as { id: string; title: string }[]).map((d) => ({
    id: d.id,
    title: d.title,
    perspectives: perspectiveCount.get(d.id) ?? 0,
    hasReport: withReport.has(d.id),
  }));

  return (
    <div className="max-w-3xl">
      <PageHeader title="New content" description="ORBIT combines research, your perspective, your identity and your voice into genuinely adapted platform variants." />
      <NewContentForm
        discoveries={options}
        campaigns={(campaigns ?? []) as { id: string; name: string }[]}
        initialDiscovery={sp.discovery ?? null}
        initialCampaign={sp.campaign ?? null}
        preferredPlatforms={((profile?.preferred_platforms as string[]) ?? []).filter(Boolean)}
        aiAvailable={integrations().ai}
        transcriptionAvailable={integrations().transcription}
        initialStart={sp.start === "idea" || sp.start === "blank" || sp.start === "research" ? sp.start : null}
      />
    </div>
  );
}
