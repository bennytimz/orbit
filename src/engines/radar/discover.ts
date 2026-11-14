import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateStructured, webResearch } from "@/lib/ai/client";
import { AIServiceError } from "@/lib/ai/errors";
import { describeIdentity, loadUserContext, type UserContext } from "@/engines/brain/context";
import type { Discovery, RelevanceFactors, ResearchSource } from "@/types/domain";
import { computeRelevanceScore, parseSourceDate, recencyFactor, clampScore } from "./relevance";
import { upsertSources, type SourceInput } from "./sources";

export const DISCOVERY_CATEGORIES = [
  "breaking_development",
  "emerging_trend",
  "industry_analysis",
  "research_discovery",
  "competitive_intelligence",
  "educational_opportunity",
  "opinion_opportunity",
  "product_update",
  "community_discussion",
  "evergreen_knowledge",
] as const;

const factor = z.object({ score: z.number(), reason: z.string() });

export const DiscoveryAnalysisSchema = z.object({
  discoveries: z.array(
    z.object({
      title: z.string(),
      summary: z.string(),
      category: z.enum(DISCOVERY_CATEGORIES),
      topics: z.array(z.string()),
      entities: z.array(z.string()),
      source_ids: z.array(z.string()),
      key_findings: z.array(
        z.object({
          text: z.string(),
          source_ids: z.array(z.string()),
          basis: z.enum(["verified_in_source", "reported_claim", "interpretation"]),
        }),
      ),
      why_it_matters: z.string(),
      content_angles: z.array(z.object({ angle: z.string(), format: z.string(), rationale: z.string() })),
      event_date: z.string(),
      confidence: z.enum(["high", "medium", "low"]),
      impact_assessment: z.string(),
      factors: z.object({
        interest_match: factor,
        expertise_match: factor,
        audience_relevance: factor,
        potential_impact: factor,
        discussion_potential: factor,
        novelty: factor,
        source_credibility: factor,
      }),
    }),
  ),
});

export type DiscoveryAnalysis = z.infer<typeof DiscoveryAnalysisSchema>;

export interface CatalogEntry {
  id: string; // S1, S2...
  source: SourceInput;
  passages: string[];
}

function catalogText(catalog: CatalogEntry[]): string {
  return catalog
    .map((c) =>
      [
        `<source id="${c.id}">`,
        `title: ${c.source.title ?? "(untitled)"}`,
        `url: ${c.source.url}`,
        `publisher: ${c.source.publisher ?? "unknown"}`,
        `published: ${c.source.publishedAtIso ?? c.source.publishedAtText ?? "unknown"}`,
        c.passages.length ? `retrieved passages:\n${c.passages.map((p) => `- ${p.slice(0, 1200)}`).join("\n")}` : "retrieved passages: none",
        `</source>`,
      ].join("\n"),
    )
    .join("\n\n");
}

const ANALYST_SYSTEM = `You are ORBIT's Radar analyst. You turn retrieved sources into discovery records for a professional who wants to communicate about their field.
Rules:
- Use ONLY the information in the provided <source> blocks. Every discovery and every key finding must cite source ids from the catalog (e.g. "S2"). Never cite ids that are not in the catalog.
- basis: "verified_in_source" only when the finding is directly stated in a retrieved passage; "reported_claim" when a source reports it but it is not independently confirmed; "interpretation" for your own analysis.
- event_date: when the development actually happened, if a source states it; otherwise "unknown". Never confuse a publication date with an event date.
- Scores are 0-100 assessments of fit for THIS user, each with a one-sentence reason that names concrete evidence. Do not inflate scores.
- Prefer fewer, well-supported discoveries over many thin ones. Merge sources describing the same development.
- Content angles must be things this user could credibly say given their stated identity — never assume experiences they have not described.`;

export async function analyzeSources(ctx: UserContext, catalog: CatalogEntry[], focus: string): Promise<DiscoveryAnalysis> {
  const today = new Date().toISOString().slice(0, 10);
  return generateStructured({
    schema: DiscoveryAnalysisSchema,
    system: ANALYST_SYSTEM,
    effort: "medium",
    prompt: `Today's date: ${today}

<user_profile>
${describeIdentity(ctx)}
</user_profile>

Research focus: ${focus}

Source catalog:
${catalogText(catalog)}

Produce 1-5 discovery records grounded in these sources.`,
  });
}

function defaultFocus(ctx: UserContext): string {
  const interests = ctx.interests.map((i) => i.topic);
  const industry = ctx.profile?.industry;
  if (interests.length) return `Recent notable developments in: ${interests.slice(0, 5).join(", ")}${industry ? ` (industry: ${industry})` : ""}`;
  if (industry) return `Recent notable developments in the ${industry} industry`;
  throw new AIServiceError("bad_request", "Add a topic to search for, or set your interests in My Voice so Radar knows what to look for.");
}

