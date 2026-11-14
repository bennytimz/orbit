"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronDown, ExternalLink, Loader2, RotateCcw, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GuardianPill, Notice, Pill, SeverityPill, type Tone } from "@/components/shared";
import { useAction } from "@/hooks/use-action";
import { runGuardianCheck, setIssueReview } from "@/app/actions/guardian";
import { relativeTime } from "@/lib/format";
import type { GuardianIssue, GuardianReport, SupportStatus } from "@/types/domain";
import { cn } from "@/lib/utils";

const SUPPORT_LABEL: Record<SupportStatus, { label: string; tone: Tone }> = {
  supported: { label: "Supported", tone: "success" },
  partially_supported: { label: "Partially supported", tone: "warning" },
  unsupported: { label: "Unsupported", tone: "danger" },
  conflicting: { label: "Conflicting evidence", tone: "danger" },
  unable_to_verify: { label: "Unable to verify", tone: "neutral" },
};

const SEVERITY_ORDER = { blocking: 0, warning: 1, info: 2 } as const;

export function IssueItem({ issue, compact = false }: { issue: GuardianIssue; compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(!compact && issue.severity !== "info");
  const review = useAction(setIssueReview, { silentSuccess: true });
  const closed = issue.review_status !== "open";
  const act = async (s: "open" | "resolved" | "dismissed") => (await review.run(issue.id, s)).ok && router.refresh();

  return (
    <li className={cn("rounded-lg border border-border", closed && "opacity-60")}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-start gap-2 p-3 text-left">
        <SeverityPill severity={issue.severity} />
        <span className="flex-1 text-sm font-medium">{issue.title}</span>
        <ChevronDown className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="space-y-2 px-3 pb-3 text-sm">
          <div className="flex flex-wrap gap-1">
            {issue.verification_status ? <Pill tone={SUPPORT_LABEL[issue.verification_status].tone}>{SUPPORT_LABEL[issue.verification_status].label}</Pill> : null}
            <Pill>{issue.check_source === "ai" ? "AI review" : "Rule check"}</Pill>
            {closed ? <Pill>{issue.review_status}</Pill> : null}
          </div>
          {issue.excerpt ? <blockquote className="border-l-2 border-warning/50 pl-2 text-xs italic">“{issue.excerpt}”</blockquote> : null}
          <p className="text-muted-foreground">{issue.explanation}</p>
          {issue.evidence.length ? (
            <ul className="space-y-1 text-xs">
              {issue.evidence.map((e, i) => (
                <li key={i} className="rounded bg-muted/50 p-2">
                  {e.source_url ? (
                    <a href={e.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium hover:text-primary">
                      {e.source_title ?? e.source_url} <ExternalLink className="size-3" />
                    </a>
                  ) : e.source_title ? (
                    <span className="font-medium">{e.source_title}</span>
                  ) : null}
                  {e.passage ? <p className="mt-0.5 italic">“{e.passage}”</p> : null}
                  {e.note ? <p className="mt-0.5 text-muted-foreground">{e.note}</p> : null}
                </li>
              ))}
            </ul>
          ) : null}
          {issue.recommended_action ? (
            <p className="text-xs">
              <span className="font-medium">Recommended: </span>
              {issue.recommended_action}
            </p>
          ) : null}
          <div className="flex gap-1 pt-1">
            {issue.review_status === "open" ? (
              <>
                <Button size="xs" variant="outline" disabled={review.pending} onClick={() => act("resolved")}>
                  <Check /> Mark fixed
                </Button>
                <Button size="xs" variant="ghost" disabled={review.pending} onClick={() => act("dismissed")}>
                  <X /> Dismiss
                </Button>
              </>
            ) : issue.review_status !== "superseded" ? (
              <Button size="xs" variant="ghost" disabled={review.pending} onClick={() => act("open")}>
                <RotateCcw /> Reopen
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function GuardianPanel({
  assetId,
  report,
  issues,
  guardianStatus,
  aiAvailable,
}: {
  assetId: string;
  report: GuardianReport | null;
  issues: GuardianIssue[];
  guardianStatus: string;
  aiAvailable: boolean;
}) {
  const router = useRouter();
  const check = useAction(runGuardianCheck, { silentSuccess: true });
  const [showClosed, setShowClosed] = useState(false);
  const sorted = [...issues].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const open = sorted.filter((i) => i.review_status === "open");
  const closed = sorted.filter((i) => i.review_status !== "open");

  const run = async () => {
    const r = await check.run(assetId);
    if (r.ok) {
      if (r.data.aiError) toast.warning(`Rule checks ran, but the AI review failed: ${r.data.aiError}`);
      else toast.success(r.data.issueCount ? `Guardian found ${r.data.issueCount} item(s) to review.` : "Guardian found no issues.");
      router.refresh();
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="guardian-title">
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck className="size-4 text-primary" aria-hidden />
        <h2 id="guardian-title" className="text-sm font-semibold">Guardian</h2>
        <GuardianPill status={guardianStatus} />
        <Button size="sm" variant="outline" className="ml-auto" onClick={run} disabled={check.pending}>
          {check.pending ? <Loader2 className="animate-spin" /> : null}
          {report ? "Re-run" : "Run checks"}
        </Button>
      </div>
      {check.pending ? (
        <p className="mb-2 text-xs text-muted-foreground" role="status">Checking claims against sources, links, platform rules and your voice…</p>
      ) : null}
      {!report ? (
        <p className="text-sm text-muted-foreground">
          Guardian checks claims against your sources, unsupported statistics, dates, links, platform limits, duplication, and voice consistency.
          {!aiAvailable ? " Without GEMINI_API_KEY only rule-based checks run." : ""}
        </p>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted-foreground">
            Checked {relativeTime(report.checked_at)}
            {report.ai_checked ? " · rules + AI review" : " · rules only"}
            {guardianStatus === "stale" ? " · content changed since — re-run" : ""}
          </p>
          {report.ai_error ? <Notice tone="warning">AI review unavailable: {report.ai_error}</Notice> : null}
          {report.summary ? <p className="mb-3 text-sm">{report.summary}</p> : null}
          {open.length ? (
            <ul className="space-y-2">
              {open.map((i) => (
                <IssueItem key={i.id} issue={i} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-success">No open issues.</p>
          )}
          {closed.length ? (
            <div className="mt-3">
              <Button variant="ghost" size="xs" onClick={() => setShowClosed(!showClosed)}>
                {showClosed ? "Hide" : "Show"} {closed.length} reviewed
              </Button>
              {showClosed ? (
                <ul className="mt-2 space-y-2">
                  {closed.map((i) => (
                    <IssueItem key={i.id} issue={i} compact />
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          <p className="mt-3 text-[11px] text-muted-foreground">Guardian is an assistive review, not a guarantee of accuracy. Each finding explains its basis.</p>
        </>
      )}
    </section>
  );
}
