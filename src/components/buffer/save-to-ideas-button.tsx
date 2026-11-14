"use client";

import { Lightbulb, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/hooks/use-action";
import { saveDiscoveryToBufferIdeas } from "@/app/actions/ideas";

/** Sends a discovery's title, short summary and source link to Buffer Ideas. */
export function SaveToBufferIdeasButton({ discoveryId, compact = false }: { discoveryId: string; compact?: boolean }) {
  const action = useAction(saveDiscoveryToBufferIdeas);
  const icon = action.pending ? <Loader2 className="animate-spin" /> : <Lightbulb />;
  if (compact) {
    return (
      <Button variant="ghost" size="icon-sm" disabled={action.pending} aria-label="Save to Buffer Ideas" title="Save to Buffer Ideas" onClick={() => action.run(discoveryId)}>
        {icon}
      </Button>
    );
  }
  return (
    <Button variant="outline" disabled={action.pending} onClick={() => action.run(discoveryId)}>
      {icon} Save to Buffer Ideas
    </Button>
  );
}