/** Persists validated discoveries and their source links. Returns inserted rows. */
async function persistDiscoveries(
  supabase: SupabaseClient,
  userId: string,
  analysis: DiscoveryAnalysis,
  catalog: CatalogEntry[],
  query: string,
  provider: string,
): Promise<Discovery[]> {
  const sourceMap = await upsertSources(
    supabase,
    userId,
    catalog.map((c) => ({ ...c.source, excerpt: c.passages.join("\n\n").slice(0, 8000) || c.source.excerpt })),
  );
  const byCatalogId = new Map<string, ResearchSource>();
  for (const c of catalog) {
    const s = sourceMap.get(c.source.url);
    if (s) byCatalogId.set(c.id, s);
  }

  const inserted: Discovery[] = [];
  for (const d of analysis.discoveries) {
    // Source integrity: keep only references to sources we actually retrieved.
    const validIds = d.source_ids.filter((id) => byCatalogId.has(id));
    if (!validIds.length) continue;
    const toDbIds = (ids: string[]) => ids.filter((id) => byCatalogId.has(id)).map((id) => byCatalogId.get(id)!.id);

    const recency = recencyFactor(validIds.map((id) => {
      const s = byCatalogId.get(id)!;
      return s.published_at ? new Date(s.published_at) : parseSourceDate(s.published_at_text);
    }));
    const factors: RelevanceFactors = {
      interest_match: { score: clampScore(d.factors.interest_match.score), reason: d.factors.interest_match.reason },
      expertise_match: { score: clampScore(d.factors.expertise_match.score), reason: d.factors.expertise_match.reason },
      audience_relevance: { score: clampScore(d.factors.audience_relevance.score), reason: d.factors.audience_relevance.reason },
      potential_impact: { score: clampScore(d.factors.potential_impact.score), reason: d.factors.potential_impact.reason },
      discussion_potential: { score: clampScore(d.factors.discussion_potential.score), reason: d.factors.discussion_potential.reason },
      novelty: { score: clampScore(d.factors.novelty.score), reason: d.factors.novelty.reason },
      source_credibility: { score: clampScore(d.factors.source_credibility.score), reason: d.factors.source_credibility.reason },
      recency,
    };

    const { data, error } = await supabase
      .from("discoveries")
      .insert({
        user_id: userId,
        title: d.title.slice(0, 300),
        summary: d.summary,
        category: d.category,
        topics: d.topics.slice(0, 8),
        entities: d.entities.slice(0, 15),
        key_findings: d.key_findings
          .map((k) => ({ text: k.text, basis: k.basis, source_ids: toDbIds(k.source_ids) }))
          .filter((k) => k.source_ids.length > 0 || k.basis === "interpretation"),
        why_it_matters: d.why_it_matters,
        content_angles: d.content_angles.slice(0, 5),
        relevance_score: computeRelevanceScore(factors),
        relevance_factors: factors,
        impact_assessment: d.impact_assessment,
        confidence: d.confidence,
        event_date: d.event_date && d.event_date.toLowerCase() !== "unknown" ? d.event_date : null,
        query,
        provider,
      })
      .select("*")
      .single();
    if (error || !data) throw new Error(`Could not save discovery: ${error?.message}`);
    const discovery = data as Discovery;
    const links = toDbIds(validIds).map((sid) => ({ discovery_id: discovery.id, research_source_id: sid, user_id: userId }));
    const { error: linkError } = await supabase.from("discovery_sources").insert(links);
    if (linkError) throw new Error(`Could not link discovery sources: ${linkError.message}`);
    inserted.push(discovery);
  }
  return inserted;
}

export interface DiscoverResult {
  discoveries: Discovery[];
  sourcesFound: number;
  searches: number;
  dropped: number;
}

/** Web discovery via the AI provider's web search (unavailable on the Gemini provider; see TD-019). */
export async function discoverFromWeb(supabase: SupabaseClient, userId: string, query: string | null): Promise<DiscoverResult> {
  const ctx = await loadUserContext(supabase, userId);
  const focus = query?.trim() || defaultFocus(ctx);
  const today = new Date().toISOString().slice(0, 10);

  const research = await webResearch({
    system: `You are ORBIT's research scout. Search the web for current, credible developments and report what you find with citations. Prefer primary and authoritative sources (official announcements, papers, reputable publications). Note publication dates when visible.`,
    prompt: `Today's date: ${today}

<user_profile>
${describeIdentity(ctx)}
</user_profile>

Find the most notable recent developments (prefer the last 30 days) for this research focus: ${focus}

Summarize each development in 2-4 sentences with citations. Mention uncertainties or conflicting reports where you see them.`,
    maxSearches: 5,
  });

  if (!research.sources.length) {
    throw new AIServiceError("provider_unavailable", "Web research returned no sources for this query. Try a broader topic.");
  }

  const catalog: CatalogEntry[] = research.sources.slice(0, 20).map((s, i) => ({
    id: `S${i + 1}`,
    source: { url: s.url, title: s.title, publishedAtText: s.pageAge, provider: "web_search" },
    passages: s.citedPassages,
  }));
  const analysis = await analyzeSources(ctx, catalog, focus);
  const discoveries = await persistDiscoveries(supabase, userId, analysis, catalog, focus, "web_search");
  return {
    discoveries,
    sourcesFound: research.sources.length,
    searches: research.searchCount,
    dropped: analysis.discoveries.length - discoveries.length,
  };
}

/** Discovery from explicitly retrieved items (RSS entries or user-submitted URLs). */
export async function discoverFromItems(
  supabase: SupabaseClient,
  userId: string,
  items: { source: SourceInput; passages: string[] }[],
  focus: string,
  provider: "rss" | "url",
): Promise<DiscoverResult> {
  const ctx = await loadUserContext(supabase, userId);
  const catalog: CatalogEntry[] = items.slice(0, 20).map((item, i) => ({ id: `S${i + 1}`, source: item.source, passages: item.passages }));
  if (!catalog.length) throw new AIServiceError("bad_request", "There were no retrievable items to analyze.");
  const analysis = await analyzeSources(ctx, catalog, focus);
  const discoveries = await persistDiscoveries(supabase, userId, analysis, catalog, focus, provider);
  return { discoveries, sourcesFound: catalog.length, searches: 0, dropped: analysis.discoveries.length - discoveries.length };
}
