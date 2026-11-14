import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateStructured } from "@/lib/ai/client";
import { AIServiceError } from "@/lib/ai/errors";
import { aiModel } from "@/lib/env";
import { extractArticle, passageAppearsIn } from "@/lib/research/extract";
import { describeIdentity, loadUserContext } from "@/engines/brain/context";
import type { Discovery, ReportClaim, ResearchReport, ResearchSource } from "@/types/domain";

const basis = z.enum(["verified_in_source", "reported_claim", "interpretation"]);

export const ReportSchema = z.object({
  title: z.string(),
  summary: z.string(),
  key_findings: z.array(z.object({ text: z.string(), source_ids: z.array(z.string()), basis })),
  claims: z.array(
    z.object({
      text: z.string(),
      source_ids: z.array(z.string()),
      supporting_passage: z.string(),
      basis,
      confidence: z.enum(["high", "medium", "low"]),
    }),
  ),
  entities: z.array(z.object({ name: z.string(), type: z.string(), role: z.string() })),
  important_dates: z.array(
    z.object({
      date: z.string(),
      description: z.string(),
      date_type: z.enum(["event", "publication", "announcement", "effective", "deadline", "other"]),
      source_ids: z.array(z.string()),
    }),
  ),
  uncertainties: z.array(z.string()),
  conflicts: z.array(z.object({ description: z.string(), source_ids: z.array(z.string()) })),
  implications: z.array(z.string()),
  content_opportunities: z.array(z.object({ angle: z.string(), format: z.string(), rationale: z.string() })),
});

const REPORT_SYSTEM = `You are ORBIT's research analyst. Produce a structured, source-backed research report from the retrieved sources.
Rules:
- Use ONLY the provided <source> blocks. Cite source ids exactly as given (e.g. "S1"). Never cite anything else.
- For every claim, "supporting_passage" must be an EXACT, verbatim excerpt (12-300 characters) copied from the cited source's text, or an empty string if no single passage supports it. ORBIT checks these passages programmatically.
- basis: "verified_in_source" = directly stated in a source; "reported_claim" = a source attributes it to someone else or it is unconfirmed; "interpretation" = your analysis (must have empty supporting_passage).
- Distinguish event dates from publication dates. Use "unknown" when a date is not stated.
- Expose disagreement between sources in "conflicts" and gaps in "uncertainties". If only one source exists, say so in uncertainties.
- Content opportunities must suit the user's stated identity and must not assume personal experiences.`;

export interface ReportSourceStatus {
  source: ResearchSource;
  catalogId: string;
  fetched: boolean;
  reason: string | null;
}

export interface BuildReportResult {
  report: ResearchReport;
  sourceStatuses: ReportSourceStatus[];
}

