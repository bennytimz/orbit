import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateStructured } from "@/lib/ai/client";
import { AIServiceError } from "@/lib/ai/errors";
import { describeIdentity, describeKnowledge, describeVoice, loadUserContext } from "@/engines/brain/context";
import type { ContentAsset, Discovery, Perspective, Platform, ResearchReport, ResearchSource } from "@/types/domain";
import { PLATFORMS, countCharacters } from "./platforms";

export const VariantSchema = z.object({
  variants: z.array(
    z.object({
      platform: z.enum(["linkedin", "x", "threads", "facebook", "instagram", "bluesky", "mastodon", "newsletter"]),
      title: z.string(),
      body: z.string(),
      thread_parts: z.array(z.string()),
      source_ids_used: z.array(z.string()),
      claims: z.array(z.object({ text: z.string(), source_ids: z.array(z.string()) })),
      perspective_used: z.array(z.string()),
      visual_brief: z.string(),
      notes: z.string(),
    }),
  ),
});

const STUDIO_SYSTEM = `You are ORBIT Studio, an editorial partner that turns research and a professional's OWN perspective into platform-native content in their voice.
Non-negotiable rules:
- The user's perspective (in <perspective>) is the heart of the piece. Express their actual views; do not add opinions, experiences, anecdotes, credentials or results they did not state. If no perspective is provided, write analytical content without first-person claims of experience.
- Factual statements must come from the provided sources and be listed in "claims" with the source ids that support them. Do not invent statistics, quotes, dates or names. Do not overstate certainty: keep "reported" claims attributed ("according to ...").
- Clearly separate opinion ("I think", "In my view") from fact.
- Each platform variant must be genuinely adapted (structure, length, hook, register) — never the same text resized.
- Avoid generic AI openers ("In today's fast-paced world", "Let's dive in", "Game-changer", "Exciting news"), filler, emoji decoration and hashtag stuffing. Use natural language.
- Respect each platform's character limit. For X, if the idea needs more than one post, put each post in "thread_parts" (each <= 280 chars) and set "body" to the full thread joined with blank lines; otherwise leave thread_parts empty.
- "visual_brief": a short, clearly-labelled visual concept (for Instagram always; otherwise optional, can be empty). Never claim an image exists.
- "perspective_used": short quotes/paraphrases of which user perspective points you used.
- "notes": anything the user should double-check before publishing (e.g. a claim with a single source).`;

export interface GenerateInput {
  platforms: Platform[];
  discoveryId: string | null;
  reportId: string | null;
  perspectiveIds: string[];
  ideaText: string | null;
  objective: string | null;
  contentType: string;
  instructions: string | null;
  campaignId: string | null;
}

