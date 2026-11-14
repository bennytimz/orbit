"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Lightbulb, Loader2, Microscope, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, NativeSelect, Notice } from "@/components/shared";
import { VoiceRecorder } from "@/components/voice-recorder";
import { useAction } from "@/hooks/use-action";
import { createBlankDraft, generateDrafts } from "@/app/actions/studio";
import { GENERATABLE_PLATFORMS, PLATFORMS } from "@/engines/studio/platforms";
import type { Platform } from "@/types/domain";
import { cn } from "@/lib/utils";

export interface DiscoveryOption {
  id: string;
  title: string;
  perspectives: number;
  hasReport: boolean;
}

const CONTENT_TYPES = ["Industry analysis", "Opinion piece", "Educational post", "Discussion prompt", "Product announcement", "Tutorial", "Case study", "Storytelling", "Newsletter draft"];

type Start = "research" | "idea" | "blank";

export function NewContentForm({
  discoveries,
  campaigns,
  initialDiscovery,
  initialCampaign,
  preferredPlatforms,
  aiAvailable,
  transcriptionAvailable,
  initialStart,
}: {
  discoveries: DiscoveryOption[];
  campaigns: { id: string; name: string }[];
  initialDiscovery: string | null;
  initialCampaign: string | null;
  preferredPlatforms: string[];
  aiAvailable: boolean;
  transcriptionAvailable: boolean;
  initialStart: Start | null;
}) {
  const router = useRouter();
  const [start, setStart] = useState<Start>(initialStart ?? (initialDiscovery || discoveries.length ? "research" : "idea"));
  const [discoveryId, setDiscoveryId] = useState(initialDiscovery ?? discoveries[0]?.id ?? "");
  const [idea, setIdea] = useState("");
  const defaults = preferredPlatforms.filter((p): p is Platform => (GENERATABLE_PLATFORMS as string[]).includes(p));
  const [platforms, setPlatforms] = useState<Platform[]>(defaults.length ? defaults.slice(0, 3) : ["linkedin", "x"]);
  const [contentType, setContentType] = useState(CONTENT_TYPES[0]);
  const [objective, setObjective] = useState("");
  const [instructions, setInstructions] = useState("");
  const [campaignId, setCampaignId] = useState(initialCampaign ?? "");
  const [blankPlatform, setBlankPlatform] = useState<Platform>("linkedin");
  const generate = useAction(generateDrafts);
  const blank = useAction(createBlankDraft);

  const selected = discoveries.find((d) => d.id === discoveryId);

  const submit = async () => {
    if (start === "blank") {
      const r = await blank.run(blankPlatform);
      if (r.ok) router.push(`/studio/${r.data.id}`);
      return;
    }
    const r = await generate.run({
      platforms,
      discoveryId: start === "research" ? discoveryId || null : null,
      reportId: null,
      perspectiveIds: [],
      ideaText: start === "idea" ? idea : null,
      objective: objective || null,
      contentType,
      instructions: instructions || null,
      campaignId: campaignId || null,
    });
    if (r.ok) router.push(`/studio/${r.data.ids[0]}`);
  };

  const starts: { id: Start; label: string; icon: typeof FileText; desc: string }[] = [
    { id: "research", label: "From research", icon: Microscope, desc: "A discovery, its report and your perspective" },
    { id: "idea", label: "From an idea", icon: Lightbulb, desc: "Describe what you want to say" },
    { id: "blank", label: "Blank draft", icon: FileText, desc: "Write it yourself" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Starting point">
        {starts.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={start === s.id}
            onClick={() => setStart(s.id)}
            className={cn("rounded-xl border p-4 text-left transition-colors", start === s.id ? "border-primary/60 bg-primary/5" : "border-border hover:border-primary/30")}
          >
            <s.icon className={cn("mb-2 size-4", start === s.id ? "text-primary" : "text-muted-foreground")} />
            <p className="text-sm font-medium">{s.label}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{s.desc}</p>
          </button>
        ))}
      </div>

      <div className="space-y-5 rounded-xl border border-border bg-card p-5">
        {start === "research" ? (
          discoveries.length ? (
            <Field label="Discovery" htmlFor="discovery">
              <NativeSelect id="discovery" value={discoveryId} onChange={(e) => setDiscoveryId(e.target.value)}>
                {discoveries.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title.slice(0, 100)}
                  </option>
                ))}
              </NativeSelect>
              {selected ? (
                <div className="mt-2 space-y-2">
                  {!selected.hasReport ? <Notice tone="warning">No research report yet — content will use the discovery summary only. Generating a report first gives stronger sourcing.</Notice> : null}
                  {selected.perspectives === 0 ? (
                    <Notice tone="warning" title="No perspective captured">
                      Without your perspective, ORBIT will write analytical content without first-person opinions. Use “Develop My Perspective” on the research page for content that sounds like you.
                    </Notice>
                  ) : (
                    <p className="text-xs text-muted-foreground">Using {selected.perspectives} perspective response{selected.perspectives === 1 ? "" : "s"}.</p>
                  )}
                </div>
              ) : null}
            </Field>
          ) : (
            <Notice>No discoveries yet. Use Radar first, or start from an idea.</Notice>
          )
        ) : null}

        {start === "idea" ? (
          <Field label="Your idea" htmlFor="idea" hint="Include your actual view — ORBIT won't invent opinions or experiences for you.">
            <Textarea id="idea" value={idea} onChange={(e) => setIdea(e.target.value)} rows={5} maxLength={5000} placeholder="What do you want to say, and why?" />
            <div className="mt-2">
              <VoiceRecorder available={transcriptionAvailable} onTranscript={(t) => setIdea((prev) => (prev ? `${prev}\n${t}` : t))} />
            </div>
          </Field>
        ) : null}

        {start === "blank" ? (
          <Field label="Platform" htmlFor="blank-platform">
            <NativeSelect id="blank-platform" value={blankPlatform} onChange={(e) => setBlankPlatform(e.target.value as Platform)}>
              {GENERATABLE_PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {PLATFORMS[p].label}
                </option>
              ))}
            </NativeSelect>
          </Field>
        ) : (
          <>
            <Field label="Platforms" hint="Each platform gets its own adapted variant.">
              <div className="flex flex-wrap gap-2">
                {GENERATABLE_PLATFORMS.map((p) => {
                  const on = platforms.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setPlatforms(on ? platforms.filter((x) => x !== p) : [...platforms, p].slice(0, 6))}
                      className={cn("rounded-lg border px-3 py-1.5 text-sm transition-colors", on ? "border-primary/60 bg-primary/10" : "border-border text-muted-foreground hover:text-foreground")}
                    >
                      {PLATFORMS[p].label}
                    </button>
                  );
                })}
              </div>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Content type" htmlFor="ctype">
                <NativeSelect id="ctype" value={contentType} onChange={(e) => setContentType(e.target.value)}>
                  {CONTENT_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Campaign (optional)" htmlFor="campaign">
                <NativeSelect id="campaign" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
                  <option value="">None</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            <Field label="Objective (optional)" htmlFor="objective">
              <Input id="objective" value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="e.g. Start a debate among engineering leaders" maxLength={300} />
            </Field>
            <Field label="Extra instructions (optional)" htmlFor="instructions">
              <Textarea id="instructions" value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={2} maxLength={2000} placeholder="e.g. Mention that we're hiring; keep it under 150 words" />
            </Field>
          </>
        )}
      </div>

      {!aiAvailable && start !== "blank" ? <Notice tone="warning">AI generation is unavailable: GEMINI_API_KEY is not configured. You can still write a blank draft.</Notice> : null}

      <div className="flex items-center justify-end gap-3">
        {generate.pending ? <span className="text-sm text-muted-foreground" role="status">Writing {platforms.length} variants…</span> : null}
        <Button
          size="lg"
          onClick={submit}
          disabled={
            generate.pending ||
            blank.pending ||
            (start !== "blank" && (!aiAvailable || platforms.length === 0)) ||
            (start === "research" && !discoveryId) ||
            (start === "idea" && !idea.trim())
          }
        >
          {generate.pending || blank.pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {start === "blank" ? "Create draft" : "Generate drafts"}
        </Button>
      </div>
    </div>
  );
}
