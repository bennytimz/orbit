import { AlertTriangle, CheckCircle2, CircleHelp, GitCompareArrows, Lightbulb } from "lucide-react";
import { Pill, type Tone } from "@/components/shared";
import { BASIS_LABELS } from "@/components/radar/labels";
import type { ResearchReport } from "@/types/domain";

type SourceIndex = Record<string, { n: number; title: string; url: string }>;

function SourceRefs({ ids, index }: { ids: string[]; index: SourceIndex }) {
  if (!ids.length) return <span className="text-xs text-muted-foreground">no source</span>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {ids.map((id) => {
        const s = index[id];
        if (!s) return null;
        return (
          <a key={id} href={s.url} target="_blank" rel="noopener noreferrer" title={s.title} className="font-mono text-xs text-primary hover:underline">
            [{s.n}]
          </a>
        );
      })}
    </span>
  );
}

const BASIS_TONE: Record<string, Tone> = { verified_in_source: "success", reported_claim: "warning", interpretation: "neutral" };

export function ReportView({ report, sourceIndex }: { report: ResearchReport; sourceIndex: SourceIndex }) {
  return (
    <div className="space-y-6 rounded-xl border border-border bg-card p-5 sm:p-6">
      <div>
        <h3 className="text-lg font-semibold">{report.title}</h3>
        <p className="mt-2 text-[15px] leading-relaxed text-foreground/90">{report.summary}</p>
      </div>

      {report.key_findings.length ? (
        <div>
          <h4 className="mb-2 text-sm font-medium">Key findings</h4>
          <ul className="space-y-2">
            {report.key_findings.map((k, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" aria-hidden />
                <span>
                  {k.text} <SourceRefs ids={k.source_ids} index={sourceIndex} />{" "}
                  <Pill tone={BASIS_TONE[k.basis]} className="ml-1 align-middle">{BASIS_LABELS[k.basis]}</Pill>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {report.claims.length ? (
        <div>
          <h4 className="mb-1 text-sm font-medium">Claims and evidence</h4>
          <p className="mb-3 text-xs text-muted-foreground">
            “Passage verified” means ORBIT found the quoted passage verbatim in the retrieved source text. It confirms the source says it — not that the claim is true.
          </p>
          <ul className="space-y-3">
            {report.claims.map((c) => (
              <li key={c.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm">{c.text}</p>
                  <div className="flex flex-wrap gap-1">
                    <Pill tone={BASIS_TONE[c.basis]}>{BASIS_LABELS[c.basis]}</Pill>
                    {c.supporting_passage ? (
                      c.passage_verified ? (
                        <Pill tone="success" icon={CheckCircle2}>Passage verified</Pill>
                      ) : (
                        <Pill tone="warning" icon={AlertTriangle}>Passage not found in source</Pill>
                      )
                    ) : null}
                  </div>
                </div>
                {c.supporting_passage ? (
                  <blockquote className="mt-2 border-l-2 border-border pl-3 text-xs text-muted-foreground italic">“{c.supporting_passage}”</blockquote>
                ) : null}
                <div className="mt-2 text-xs text-muted-foreground">
                  Sources: <SourceRefs ids={c.source_ids} index={sourceIndex} /> · confidence {c.confidence}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        {report.important_dates.length ? (
          <div>
            <h4 className="mb-2 text-sm font-medium">Important dates</h4>
            <ul className="space-y-1.5 text-sm">
              {report.important_dates.map((d, i) => (
                <li key={i}>
                  <span className="font-mono text-xs">{d.date}</span> <Pill className="mx-1">{d.date_type}</Pill>
                  <span className="text-muted-foreground">{d.description}</span> <SourceRefs ids={d.source_ids} index={sourceIndex} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {report.entities.length ? (
          <div>
            <h4 className="mb-2 text-sm font-medium">Entities</h4>
            <ul className="flex flex-wrap gap-1.5">
              {report.entities.map((e, i) => (
                <li key={i} className="rounded-md border border-border px-2 py-1 text-xs" title={e.role}>
                  {e.name} <span className="text-muted-foreground">· {e.type}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {report.conflicts.length || report.uncertainties.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {report.conflicts.length ? (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
              <h4 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                <GitCompareArrows className="size-4 text-warning" /> Conflicting reports
              </h4>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                {report.conflicts.map((c, i) => (
                  <li key={i}>
                    {c.description} <SourceRefs ids={c.source_ids} index={sourceIndex} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {report.uncertainties.length ? (
            <div className="rounded-lg border border-border p-3">
              <h4 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                <CircleHelp className="size-4 text-muted-foreground" /> Uncertainties
              </h4>
              <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                {report.uncertainties.map((u, i) => (
                  <li key={i}>{u}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {report.implications.length ? (
        <div>
          <h4 className="mb-2 text-sm font-medium">Implications <span className="font-normal text-muted-foreground">(AI interpretation)</span></h4>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {report.implications.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {report.content_opportunities.length ? (
        <div>
          <h4 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
            <Lightbulb className="size-4 text-primary" /> Content opportunities
          </h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {report.content_opportunities.map((o, i) => (
              <div key={i} className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium">{o.angle}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {o.format} — {o.rationale}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
