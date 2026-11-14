"use client";

import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FACTOR_LABELS, FACTOR_WEIGHTS, relevanceBand } from "@/engines/radar/relevance";
import type { RelevanceFactorKey, RelevanceFactors } from "@/types/domain";
import { cn } from "@/lib/utils";

export function RelevanceMeter({ score, factors }: { score: number | null; factors: RelevanceFactors }) {
  const band = relevanceBand(score);
  const color = band.tone === "high" ? "bg-success" : band.tone === "medium" ? "bg-primary" : band.tone === "low" ? "bg-muted-foreground" : "bg-muted";
  const keys = (Object.keys(FACTOR_WEIGHTS) as RelevanceFactorKey[]).filter((k) => factors[k]);
  return (
    <Popover>
      <PopoverTrigger
        className="group inline-flex items-center gap-2 rounded-md px-1 py-0.5 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Relevance ${score ?? "not assessed"}. Show how it was assessed.`}
      >
        <span className="font-mono text-sm font-medium text-foreground tabular-nums">{score ?? "—"}</span>
        <span className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
          <span className={cn("block h-full rounded-full", color)} style={{ width: `${score ?? 0}%` }} />
        </span>
        <Info className="size-3.5 opacity-60 group-hover:opacity-100" aria-hidden />
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="border-b border-border p-3">
          <p className="text-sm font-medium">{band.label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            A weighted average of the factors below. Recency is computed from source dates; other factors are AI assessments of fit with your profile, not objective measurements.
          </p>
        </div>
        <ul className="max-h-80 space-y-2.5 overflow-y-auto p-3">
          {keys.map((k) => (
            <li key={k}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">{FACTOR_LABELS[k]}</span>
                <span className="font-mono tabular-nums text-muted-foreground">
                  {factors[k]!.score} · {Math.round(FACTOR_WEIGHTS[k] * 100)}% weight
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{factors[k]!.reason}</p>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