/** Retrieves source text (where permitted), generates a report, and verifies passages. */
export async function buildResearchReport(supabase: SupabaseClient, userId: string, discoveryId: string): Promise<BuildReportResult> {
  const { data: discovery } = await supabase.from("discoveries").select("*").eq("id", discoveryId).eq("user_id", userId).maybeSingle();
  if (!discovery) throw new AIServiceError("bad_request", "Discovery not found.");
  const d = discovery as Discovery;

  const { data: links } = await supabase
    .from("discovery_sources")
    .select("research_source_id, research_sources(*)")
    .eq("discovery_id", discoveryId)
    .eq("user_id", userId);
  const sources = ((links ?? []) as unknown as { research_sources: ResearchSource | null }[])
    .map((l) => l.research_sources)
    .filter((s): s is ResearchSource => Boolean(s))
    .slice(0, 8);
  if (!sources.length) throw new AIServiceError("bad_request", "This discovery has no sources to research.");

  // Retrieve full text where permitted. Failures are recorded, never hidden.
  const statuses: ReportSourceStatus[] = await Promise.all(
    sources.map(async (source, i) => {
      const catalogId = `S${i + 1}`;
      if (source.fetch_status === "fetched" && source.excerpt && source.excerpt.length > 1500) {
        return { source, catalogId, fetched: true, reason: null };
      }
      const outcome = await extractArticle(source.url);
      if (outcome.ok) {
        const { article } = outcome;
        const update = {
          excerpt: article.text,
          content_hash: article.contentHash,
          fetch_status: "fetched" as const,
          title: source.title ?? article.title,
          publisher: article.publisher ?? source.publisher,
          published_at: source.published_at ?? article.publishedAt,
          retrieved_at: new Date().toISOString(),
        };
        await supabase.from("research_sources").update(update).eq("id", source.id).eq("user_id", userId);
        return { source: { ...source, ...update }, catalogId, fetched: true, reason: null };
      }
      await supabase
        .from("research_sources")
        .update({ fetch_status: outcome.status, metadata: { ...source.metadata, last_fetch_error: outcome.reason } })
        .eq("id", source.id)
        .eq("user_id", userId);
      return { source, catalogId, fetched: false, reason: outcome.reason };
    }),
  );

  const ctx = await loadUserContext(supabase, userId);
  const catalog = statuses
    .map(({ source, catalogId, fetched, reason }) =>
      [
        `<source id="${catalogId}">`,
        `title: ${source.title ?? "(untitled)"}`,
        `url: ${source.url}`,
        `publisher: ${source.publisher ?? "unknown"}`,
        `published: ${source.published_at ?? source.published_at_text ?? "unknown"}`,
        fetched ? "retrieval: full text retrieved" : `retrieval: only search excerpts available (${reason ?? "not fetched"})`,
        `text:\n${(source.excerpt ?? "(no text retrieved)").slice(0, 12000)}`,
        `</source>`,
      ].join("\n"),
    )
    .join("\n\n");

  const out = await generateStructured({
    schema: ReportSchema,
    system: REPORT_SYSTEM,
    effort: "medium",
    prompt: `Today's date: ${new Date().toISOString().slice(0, 10)}

<user_profile>
${describeIdentity(ctx)}
</user_profile>

Discovery being researched:
Title: ${d.title}
Summary: ${d.summary}

Sources:
${catalog}

Write the research report.`,
  });

  const idMap = new Map(statuses.map((s) => [s.catalogId, s.source]));
  const toDb = (ids: string[]) => [...new Set(ids.filter((id) => idMap.has(id)).map((id) => idMap.get(id)!.id))];

  const claims: ReportClaim[] = out.claims.map((c, i) => {
    const cited = c.source_ids.filter((id) => idMap.has(id));
    const texts = cited.map((id) => idMap.get(id)!.excerpt ?? "");
    const passage = c.supporting_passage.trim() || null;
    return {
      id: `c${i + 1}`,
      text: c.text,
      source_ids: toDb(cited),
      supporting_passage: passage,
      passage_verified: passage ? passageAppearsIn(passage, texts) : false,
      basis: cited.length === 0 && c.basis !== "interpretation" ? "interpretation" : c.basis,
      confidence: c.confidence,
    };
  });

  const { data: report, error } = await supabase
    .from("research_reports")
    .insert({
      user_id: userId,
      discovery_id: discoveryId,
      title: out.title,
      summary: out.summary,
      key_findings: out.key_findings.map((k) => ({ ...k, source_ids: toDb(k.source_ids) })),
      claims,
      entities: out.entities,
      important_dates: out.important_dates.map((dt) => ({ ...dt, source_ids: toDb(dt.source_ids) })),
      uncertainties: out.uncertainties,
      conflicts: out.conflicts.map((c) => ({ ...c, source_ids: toDb(c.source_ids) })),
      implications: out.implications,
      content_opportunities: out.content_opportunities,
      model: aiModel(),
    })
    .select("*")
    .single();
  if (error || !report) throw new Error(`Could not save research report: ${error?.message}`);
  const saved = report as ResearchReport;

  await supabase
    .from("research_report_sources")
    .insert(statuses.map((s) => ({ research_report_id: saved.id, research_source_id: s.source.id, user_id: userId })));
  if (d.status === "new" || d.status === "saved") {
    await supabase.from("discoveries").update({ status: "reviewed" }).eq("id", discoveryId).eq("user_id", userId);
  }
  return { report: saved, sourceStatuses: statuses };
}
