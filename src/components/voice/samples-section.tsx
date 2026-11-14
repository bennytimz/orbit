"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Notice } from "@/components/shared";
import { useAction } from "@/hooks/use-action";
import { addWritingSample, analyzeVoice, deleteWritingSample } from "@/app/actions/brain";
import { formatDate } from "@/lib/format";
import type { VoiceProfile, WritingSample } from "@/types/domain";
import { Section } from "./profile-section";
import { VOICE_APPLY_EVENT, VOICE_FIELDS } from "./voice-section";

type Analysis = Record<(typeof VOICE_FIELDS)[number][0] | "writing_preferences", string> & { observations: string[]; caveats: string[] };

export function SamplesSection({ samples, voice, aiAvailable }: { samples: WritingSample[]; voice: VoiceProfile | null; aiAvailable: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [instructions, setInstructions] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const add = useAction(addWritingSample);
  const remove = useAction(deleteWritingSample, { silentSuccess: true });
  const analyze = useAction(analyzeVoice, { silentSuccess: true });

  const apply = () => {
    if (!analysis) return;
    const keys = [...VOICE_FIELDS.map(([k]) => k), "writing_preferences" as const];
    const fields = Object.fromEntries(keys.map((k) => [k, analysis[k]]));
    window.dispatchEvent(new CustomEvent(VOICE_APPLY_EVENT, { detail: fields }));
  };

  return (
    <Section title="Writing examples" description="Posts, articles or transcripts you wrote. Used to suggest a voice profile — you decide what to keep.">
      <form
        className="space-y-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await add.run({ title: title || undefined, body });
          if (r.ok) {
            setTitle("");
            setBody("");
            router.refresh();
          }
        }}
      >
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" aria-label="Sample title" maxLength={200} />
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder="Paste something you wrote" aria-label="Sample text" maxLength={20000} />
        <div className="flex justify-end">
          <Button type="submit" variant="outline" size="sm" disabled={!body.trim() || add.pending}>
            {add.pending ? <Loader2 className="animate-spin" /> : null} Add example
          </Button>
        </div>
      </form>

      {samples.length ? (
        <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
          {samples.map((s) => (
            <li key={s.id} className="flex items-start gap-3 p-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{s.title ?? "Untitled example"}</p>
                <p className="line-clamp-2 text-muted-foreground">{s.body}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Added {formatDate(s.created_at, "UTC")}</p>
              </div>
              <Button variant="ghost" size="icon-sm" aria-label="Delete example" disabled={remove.pending} onClick={async () => (await remove.run(s.id)).ok && router.refresh()}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-5 space-y-2 border-t border-border pt-5">
        <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={2} maxLength={2000} placeholder="Optional: describe your voice in your own words" aria-label="Describe your voice" />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={!aiAvailable || analyze.pending || (!samples.length && !instructions.trim())}
            onClick={async () => {
              const r = await analyze.run(instructions || null);
              if (r.ok) setAnalysis(r.data as Analysis);
            }}
          >
            {analyze.pending ? <Loader2 className="animate-spin" /> : <Sparkles />} Suggest a voice profile
          </Button>
          {!aiAvailable ? <span className="text-xs text-muted-foreground">Requires GEMINI_API_KEY.</span> : null}
          {voice?.sample_analysis ? <span className="text-xs text-muted-foreground">Last analyzed from {voice.sample_analysis.sample_count} example(s).</span> : null}
        </div>
      </div>

      {analysis ? (
        <div className="mt-4 rounded-lg border border-primary/40 bg-primary/5 p-4">
          <p className="mb-3 text-sm font-medium">Suggested voice profile</p>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            {[...VOICE_FIELDS.map(([k, l]) => [k, l] as const), ["writing_preferences", "Writing preferences"] as const].map(([k, l]) => (
              <div key={k}>
                <dt className="text-xs text-muted-foreground">{l}</dt>
                <dd>{analysis[k]}</dd>
              </div>
            ))}
          </dl>
          {analysis.observations.length ? (
            <ul className="mt-3 list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
              {analysis.observations.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
          ) : null}
          {analysis.caveats.length ? (
            <div className="mt-3">
              <Notice tone="warning" title="Limitations">
                {analysis.caveats.join(" ")}
              </Notice>
            </div>
          ) : null}
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={apply}>
              Use in form (review before saving)
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAnalysis(null)}>
              Discard
            </Button>
          </div>
        </div>
      ) : null}
    </Section>
  );
}
