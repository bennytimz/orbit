import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { integrations } from "@/lib/env";
import { Notice, PageHeader } from "@/components/shared";
import { ProfileSection } from "@/components/voice/profile-section";
import { VoiceSection } from "@/components/voice/voice-section";
import { SamplesSection } from "@/components/voice/samples-section";
import { KnowledgeSection } from "@/components/voice/knowledge-section";
import type { KnowledgeEntry, Profile, UserInterest, VoiceProfile, WritingSample } from "@/types/domain";

export const metadata: Metadata = { title: "My Voice" };

export default async function VoicePage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const sp = await searchParams;
  const { supabase, userId } = await requireUser();
  const [{ data: profile }, { data: interests }, { data: voice }, { data: samples }, { data: knowledge }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", userId).single(),
    supabase.from("user_interests").select("*").eq("user_id", userId).order("priority").order("created_at"),
    supabase.from("voice_profiles").select("*").eq("user_id", userId).eq("is_default", true).maybeSingle(),
    supabase.from("writing_samples").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    supabase.from("knowledge_entries").select("*").eq("user_id", userId).order("updated_at", { ascending: false }).limit(100),
  ]);
  const ai = integrations().ai;

  return (
    <div className="max-w-4xl">
      <PageHeader title="My Voice" description="Who you are, what you know, and how you write. ORBIT uses only what's here — and what you confirm — when it writes for you." />
      {sp.welcome ? (
        <div className="mb-6">
          <Notice tone="accent" title="Next: teach ORBIT your voice">
            Paste a few things you&apos;ve written and let ORBIT draft a voice profile you can edit. Then connect Buffer in Publishing and head to Radar.
          </Notice>
        </div>
      ) : null}
      <div className="space-y-8">
        <ProfileSection profile={profile as Profile} interests={((interests ?? []) as UserInterest[]).map((i) => i.topic)} />
        <VoiceSection voice={(voice as VoiceProfile) ?? null} />
        <SamplesSection samples={(samples as WritingSample[]) ?? []} voice={(voice as VoiceProfile) ?? null} aiAvailable={ai} />
        <KnowledgeSection entries={(knowledge as KnowledgeEntry[]) ?? []} />
      </div>
    </div>
  );
}
