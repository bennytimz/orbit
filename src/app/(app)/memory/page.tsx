import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { PageHeader, Pill } from "@/components/shared";
import { KnowledgeSection } from "@/components/voice/knowledge-section";
import { Section } from "@/components/voice/profile-section";
import { PreferencesSection } from "@/components/memory/preferences-section";
import { VOICE_FIELDS } from "@/components/voice/voice-section";
import type { KnowledgeEntry, Profile, UserInterest, UserPreference, VoiceProfile } from "@/types/domain";

export const metadata: Metadata = { title: "Memory" };

export default async function MemoryPage() {
  const { supabase, userId } = await requireUser();
  const [{ data: profile }, { data: interests }, { data: voice }, { data: knowledge }, { data: prefs }, { count: editCount }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", userId).single(),
    supabase.from("user_interests").select("*").eq("user_id", userId).order("priority"),
    supabase.from("voice_profiles").select("*").eq("user_id", userId).eq("is_default", true).maybeSingle(),
    supabase.from("knowledge_entries").select("*").eq("user_id", userId).order("updated_at", { ascending: false }),
    supabase.from("user_preferences").select("*").eq("user_id", userId).order("updated_at", { ascending: false }),
    supabase.from("user_feedback").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("feedback_type", "edit"),
  ]);
  const p = profile as Profile;
  const v = voice as VoiceProfile | null;

  return (
    <div className="max-w-4xl">
      <PageHeader title="Memory" description="Everything ORBIT knows about you, where it came from, and whether you confirmed it. Inspect, edit or delete any of it." />
      <div className="space-y-8">
        <Section title="Professional identity" actions={<Link href="/voice" className="text-sm text-primary hover:underline">Edit</Link>}>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {[
              ["Name", p.full_name],
              ["Role", p.profession],
              ["Industry", p.industry],
              ["Organization", p.organization],
              ["Audience", p.target_audience],
              ["Time zone", p.timezone],
            ].map(([k, val]) => (
              <div key={k}>
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd>{val || <span className="text-muted-foreground">Not set</span>}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {p.expertise.map((e) => (
              <Pill key={e} tone="accent">{e}</Pill>
            ))}
            {((interests ?? []) as UserInterest[]).map((i) => (
              <Pill key={i.id}>{i.topic}</Pill>
            ))}
          </div>
        </Section>

        <Section title="Voice" actions={<Link href="/voice" className="text-sm text-primary hover:underline">Edit</Link>}>
          {v ? (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              {VOICE_FIELDS.map(([k, label]) => (
                <div key={k}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd>{v[k] || <span className="text-muted-foreground">Not set</span>}</dd>
                </div>
              ))}
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground">Avoid</dt>
                <dd>{v.words_to_avoid.length ? v.words_to_avoid.join(", ") : <span className="text-muted-foreground">None</span>}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">No voice profile yet.</p>
          )}
        </Section>

        <PreferencesSection preferences={(prefs as UserPreference[]) ?? []} editCount={editCount ?? 0} />
        <KnowledgeSection entries={(knowledge as KnowledgeEntry[]) ?? []} />
      </div>
    </div>
  );
}
