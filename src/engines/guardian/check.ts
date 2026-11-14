import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateStructured } from "@/lib/ai/client";
import { AIServiceError } from "@/lib/ai/errors";
import { safeFetch } from "@/lib/research/safe-fetch";
import { describeVoice, loadUserContext } from "@/engines/brain/context";
import { PLATFORMS } from "@/engines/studio/platforms";
import type { ContentAsset, GuardianEvidence, GuardianIssue, GuardianReport, Perspective, ResearchSource } from "@/types/domain";
import { overallStatus, runRuleChecks, type RuleIssue } from "./rules";

const status = z.enum(["supported", "partially_supported", "unsupported", "conflicting", "unable_to_verify"]);

export const GuardianAISchema = z.object({
  summary: z.string(),
  claims: z.array(
    z.object({
      claim: z.string(),
      status,
      source_ids: z.array(z.string()),
      supporting_passage: z.string(),
      explanation: z.string(),
      recommended_correction: z.string(),
    }),
  ),
  other_issues: z.array(
    z.object({
      issue_type: z.enum(["misleading_language", "brand_consistency", "campaign_consistency", "attribution", "outdated", "tone", "completeness", "fabricated_experience"]),
      severity: z.enum(["info", "warning", "blocking"]),
      title: z.string(),
      explanation: z.string(),
      excerpt: z.string(),
      recommended_action: z.string(),
    }),
  ),
});

const GUARDIAN_SYSTEM = `You are ORBIT Guardian, a careful pre-publication reviewer. You assess content against the provided evidence and the user's own stated perspective.
- Extract every factual claim (not opinions) from the content and judge it ONLY against the provided <source> texts: supported, partially_supported, unsupported, conflicting, or unable_to_verify (e.g. source text not available). Quote a verbatim supporting_passage when one exists, else empty string.
- Opinions clearly framed as the user's view are not factual claims. But flag "fabricated_experience" (blocking) when the content attributes personal experiences, results, or opinions to the author that do NOT appear in <perspective>.
- Flag misleading language (overstated certainty, causal claims the sources don't make, "reported" claims stated as fact), attribution problems, and voice mismatches.
- Be specific: every issue must quote the problematic excerpt. Do not invent problems; if the content is fine, return few or no issues.
- Your assessment is not absolute: in explanations, state the basis (which source) and its limits.`;

async function checkLinks(text: string): Promise<RuleIssue[]> {
  const urls = [...new Set(text.match(/https?:\/\/[^\s)]+/g) ?? [])].slice(0, 5);
  const results = await Promise.all(
    urls.map(async (url) => {
      try {
        const res = await safeFetch(url, { timeoutMs: 8000 });
        return res.status >= 400 ? { url, problem: `HTTP ${res.status}` } : null;
      } catch (e) {
        return { url, problem: e instanceof Error ? e.message : "unreachable" };
      }
    }),
  );
  return results
    .filter((r): r is { url: string; problem: string } => r !== null)
    .map((r) => ({
      issue_type: "broken_link",
      severity: "warning" as const,
      title: "Link may be broken",
      explanation: `ORBIT could not load ${r.url} (${r.problem}).`,
      excerpt: r.url,
      recommended_action: "Check the link in a browser and fix or remove it.",
      evidence: [{ source_url: r.url, note: r.problem }],
    }));
}

export interface GuardianRunResult {
  report: GuardianReport;
  issues: GuardianIssue[];
}