export async function generateContent(supabase: SupabaseClient, userId: string, input: GenerateInput): Promise<ContentAsset[]> {
  if (!input.platforms.length) throw new AIServiceError("bad_request", "Select at least one platform.");
  const ctx = await loadUserContext(supabase, userId);

  let discovery: Discovery | null = null;
  let report: ResearchReport | null = null;
  if (input.discoveryId) {
    const { data } = await supabase.from("discoveries").select("*").eq("id", input.discoveryId).eq("user_id", userId).maybeSingle();
    discovery = (data as Discovery | null) ?? null;
  }
  if (input.reportId) {
    const { data } = await supabase.from("research_reports").select("*").eq("id", input.reportId).eq("user_id", userId).maybeSingle();
    report = (data as ResearchReport | null) ?? null;
  } else if (discovery) {
    const { data } = await supabase
      .from("research_reports")
      .select("*")
      .eq("discovery_id", discovery.id)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    report = (data as ResearchReport | null) ?? null;
  }

  // Sources available to cite.
  let sources: ResearchSource[] = [];
  if (report) {
    const { data } = await supabase.from("research_report_sources").select("research_sources(*)").eq("research_report_id", report.id).eq("user_id", userId);
    sources = ((data ?? []) as unknown as { research_sources: ResearchSource | null }[]).map((r) => r.research_sources).filter((s): s is ResearchSource => !!s);
  } else if (discovery) {
    const { data } = await supabase.from("discovery_sources").select("research_sources(*)").eq("discovery_id", discovery.id).eq("user_id", userId);
    sources = ((data ?? []) as unknown as { research_sources: ResearchSource | null }[]).map((r) => r.research_sources).filter((s): s is ResearchSource => !!s);
  }
  const catalog = sources.map((s, i) => ({ id: `S${i + 1}`, source: s }));

  let perspectives: Perspective[] = [];
  if (input.perspectiveIds.length) {
    const { data } = await supabase.from("perspectives").select("*").eq("user_id", userId).in("id", input.perspectiveIds);
    perspectives = (data as Perspective[] | null) ?? [];
  } else if (discovery) {
    const { data } = await supabase.from("perspectives").select("*").eq("user_id", userId).eq("discovery_id", discovery.id).order("created_at");
    perspectives = (data as Perspective[] | null) ?? [];
  }

  if (!discovery && !input.ideaText?.trim()) {
    throw new AIServiceError("bad_request", "Start from a discovery, or describe your idea.");
  }

  const platformBlock = input.platforms
    .map((p) => {
      const spec = PLATFORMS[p];
      return `- ${p} (${spec.label}): limit ${spec.maxChars ?? "none"} chars; aim ${spec.idealRange[0]}-${spec.idealRange[1]}. ${spec.guidance}`;
    })
    .join("\n");

  const prompt = `<user_profile>
${describeIdentity(ctx)}
</user_profile>

<voice>
${describeVoice(ctx)}
</voice>

<user_knowledge>
${describeKnowledge(ctx, 10)}
</user_knowledge>

${
  discovery
    ? `<research>
Development: ${discovery.title}
${report ? `Report summary: ${report.summary}
Claims (with verification):
${report.claims.map((c) => `- ${c.text} [basis: ${c.basis}; sources: ${c.source_ids.map((id) => catalog.find((x) => x.source.id === id)?.id).filter(Boolean).join(", ") || "none"}]`).join("\n")}
Uncertainties: ${report.uncertainties.join("; ") || "none recorded"}
Implications: ${report.implications.join("; ")}` : `Summary: ${discovery.summary}
Findings:
${discovery.key_findings.map((k) => `- ${k.text}`).join("\n")}`}
</research>

Sources you may cite (by id):
${catalog.map((c) => `<source id="${c.id}">${c.source.title ?? c.source.url} — ${c.source.publisher ?? ""} (${c.source.published_at?.slice(0, 10) ?? "date unknown"})\n${(c.source.excerpt ?? "").slice(0, 2500)}</source>`).join("\n") || "(none)"}`
    : ""
}

${input.ideaText ? `<idea>\n${input.ideaText}\n</idea>` : ""}

<perspective>
${perspectives.length ? perspectives.map((p) => `${p.question ? `Q: ${p.question}\n` : ""}A (${p.input_type}): ${p.content}`).join("\n\n") : "The user has not provided a perspective. Do not write first-person opinions or experiences."}
</perspective>

Content type: ${input.contentType}
Objective: ${input.objective ?? "inform and start a thoughtful discussion"}
${input.instructions ? `Additional user instructions:\n<user_content>${input.instructions}</user_content>` : ""}

Create one variant for each of these platforms:
${platformBlock}`;

  const out = await generateStructured({ schema: VariantSchema, system: STUDIO_SYSTEM, prompt, effort: "medium" });

  const group = randomUUID();
  const idToSource = new Map(catalog.map((c) => [c.id, c.source]));
  const created: ContentAsset[] = [];

  for (const platform of input.platforms) {
    const v = out.variants.find((x) => x.platform === platform);
    if (!v) continue;
    const threadParts = platform === "x" && v.thread_parts.length > 1 ? v.thread_parts : null;
    const body = v.body.trim();
    const usedSourceIds = [...new Set(v.source_ids_used.concat(v.claims.flatMap((c) => c.source_ids)).filter((id) => idToSource.has(id)))];

    const { data, error } = await supabase
      .from("content_assets")
      .insert({
        user_id: userId,
        title: v.title.slice(0, 200) || `${PLATFORMS[platform].label} draft`,
        body,
        thread_parts: threadParts,
        content_type: input.contentType,
        platform,
        status: "draft",
        objective: input.objective,
        voice_profile_id: ctx.voice?.id ?? null,
        discovery_id: discovery?.id ?? null,
        research_report_id: report?.id ?? null,
        campaign_id: input.campaignId,
        generation_group: group,
        ai_generated: true,
        original_ai_body: body,
        visual_brief: v.visual_brief.trim() || null,
        generation_notes: {
          perspective_used: v.perspective_used,
          source_ids: usedSourceIds.map((id) => idToSource.get(id)!.id),
          claims: v.claims.map((c) => ({ text: c.text, source_ids: c.source_ids.filter((id) => idToSource.has(id)).map((id) => idToSource.get(id)!.id) })),
          notes: [v.notes, (threadParts ?? [body]).some((part) => countCharacters(part, platform) > (PLATFORMS[platform].maxChars ?? Infinity)) ? "Draft exceeds the platform limit — shorten before publishing." : null].filter(Boolean).join(" ") || null,
        },
      })
      .select("*")
      .single();
    if (error || !data) throw new Error(`Could not save draft: ${error?.message}`);
    const asset = data as ContentAsset;
    created.push(asset);

    await supabase.from("content_versions").insert({
      user_id: userId,
      content_asset_id: asset.id,
      version_number: 1,
      body,
      thread_parts: threadParts,
      change_type: "ai_generated",
      note: "Initial AI draft",
    });

    const claimLinks = v.claims.flatMap((c) =>
      c.source_ids.filter((id) => idToSource.has(id)).map((id) => ({
        user_id: userId,
        content_asset_id: asset.id,
        research_source_id: idToSource.get(id)!.id,
        claim_text: c.text,
      })),
    );
    const uncited = usedSourceIds
      .filter((id) => !claimLinks.some((l) => l.research_source_id === idToSource.get(id)!.id))
      .map((id) => ({ user_id: userId, content_asset_id: asset.id, research_source_id: idToSource.get(id)!.id, claim_text: null }));
    if (claimLinks.length + uncited.length) await supabase.from("content_sources").insert([...claimLinks, ...uncited]);
  }

  if (discovery && discovery.status !== "used") {
    await supabase.from("discoveries").update({ status: "in_progress" }).eq("id", discovery.id).eq("user_id", userId);
  }
  if (!created.length) throw new AIServiceError("invalid_output", "The AI did not return any of the requested platform variants. Please try again.");
  return created;
}

