"use client";

import { useRouter } from "next/navigation";
import { Loader2, SearchCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/hooks/use-action";
import { checkPublicationStatus } from "@/app/actions/publishing";

/** Asks Buffer for the current state of a recorded operation (reconciles unknown outcomes before any retry). */
export function CheckStatusButton({ publicationId }: { publicationId: string }) {
  const router = useRouter();
  const check = useAction(checkPublicationStatus);
  return (
    <Button variant="ghost" size="xs" className="mt-1" disabled={check.pending} onClick={async () => (await check.run(publicationId)).ok && router.refresh()}>
      {check.pending ? <Loader2 className="animate-spin" /> : <SearchCheck />} Check status
    </Button>
  );
}
