"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileSearch, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/hooks/use-action";
import { generateReport } from "@/app/actions/radar";

export function GenerateReportButton({ discoveryId, hasReport, disabled }: { discoveryId: string; hasReport: boolean; disabled?: boolean }) {
  const router = useRouter();
  const action = useAction(generateReport);
  return (
    <div className="flex items-center gap-2">
      {action.pending ? <span className="hidden text-xs text-muted-foreground sm:inline" role="status">Retrieving sources and analyzing…</span> : null}
      <Button
        size="sm"
        variant={hasReport ? "outline" : "default"}
        disabled={disabled || action.pending}
        onClick={async () => {
          const r = await action.run(discoveryId);
          if (r.ok) {
            if (r.data.unfetched.length) toast.warning(`${r.data.unfetched.length} source(s) could not be retrieved in full; their claims rely on search excerpts.`);
            router.refresh();
          }
        }}
      >
        {action.pending ? <Loader2 className="animate-spin" /> : hasReport ? <RefreshCw /> : <FileSearch />}
        {hasReport ? "Regenerate" : "Generate research report"}
      </Button>
    </div>
  );
}
