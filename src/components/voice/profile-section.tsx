"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/shared";
import { TagInput } from "@/components/tag-input";
import { TimezoneSelect } from "@/components/timezone-select";
import { useAction } from "@/hooks/use-action";
import { saveProfile, setInterests } from "@/app/actions/brain";
import type { Profile } from "@/types/domain";

const PLATFORM_SUGGESTIONS = ["linkedin", "x", "threads", "bluesky", "facebook", "instagram", "mastodon", "newsletter"];

export function Section({ title, description, children, actions }: { title: string; description?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function ProfileSection({ profile, interests: initialInterests }: { profile: Profile; interests: string[] }) {
  const router = useRouter();
  const [f, setF] = useState({
    full_name: profile.full_name ?? "",
    profession: profile.profession ?? "",
    industry: profile.industry ?? "",
    organization: profile.organization ?? "",
    bio: profile.bio ?? "",
    target_audience: profile.target_audience ?? "",
    expertise: profile.expertise,
    preferred_platforms: profile.preferred_platforms,
    content_objectives: profile.content_objectives,
    timezone: profile.timezone,
  });
  const [interests, setInterestList] = useState(initialInterests);
  const save = useAction(saveProfile);
  const saveInterests = useAction(setInterests, { silentSuccess: true });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Section title="Professional identity" description="Shapes what Radar considers relevant and who Studio writes for.">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Display name" htmlFor="p-name">
          <Input id="p-name" value={f.full_name} onChange={(e) => set("full_name", e.target.value)} />
        </Field>
        <Field label="Profession / role" htmlFor="p-prof">
          <Input id="p-prof" value={f.profession} onChange={(e) => set("profession", e.target.value)} />
        </Field>
        <Field label="Industry" htmlFor="p-ind">
          <Input id="p-ind" value={f.industry} onChange={(e) => set("industry", e.target.value)} />
        </Field>
        <Field label="Organization" htmlFor="p-org">
          <Input id="p-org" value={f.organization} onChange={(e) => set("organization", e.target.value)} />
        </Field>
      </div>
      <div className="mt-4 space-y-4">
        <Field label="Short bio" htmlFor="p-bio">
          <Textarea id="p-bio" rows={3} value={f.bio} onChange={(e) => set("bio", e.target.value)} maxLength={2000} />
        </Field>
        <Field label="Target audience" htmlFor="p-aud">
          <Textarea id="p-aud" rows={2} value={f.target_audience} onChange={(e) => set("target_audience", e.target.value)} maxLength={1000} />
        </Field>
        <Field label="Areas of expertise" htmlFor="p-exp">
          <TagInput id="p-exp" value={f.expertise} onChange={(v) => set("expertise", v)} placeholder="Add and press Enter" />
        </Field>
        <Field label="Interests (Radar topics)" htmlFor="p-int">
          <TagInput id="p-int" value={interests} onChange={setInterestList} max={30} placeholder="Topics to monitor" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Preferred platforms" htmlFor="p-plat">
            <TagInput id="p-plat" value={f.preferred_platforms} onChange={(v) => set("preferred_platforms", v)} max={10} suggestions={PLATFORM_SUGGESTIONS} />
          </Field>
          <Field label="Time zone" htmlFor="p-tz">
            <TimezoneSelect id="p-tz" value={f.timezone} onChange={(tz) => set("timezone", tz)} />
          </Field>
        </div>
        <Field label="Content objectives" htmlFor="p-obj">
          <TagInput id="p-obj" value={f.content_objectives} onChange={(v) => set("content_objectives", v)} max={10} />
        </Field>
      </div>
      <div className="mt-5 flex justify-end">
        <Button
          disabled={save.pending || saveInterests.pending}
          onClick={async () => {
            const [a, b] = await Promise.all([save.run(f), saveInterests.run(interests.map((topic) => ({ topic, priority: 2 })))]);
            if (a.ok && b.ok) router.refresh();
          }}
        >
          {save.pending ? <Loader2 className="animate-spin" /> : null} Save profile
        </Button>
      </div>
    </Section>
  );
}