export async function runGuardian(supabase: SupabaseClient, userId: string, assetId: string): Promise<GuardianRunResult> {
  const { data: assetRow } = await supabase.from("content_assets").select("*").eq("id", assetId).eq("user_id", userId).maybeSingle();
  if (!assetRow) throw new AIServiceError("bad_request", "Content not found.");
  const asset = assetRow as ContentAsset;
  const ctx = await loadUserContext(supabase, userId);

  const [{ data: srcLinks }, { data: perspRows }, { data: others }] = await Promise.all([
    supabase.from("content_sources").select("research_sources(*)").eq("content_asset_id", asset.id).eq("user_id", userId),
    asset.discovery_id
      ? supabase.from("perspectives").select("*").eq("discovery_id", asset.discovery_id).eq("user_id", userId)
      : Promise.resolve({ data: [] as Perspective[] }),
    supabase
      .from("content_assets")
      .select("id,title,body,platform")
      .eq("user_id", userId)
      .neq("id", asset.id)
      .neq("status", "archived")
      .eq("platform", asset.platform)
      .order("updated_at", { ascending: false })
      .limit(50),
  ]);

  let sources = ((srcLinks ?? []) as unknown as { research_sources: ResearchSource | null }[])
    .map((r) => r.research_sources)
    .filter((s): s is ResearchSource => !!s);
  sources = [...new Map(sources.map((s) => [s.id, s])).values()];
  // Fall back to the report's sources when the draft has no explicit links.
  if (!sources.length && asset.research_report_id) {
    const { data } = await supabase.from("research_report_sources").select("research_sources(*)").eq("research_report_id", asset.research_report_id).eq("user_id", userId);
    sources = ((data ?? []) as unknown as { research_sources: ResearchSource | null }[]).map((r) => r.research_sources).filter((s): s is ResearchSource => !!s);
  }
  const perspectives = (perspRows as Perspective[] | null) ?? [];

  const ruleIssues = runRuleChecks({
    body: asset.body,
    threadParts: asset.thread_parts,
    platform: asset.platform,
    wordsToAvoid: ctx.voice?.words_to_avoid ?? [],
    supportingTexts: [...sources.map((s) => `${s.title ?? ""} ${s.excerpt ?? ""}`), ...perspectives.map((p) => p.content)],
    otherBodies: ((others ?? []) as { id: string; title: string; body: string }[]),
    hasResearch: Boolean(asset.discovery_id || asset.research_report_id),
    linkedSourceCount: sources.length,
  });
  const linkIssues = await checkLinks(asset.body);

  // AI evidence review — failure is reported, not hidden; rule checks still stand.
  let aiIssues: Omit<GuardianIssue, "id" | "user_id" | "guardian_report_id" | "content_asset_id" | "created_at" | "resolved_at" | "review_status">[] = [];
  let aiSummary: string | null = null;
  let aiError: string | null = null;
  if (asset.body.trim()) {
    try {
      const catalog = sources.map((s, i) => ({ id: `S${i + 1}`, s }));
      let campaignNote = "";
      if (asset.campaign_id) {
        const { data: c } = await supabase.from("campaigns").select("name,objective,target_audience,description").eq("id", asset.campaign_id).eq("user_id", userId).maybeSingle();
        if (c) campaignNote = `Campaign: ${c.name} — objective ${c.objective}; audience ${c.target_audience ?? "n/a"}; ${c.description ?? ""}`;
      }
      const out = await generateStructured({
        schema: GuardianAISchema,
        system: GUARDIAN_SYSTEM,
        effort: "medium",
        prompt: `Platform: ${PLATFORMS[asset.platform].label}
${campaignNote}

<voice>
${describeVoice(ctx)}
</voice>

<perspective>
${perspectives.map((p) => p.content).join("\n---\n") || "(no perspective recorded — any first-person experience claim is unsupported)"}
</perspective>

Sources:
${catalog.map((c) => `<source id="${c.id}" title="${(c.s.title ?? c.s.url).replace(/"/g, "'")}" url="${c.s.url}" published="${c.s.published_at?.slice(0, 10) ?? "unknown"}">\n${(c.s.excerpt ?? "(text unavailable)").slice(0, 6000)}\n</source>`).join("\n") || "(no sources attached)"}

Content to review:
<user_content>
${asset.body}
</user_content>`,
      });
      aiSummary = out.summary;
      const idMap = new Map(catalog.map((c) => [c.id, c.s]));
      const evidenceFor = (ids: string[], passage: string): GuardianEvidence[] =>
        ids
          .filter((id) => idMap.has(id))
          .map((id) => {
            const s = idMap.get(id)!;
            return { source_id: s.id, source_title: s.title ?? s.url, source_url: s.url, passage: passage || undefined };
          });
      for (const c of out.claims) {
        if (c.status === "supported") continue;
        aiIssues.push({
          issue_type: "factual_claim",
          severity: c.status === "unsupported" || c.status === "conflicting" ? "warning" : "info",
          title:
            c.status === "unsupported"
              ? "Claim not supported by sources"
              : c.status === "conflicting"
                ? "Sources conflict on this claim"
                : c.status === "partially_supported"
                  ? "Claim only partially supported"
                  : "Claim could not be verified",
          explanation: c.explanation,
          evidence: evidenceFor(c.source_ids, c.supporting_passage),
          excerpt: c.claim,
          verification_status: c.status,
          recommended_action: c.recommended_correction,
          check_source: "ai",
        });
      }
      for (const i of out.other_issues) {
        aiIssues.push({
          issue_type: i.issue_type,
          severity: i.severity,
          title: i.title,
          explanation: i.explanation,
          evidence: [],
          excerpt: i.excerpt || null,
          verification_status: null,
          recommended_action: i.recommended_action,
          check_source: "ai",
        });
      }
    } catch (error) {
      aiError = error instanceof AIServiceError ? error.userMessage : "AI review failed.";
      aiIssues = [];
    }
  }

  const all = [
    ...ruleIssues.map((r) => ({ ...r, verification_status: null, check_source: "rule" as const })),
    ...linkIssues.map((r) => ({ ...r, verification_status: null, check_source: "rule" as const })),
    ...aiIssues,
  ];
  const overall = overallStatus(all);
  const summary = aiSummary ?? (aiError ? `Rule checks completed. AI evidence review unavailable: ${aiError}` : "Rule checks completed.");

  const { data: report, error } = await supabase
    .from("guardian_reports")
    .insert({
      user_id: userId,
      content_asset_id: asset.id,
      overall_status: overall,
      summary,
      body_checked: asset.body,
      ai_checked: aiError === null,
      ai_error: aiError,
    })
    .select("*")
    .single();
  if (error || !report) throw new Error(`Could not save Guardian report: ${error?.message}`);

  let issues: GuardianIssue[] = [];
  if (all.length) {
    const { data: inserted, error: issueError } = await supabase
      .from("guardian_issues")
      .insert(all.map((i) => ({ ...i, user_id: userId, guardian_report_id: report.id, content_asset_id: asset.id })))
      .select("*");
    if (issueError) throw new Error(`Could not save Guardian issues: ${issueError.message}`);
    issues = (inserted as GuardianIssue[]) ?? [];
  }
  // Supersede open issues from earlier reports for this asset.
  await supabase
    .from("guardian_issues")
    .update({ review_status: "superseded", resolved_at: new Date().toISOString() })
    .eq("content_asset_id", asset.id)
    .eq("user_id", userId)
    .eq("review_status", "open")
    .neq("guardian_report_id", report.id);

  await supabase.from("content_assets").update({ guardian_status: overall }).eq("id", asset.id).eq("user_id", userId);
  return { report: report as GuardianReport, issues };
}
