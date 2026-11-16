"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/shared";
import { TagInput } from "@/components/tag-input";
import { useAction } from "@/hooks/use-action";
import { saveVoice } from "@/app/actions/brain";
import type { VoiceProfile } from "@/types/domain";
import { Section } from "./profile-section";

import { VOICE_FIELDS } from "./voice-fields";
export { VOICE_FIELDS };

export type VoiceFieldKey = (typeof VOICE_FIELDS)[number][0] | "writing_preferences";

/** Lets other components (the analysis suggestion) push values into the form without saving. */
export const VOICE_APPLY_EVENT = "orbit:voice-apply";

export function VoiceSection({ voice }: { voice: VoiceProfile | null }) {
  const router = useRouter();
  const [f, setF] = useState({
    tone: voice?.tone ?? "",
    formality: voice?.formality ?? "",
    personality: voice?.personality ?? "",
    vocabulary: voice?.vocabulary ?? "",
    sentence_length: voice?.sentence_length ?? "",
    humor: voice?.humor ?? "",
    technical_depth: voice?.technical_depth ?? "",
    writing_preferences: voice?.writing_preferences ?? "",
    words_to_avoid: voice?.words_to_avoid ?? [],
    preferred_ctas: voice?.preferred_ctas ?? [],
  });
  const [applied, setApplied] = useState(false);
  const save = useAction(saveVoice);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<Partial<Record<VoiceFieldKey, string>>>).detail;
      setF((prev) => ({ ...prev, ...detail }));
      setApplied(true);
      document.getElementById("voice-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    window.addEventListener(VOICE_APPLY_EVENT, handler);
    return () => window.removeEventListener(VOICE_APPLY_EVENT, handler);
  }, []);

  return (
    <div id="voice-section">
      <Section title="Brand voice" description="How you write. Studio follows this; Guardian checks drafts against it.">
        {applied ? <p className="mb-3 text-sm text-warning">Suggested values applied below — review them, then save. Nothing is stored until you do.</p> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          {VOICE_FIELDS.map(([key, label, ph]) => (
            <Field key={key} label={label} htmlFor={`v-${key}`}>
              <Input id={`v-${key}`} value={f[key]} placeholder={ph} onChange={(e) => setF({ ...f, [key]: e.target.value })} maxLength={500} />
            </Field>
          ))}
        </div>
        <div className="mt-4 space-y-4">
          <Field label="Writing preferences" htmlFor="v-pref" hint="Anything else: structure, formatting, things you always or never do.">
            <Textarea id="v-pref" rows={3} value={f.writing_preferences} onChange={(e) => setF({ ...f, writing_preferences: e.target.value })} maxLength={2000} />
          </Field>
          <Field label="Words and phrases to avoid" htmlFor="v-avoid">
            <TagInput id="v-avoid" value={f.words_to_avoid} onChange={(v) => setF({ ...f, words_to_avoid: v })} max={60} placeholder="e.g. game-changer" />
          </Field>
          <Field label="Preferred calls to action" htmlFor="v-cta">
            <TagInput id="v-cta" value={f.preferred_ctas} onChange={(v) => setF({ ...f, preferred_ctas: v })} max={20} placeholder="e.g. What's your take?" />
          </Field>
        </div>
        <div className="mt-5 flex justify-end">
          <Button
            disabled={save.pending}
            onClick={async () => {
              const r = await save.run(f);
              if (r.ok) {
                setApplied(false);
                router.refresh();
              }
            }}
          >
            {save.pending ? <Loader2 className="animate-spin" /> : null} Save voice
          </Button>
        </div>
      </Section>
    </div>
  );
}
