"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookmarkPlus, Loader2, MessageSquareQuote, PenLine, Sparkles, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { VoiceRecorder } from "@/components/voice-recorder";
import { useAction } from "@/hooks/use-action";
import { deletePerspective, getPerspectiveQuestions, savePerspective } from "@/app/actions/perspective";
import { saveKnowledge } from "@/app/actions/brain";
import type { Perspective } from "@/types/domain";

export function PerspectivePanel({
  discoveryId,
  perspectives,
  aiAvailable,
  transcriptionAvailable,
}: {
  discoveryId: string;
  perspectives: Perspective[];
  aiAvailable: boolean;
  transcriptionAvailable: boolean;
}) {
  const router = useRouter();
  const [questions, setQuestions] = useState<{ question: string; why: string }[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [inputType, setInputType] = useState<"text" | "voice">("text");
  const [transcript, setTranscript] = useState<string | null>(null);
  const ask = useAction(getPerspectiveQuestions, { silentSuccess: true });
  const save = useAction(savePerspective);
  const remove = useAction(deletePerspective);
  const remember = useAction(saveKnowledge);

  const answered = new Set(perspectives.map((p) => p.question));

  const submit = async () => {
    const r = await save.run({ discoveryId, question: active, content: answer, inputType, transcript });
    if (r.ok) {
      setAnswer("");
      setTranscript(null);
      setInputType("text");
      setActive(null);
      router.refresh();
    }
  };

  return (
    <section className="rounded-xl border border-primary/25 bg-card p-5" aria-labelledby="perspective-title">
      <div className="mb-1 flex items-center gap-2">
        <MessageSquareQuote className="size-4 text-primary" aria-hidden />
        <h2 id="perspective-title" className="text-sm font-semibold">Your perspective</h2>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        ORBIT writes from what <em>you</em> think. Your answers are the only source of opinions and experiences in generated content.
      </p>

      {questions.length === 0 ? (
        <Button className="w-full" onClick={async () => { const r = await ask.run(discoveryId); if (r.ok) setQuestions(r.data); }} disabled={!aiAvailable || ask.pending}>
          {ask.pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
          Develop My Perspective
        </Button>
      ) : (
        <ul className="mb-3 space-y-1.5">
          {questions.map((q) => (
            <li key={q.question}>
              <button
                type="button"
                onClick={() => setActive(q.question)}
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${active === q.question ? "border-primary/60 bg-primary/10" : "border-border hover:border-primary/30"} ${answered.has(q.question) ? "opacity-60" : ""}`}
              >
                {q.question}
                <span className="mt-0.5 block text-xs text-muted-foreground">{q.why}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!aiAvailable ? <p className="mt-2 text-xs text-muted-foreground">AI questions need GEMINI_API_KEY. You can still write freely below.</p> : null}

      <div className="mt-4 space-y-2">
        <label htmlFor="perspective-answer" className="text-xs font-medium text-muted-foreground">
          {active ? active : "Free-form: what do you think about this?"}
        </label>
        <Textarea
          id="perspective-answer"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          rows={5}
          maxLength={10000}
          placeholder="Your view, your experience, what people are missing…"
        />
        <VoiceRecorder
          available={transcriptionAvailable}
          onTranscript={(t) => {
            setAnswer((prev) => (prev ? `${prev}\n${t}` : t));
            setTranscript(t);
            setInputType("voice");
          }}
        />
        <Button onClick={submit} disabled={!answer.trim() || save.pending} className="w-full" variant="secondary">
          {save.pending ? <Loader2 className="animate-spin" /> : null} Save response
        </Button>
      </div>

      {perspectives.length ? (
        <div className="mt-6 border-t border-border pt-4">
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">Saved ({perspectives.length})</h3>
          <ul className="space-y-2">
            {perspectives.map((p) => (
              <li key={p.id} className="rounded-lg bg-muted/40 p-3 text-sm">
                {p.question ? <p className="mb-1 text-xs text-muted-foreground">{p.question}</p> : null}
                <p className="whitespace-pre-wrap">{p.content}</p>
                <div className="mt-2 flex items-center gap-1">
                  <span className="mr-auto text-[11px] text-muted-foreground">{p.input_type === "voice" ? "Voice (transcribed)" : "Text"}</span>
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={remember.pending}
                    onClick={() => remember.run({ title: p.question ?? p.content.slice(0, 80), content: p.content, category: "opinion", source_type: "perspective", source_reference: `discovery:${discoveryId}` })}
                  >
                    <BookmarkPlus /> Remember
                  </Button>
                  <Button variant="ghost" size="icon-xs" aria-label="Delete response" disabled={remove.pending} onClick={async () => (await remove.run(p.id)).ok && router.refresh()}>
                    <Trash2 />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <Link href={`/studio/new?discovery=${discoveryId}`} className={buttonVariants({ className: "mt-4 w-full" })}>
            <PenLine /> Create content from this
          </Link>
        </div>
      ) : null}
    </section>
  );
}
