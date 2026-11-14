"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/shared";
import { useAction } from "@/hooks/use-action";
import { addPreference, deletePreference, reviewPreference } from "@/app/actions/brain";
import { analyzeMyEdits } from "@/app/actions/evolution";
import type { UserPreference } from "@/types/domain";
import { Section } from "@/components/voice/profile-section";

function Suggestion({ pref }: { pref: UserPreference }) {
  const router = useRouter();
  const [value, setValue] = useState(pref.preference_value);
  const review = useAction(reviewPreference);
  return (
    <li className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <span className="font-medium">{pref.preference_key.replace(/_/g, " ")}</span>
        <Pill>{pref.confidence} confidence</Pill>
        <Pill>{pref.source === "inferred_from_edits" ? "From your edits" : "From your feedback"}</Pill>
      </div>
      <Input value={value} onChange={(e) => setValue(e.target.value)} aria-label="Suggested preference" maxLength={500} />
      {pref.rationale ? <p className="mt-1 text-xs text-muted-foreground">Why: {pref.rationale}</p> : null}
      <div className="mt-2 flex gap-1.5">
        <Button size="xs" disabled={review.pending} onClick={async () => (await review.run(pref.id, "accepted", value !== pref.preference_value ? value : undefined)).ok && router.refresh()}>
          <Check /> Accept
        </Button>
        <Button size="xs" variant="ghost" disabled={review.pending} onClick={async () => (await review.run(pref.id, "rejected")).ok && router.refresh()}>
          <X /> Not a preference
        </Button>
      </div>
    </li>
  );
}

export function PreferencesSection({ preferences, editCount }: { preferences: UserPreference[]; editCount: number }) {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const analyze = useAction(analyzeMyEdits);
  const add = useAction(addPreference);
  const del = useAction(deletePreference, { silentSuccess: true });
  const suggested = preferences.filter((p) => p.status === "suggested");
  const accepted = preferences.filter((p) => p.status === "accepted");
  const rejected = preferences.filter((p) => p.status === "rejected");

  return (
    <Section
      title="Writing preferences"
      description="Learned from your edits only when you confirm them. Accepted preferences are applied to future drafts."
      actions={
        <Button size="sm" variant="outline" disabled={analyze.pending || editCount < 2} onClick={async () => (await analyze.run()).ok && router.refresh()}>
          {analyze.pending ? <Loader2 className="animate-spin" /> : <Sparkles />} Analyze my edits ({editCount})
        </Button>
      }
    >
      {editCount < 2 ? <p className="mb-3 text-xs text-muted-foreground">Edit at least two AI drafts in Studio to analyze patterns.</p> : null}
      {suggested.length ? (
        <div className="mb-4">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Suggestions to review ({suggested.length})</p>
          <ul className="space-y-2">
            {suggested.map((p) => (
              <Suggestion key={p.id} pref={p} />
            ))}
          </ul>
        </div>
      ) : null}
      <p className="mb-2 text-xs font-medium text-muted-foreground">Confirmed ({accepted.length})</p>
      {accepted.length ? (
        <ul className="mb-4 divide-y divide-border rounded-lg border border-border">
          {accepted.map((p) => (
            <li key={p.id} className="flex items-center gap-3 p-2.5 text-sm">
              <span className="w-40 shrink-0 text-muted-foreground">{p.preference_key.replace(/_/g, " ")}</span>
              <span className="flex-1">{p.preference_value}</span>
              <Pill>{p.source === "explicit" ? "Added by you" : "Learned, confirmed"}</Pill>
              <Button variant="ghost" size="icon-sm" aria-label="Delete preference" disabled={del.pending} onClick={async () => (await del.run(p.id)).ok && router.refresh()}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 text-sm text-muted-foreground">None yet.</p>
      )}
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await add.run({ preference_key: key, preference_value: value });
          if (r.ok) {
            setKey("");
            setValue("");
            router.refresh();
          }
        }}
      >
        <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="Preference, e.g. openings" aria-label="Preference name" className="sm:w-48" maxLength={80} />
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. Never open with a question" aria-label="Preference value" maxLength={500} />
        <Button type="submit" variant="outline" size="sm" className="shrink-0" disabled={!key.trim() || !value.trim() || add.pending}>
          Add
        </Button>
      </form>
      {rejected.length ? <p className="mt-3 text-xs text-muted-foreground">{rejected.length} dismissed suggestion(s) are kept so ORBIT doesn&apos;t suggest them again.</p> : null}
    </Section>
  );
}
