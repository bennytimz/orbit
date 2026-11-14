"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/shared";
import { TimezoneSelect } from "@/components/timezone-select";
import { TagInput } from "@/components/tag-input";
import { OrbitMark } from "@/components/layout/orbit-mark";
import { useAction } from "@/hooks/use-action";
import { saveProfile, setInterests } from "@/app/actions/brain";
import type { Profile } from "@/types/domain";

const PLATFORM_OPTIONS = [
  ["linkedin", "LinkedIn"],
  ["x", "X"],
  ["threads", "Threads"],
  ["bluesky", "Bluesky"],
  ["facebook", "Facebook"],
  ["instagram", "Instagram"],
  ["mastodon", "Mastodon"],
  ["newsletter", "Newsletter"],
] as const;

const OBJECTIVES = ["Build thought leadership", "Grow an audience", "Educate my market", "Support product launches", "Attract customers", "Recruit talent", "Stay visible consistently"];

export function OnboardingForm({ profile, interests: initialInterests }: { profile: Profile; interests: string[] }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    full_name: profile.full_name ?? "",
    profession: profile.profession ?? "",
    industry: profile.industry ?? "",
    organization: profile.organization ?? "",
    bio: profile.bio ?? "",
    target_audience: profile.target_audience ?? "",
    expertise: profile.expertise ?? [],
    preferred_platforms: profile.preferred_platforms ?? [],
    content_objectives: profile.content_objectives ?? [],
    timezone: profile.timezone === "UTC" ? "" : profile.timezone,
  });
  const [interests, setInterestList] = useState<string[]>(initialInterests);
  const save = useAction(saveProfile, { silentSuccess: true });
  const saveInterests = useAction(setInterests, { silentSuccess: true });

  // The browser's zone is only known on the client; the server snapshot is UTC.
  const detectedTz = useSyncExternalStore(
    () => () => {},
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    () => "UTC",
  );
  const timezone = form.timezone || detectedTz;

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  const finish = async () => {
    const i = await saveInterests.run(interests.map((topic, idx) => ({ topic, priority: idx < 3 ? 1 : 2 })));
    if (!i.ok) return;
    const r = await save.run({ ...form, timezone }, true);
    if (r.ok) router.push("/voice?welcome=1");
  };

  const steps = [
    {
      title: "Who are you?",
      body: (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="full_name">
            <Input id="full_name" value={form.full_name} onChange={(e) => set("full_name", e.target.value)} autoComplete="name" />
          </Field>
          <Field label="Profession / role" htmlFor="profession">
            <Input id="profession" value={form.profession} onChange={(e) => set("profession", e.target.value)} placeholder="e.g. Founder & CEO" />
          </Field>
          <Field label="Industry" htmlFor="industry">
            <Input id="industry" value={form.industry} onChange={(e) => set("industry", e.target.value)} placeholder="e.g. Developer tools" />
          </Field>
          <Field label="Organization (optional)" htmlFor="organization">
            <Input id="organization" value={form.organization} onChange={(e) => set("organization", e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Short bio (optional)" htmlFor="bio">
              <Textarea id="bio" value={form.bio} onChange={(e) => set("bio", e.target.value)} rows={3} placeholder="What you do and what you care about." />
            </Field>
          </div>
        </div>
      ),
    },
    {
      title: "What do you know, and what do you follow?",
      body: (
        <div className="space-y-5">
          <Field label="Areas of expertise" htmlFor="expertise" hint="Press Enter after each. Radar uses these to judge relevance.">
            <TagInput id="expertise" value={form.expertise} onChange={(v) => set("expertise", v)} placeholder="e.g. AI infrastructure, B2B pricing" />
          </Field>
          <Field label="Topics to monitor" htmlFor="interests" hint="The first three are treated as high priority.">
            <TagInput id="interests" value={interests} onChange={setInterestList} max={30} placeholder="e.g. open-source LLMs, EU AI Act" />
          </Field>
        </div>
      ),
    },
    {
      title: "Who are you talking to?",
      body: (
        <div className="space-y-5">
          <Field label="Target audience" htmlFor="audience">
            <Textarea id="audience" value={form.target_audience} onChange={(e) => set("target_audience", e.target.value)} rows={3} placeholder="e.g. Engineering leaders at Series A–C startups" />
          </Field>
          <Field label="Preferred platforms">
            <div className="flex flex-wrap gap-2">
              {PLATFORM_OPTIONS.map(([id, label]) => {
                const on = form.preferred_platforms.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set("preferred_platforms", on ? form.preferred_platforms.filter((p) => p !== id) : [...form.preferred_platforms, id])}
                    className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${on ? "border-primary/60 bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Content objectives" htmlFor="objectives">
            <TagInput id="objectives" value={form.content_objectives} onChange={(v) => set("content_objectives", v)} max={10} suggestions={OBJECTIVES} />
          </Field>
          <Field label="Timezone" htmlFor="tz" hint="Used to display and schedule posts. Detected from your browser.">
            <TimezoneSelect id="tz" value={timezone} onChange={(tz) => set("timezone", tz)} />
          </Field>
        </div>
      ),
    },
  ];

  const busy = save.pending || saveInterests.pending;
  const last = step === steps.length - 1;

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-4 py-12">
      <div className="mb-8 flex items-center gap-3">
        <OrbitMark className="size-8" />
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Step {step + 1} of {steps.length}
          </p>
          <h1 className="text-xl font-semibold">{steps[step].title}</h1>
        </div>
      </div>
      <div className="mb-6 flex gap-1.5" aria-hidden>
        {steps.map((_, i) => (
          <div key={i} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} />
        ))}
      </div>
      <div className="rounded-xl border border-border bg-card p-6">{steps[step].body}</div>
      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={step === 0 || busy}>
          <ArrowLeft /> Back
        </Button>
        <div className="flex gap-2">
          {!last ? (
            <>
              <Button variant="ghost" onClick={() => setStep((s) => s + 1)} disabled={busy}>
                Skip
              </Button>
              <Button onClick={() => setStep((s) => s + 1)}>
                Continue <ArrowRight />
              </Button>
            </>
          ) : (
            <Button onClick={finish} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Check />}
              Finish setup
            </Button>
          )}
        </div>
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground">Everything here is optional and editable later in My Voice.</p>
    </div>
  );
}