export const TRANSFORMS = {
  shorten: "Make it noticeably shorter and tighter while keeping the core point, the user's perspective and all source-backed facts.",
  expand: "Expand with more depth and explanation using ONLY facts already present or in the provided sources. Do not add new facts or experiences.",
  more_formal: "Make the tone more formal and polished.",
  more_casual: "Make the tone more conversational and relaxed.",
  more_direct: "Make it more direct and opinionated in the user's existing stated views — do not invent new opinions.",
  clearer_hook: "Rewrite only the opening so it is a specific, concrete hook. Keep the rest substantively the same.",
  fit_limit: "Rewrite so it fits within the platform's character limit without losing the main point.",
} as const;

export type TransformKind = keyof typeof TRANSFORMS | "adapt" | "custom";

const TransformSchema = z.object({ body: z.string(), thread_parts: z.array(z.string()), change_summary: z.string() });

/** Returns a suggested rewrite. Never writes to the database. */
export async function suggestTransform(
  supabase: SupabaseClient,
  userId: string,
  asset: ContentAsset,
  kind: TransformKind,
  opts: { targetPlatform?: Platform; customInstruction?: string },
) {
  const ctx = await loadUserContext(supabase, userId);
  const targetPlatform = kind === "adapt" && opts.targetPlatform ? opts.targetPlatform : asset.platform;
  const spec = PLATFORMS[targetPlatform];
  let instruction: string;
  if (kind === "adapt") instruction = `Adapt this content for ${spec.label}. ${spec.guidance}`;
  else if (kind === "custom") instruction = opts.customInstruction?.trim() || "Improve clarity.";
  else instruction = TRANSFORMS[kind];

  const { data: srcRows } = await supabase.from("content_sources").select("research_sources(title, url, excerpt)").eq("content_asset_id", asset.id).eq("user_id", userId);
  const srcs = ((srcRows ?? []) as unknown as { research_sources: { title: string | null; url: string; excerpt: string | null } | null }[])
    .map((r) => r.research_sources)
    .filter((s): s is { title: string | null; url: string; excerpt: string | null } => !!s);

  const out = await generateStructured({
    schema: TransformSchema,
    effort: "low",
    maxTokens: 8000,
    system: `${STUDIO_SYSTEM}\nYou are revising an existing draft. Preserve the user's edits and perspective unless the instruction requires changing them. Return the full revised text. thread_parts only for X threads (else empty).`,
    prompt: `<voice>\n${describeVoice(ctx)}\n</voice>

Platform: ${spec.label} (limit ${spec.maxChars ?? "none"} chars). ${spec.guidance}

Sources available:
${srcs.map((s) => `<source>${s.title ?? s.url}\n${(s.excerpt ?? "").slice(0, 1500)}</source>`).join("\n") || "(none)"}

Current draft:
<user_content>
${asset.body}
</user_content>

Instruction: ${instruction}`,
  });
  return { ...out, platform: targetPlatform };
}
