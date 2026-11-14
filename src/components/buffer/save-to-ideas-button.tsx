"use client";

import { useState } from "react";
import { Check, Lightbulb, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/hooks/use-action";
import { saveDiscoveryToBufferIdeas } from "@/app/actions/ideas";

const SAVED_LABEL = "Saved to Ideas ✓";

/** Sends a discovery's title, short summary and source link to Buffer Ideas, once. */
export function SaveToBufferIdeasButton({ discoveryId, savedIdeaId = null, compact = false }: { discoveryId: string; savedIdeaId?: string | null; compact?: boolean }) {
  const action = useAction(saveDiscoveryToBufferIdeas);
  const [savedId, setSavedId] = useState<string | null>(savedIdeaId);
  const saved = !!savedId;

  const save = async () => {
    const r = await action.run(discoveryId);
    if (r.ok) setSavedId(r.data.ideaId);
    else if (r.code === "already_saved") setSavedId("recorded");
  };
  const savedTitle = savedId && savedId !== "recorded" ? `${SAVED_LABEL} (Buffer Idea ${savedId})` : SAVED_LABEL;

  if (compact) {
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={action.pending || saved}
        aria-label={saved ? SAVED_LABEL : "Save to Buffer Ideas"}
        title={saved ? savedTitle : "Save to Buffer Ideas"}
        onClick={save}
      >
        {action.pending ? <Loader2 className="animate-spin" /> : saved ? <Check className="text-primary" /> : <Lightbulb />}
      </Button>
    );
  }
  return (
    <Button variant="outline" disabled={action.pending || saved} title={saved ? savedTitle : undefined} onClick={save}>
      {action.pending ? <Loader2 className="animate-spin" /> : saved ? null : <Lightbulb />}
      {saved ? SAVED_LABEL : "Save to Buffer Ideas"}
    </Button>
  );
}
