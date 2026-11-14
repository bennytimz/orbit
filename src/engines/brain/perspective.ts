import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateStructured } from "@/lib/ai/client";
import { describeIdentity, describeKnowledge, loadUserContext } from "./context";
import type { Discovery, ResearchReport } from "@/types/domain";

export const QuestionSchema = z.object({
  questions: z.array(z.object({ question: z.string(), why: z.string() })),
});

export async function generatePerspectiveQuestions(
  supabase: SupabaseClient,
  userId: string,
  discovery: Discovery,
  report: ResearchReport | null,
) {
  const ctx = await loadUserContext(supabase, userId);
  const out = await generateStructured({
    schema: QuestionSchema,
    effort: "low",
    maxTokens: 4000,
    system: `You are ORBIT's interviewer. Your job is to draw out the user's OWN perspective, experience and judgment about a development, so their content reflects them rather than generic AI commentary.
Ask 4-5 short, specific, open questions. Mix: agreement/disagreement, personal professional experience, what others overlook, advice for people affected, and predictions. Reference concrete details from the research. Never assume the user has particular experiences — ask instead.`,
    prompt: `<user_profile>
${describeIdentity(ctx)}
</user_profile>

<known_user_views>
${describeKnowledge(ctx, 8)}
</known_user_views>

<development>
Title: ${discovery.title}
Summary: ${report?.summary ?? discovery.summary}
Key findings:
${(report?.key_findings ?? discovery.key_findings).map((k) => `- ${k.text}`).join("\n")}
Uncertainties:
${(report?.uncertainties ?? []).map((u) => `- ${u}`).join("\n") || "- none recorded"}
</development>`,
  });
  return out.questions.slice(0, 6);
}

export const VoiceAnalysisSchema = z.object({
  tone: z.string(),
  formality: z.string(),
  personality: z.string(),
  vocabulary: z.string(),
  sentence_length: z.string(),
  humor: z.string(),
  technical_depth: z.string(),
  writing_preferences: z.string(),
  observations: z.array(z.string()),
  caveats: z.array(z.string()),
});

export async function analyzeWritingSamples(samples: { title: string | null; body: string }[], instructions: string | null) {
  return generateStructured({
    schema: VoiceAnalysisSchema,
    effort: "medium",
    maxTokens: 6000,
    system: `You analyze writing samples to describe a person's writing voice as an editable profile. Be concrete and descriptive (e.g. "Short declarative sentences, often under 15 words; opens with a contrarian claim"). Each field is one or two sentences.
In "caveats", state honestly how representative the analysis can be given the number and kind of samples. Never claim a few samples fully capture someone's identity.`,
    prompt: `${instructions ? `The user's own description of their voice:\n<user_content>${instructions}</user_content>\n\n` : ""}Writing samples (${samples.length}):
${samples.map((s, i) => `<user_content sample="${i + 1}"${s.title ? ` title="${s.title.replace(/"/g, "'")}"` : ""}>\n${s.body.slice(0, 5000)}\n</user_content>`).join("\n\n")}`,
  });
}
