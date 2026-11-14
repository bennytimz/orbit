import type { GuardianEvidence, Platform } from "@/types/domain";
import { PLATFORMS, countCharacters, countEmoji, countHashtags } from "@/engines/studio/platforms";

export interface RuleIssue {
  issue_type: string;
  severity: "info" | "warning" | "blocking";
  title: string;
  explanation: string;
  excerpt: string | null;
  recommended_action: string;
  evidence: GuardianEvidence[];
}

export interface RuleInput {
  body: string;
  threadParts: string[] | null;
  platform: Platform;
  wordsToAvoid: string[];
  /** Texts the content may legitimately draw facts from (sources + user perspective). */
  supportingTexts: string[];
  /** Other assets' bodies, for duplicate detection. */
  otherBodies: { id: string; title: string; body: string }[];
  hasResearch: boolean;
  linkedSourceCount: number;
}

export const GENERIC_AI_PHRASES = [
  "in today's fast-paced world",
  "in today's digital age",
  "let's dive in",
  "dive into",
  "game-changer",
  "game changer",
  "unlock the power",
  "revolutionize",
  "in the ever-evolving",
  "ever-evolving landscape",
  "it's no secret that",
  "buckle up",
  "exciting news",
  "stay tuned",
  "the future is here",
  "a testament to",
  "navigating the complexities",
  "delve",
];

const PLACEHOLDER_RE = /\[(insert|add|your|todo|tbd|link|name)[^\]]*\]|\{\{[^}]+\}\}|\bTODO\b|\bTBD\b|lorem ipsum/i;

/** Numeric facts: percentages, currency, multipliers, and numbers with separators/units. */
const STAT_RE = /(?:[$€£]\s?\d[\d,.]*(?:\s?(?:million|billion|trillion|[kmb]n?\b))?|\b\d[\d,.]*\s?(?:%|percent\b|x\b|million\b|billion\b|trillion\b|k\b))/gi;
const YEAR_RE = /\b(19\d{2}|20\d{2})\b/g;

function normalizeNumber(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "").replace(/,/g, "").replace(/percent/, "%");
}

function excerptAround(text: string, needle: string, radius = 60): string {
  const idx = text.toLowerCase().indexOf(needle.toLowerCase());
  if (idx < 0) return needle;
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + needle.length + radius);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

export function extractStatistics(text: string): string[] {
  return [...new Set((text.match(STAT_RE) ?? []).map((m) => m.trim()))];
}

export function findUnsupportedStatistics(text: string, supportingTexts: string[]): string[] {
  const haystack = normalizeNumber(supportingTexts.join(" \n "));
  return extractStatistics(text).filter((stat) => {
    const core = normalizeNumber(stat).replace(/[$€£]/g, "").replace(/(million|billion|trillion|bn|mn|k|m|b|x|%)$/i, "");
    return core.length > 0 && !haystack.includes(core);
  });
}

function shingles(text: string): Set<string> {
  const words = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  const set = new Set<string>();
  for (let i = 0; i + 2 < words.length; i++) set.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  return set;
}

export function similarity(a: string, b: string): number {
  const sa = shingles(a);
  const sb = shingles(b);
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  for (const s of sa) if (sb.has(s)) inter++;
  return inter / (sa.size + sb.size - inter);
}

export function runRuleChecks(input: RuleInput): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const spec = PLATFORMS[input.platform];
  const body = input.body;

  if (!body.trim()) {
    issues.push({
      issue_type: "completeness",
      severity: "blocking",
      title: "Content is empty",
      explanation: "There is no text to publish.",
      excerpt: null,
      recommended_action: "Write or generate the content before publishing.",
      evidence: [],
    });
    return issues;
  }

  const parts = input.threadParts?.length ? input.threadParts : [body];
  if (spec.maxChars) {
    parts.forEach((part, i) => {
      const count = countCharacters(part, input.platform);
      if (count > spec.maxChars!) {
        issues.push({
          issue_type: "platform_constraint",
          severity: "blocking",
          title: parts.length > 1 ? `Thread post ${i + 1} exceeds ${spec.label}'s limit` : `Exceeds ${spec.label}'s character limit`,
          explanation: `${count} characters counted against a limit of ${spec.maxChars}${spec.counting === "x_weighted" ? " (links count as 23 characters on X)" : ""}. ${spec.label} will reject or truncate it.`,
          excerpt: null,
          recommended_action: "Shorten the text, or use the “Fit to limit” transformation.",
          evidence: [{ note: `Counted ${count} / ${spec.maxChars}` }],
        });
      }
    });
  }

  if (spec.requiresMedia) {
    issues.push({
      issue_type: "missing_media",
      severity: "warning",
      title: `${spec.label} posts require an image or video`,
      explanation: `${spec.label} does not accept text-only posts. ORBIT does not attach media yet, so this draft cannot be published to ${spec.label} through ORBIT.`,
      excerpt: null,
      recommended_action: "Use the visual brief to create media, then attach it in Buffer — or publish this caption to a different platform.",
      evidence: [],
    });
  }

  const hashtags = countHashtags(body);
  if (spec.maxHashtags !== null && hashtags > spec.maxHashtags) {
    issues.push({
      issue_type: "formatting",
      severity: "warning",
      title: "Too many hashtags",
      explanation: `${hashtags} hashtags found; ${spec.label} content works best with at most ${spec.maxHashtags}.`,
      excerpt: null,
      recommended_action: "Keep only the most relevant hashtags.",
      evidence: [],
    });
  }

  const emoji = countEmoji(body);
  if (emoji > 3) {
    issues.push({
      issue_type: "formatting",
      severity: "info",
      title: "Heavy emoji use",
      explanation: `${emoji} emoji found. ORBIT's style guidance avoids decorative emoji.`,
      excerpt: null,
      recommended_action: "Remove emoji that don't add meaning.",
      evidence: [],
    });
  }

  const placeholder = body.match(PLACEHOLDER_RE);
  if (placeholder) {
    issues.push({
      issue_type: "completeness",
      severity: "blocking",
      title: "Unfilled placeholder",
      explanation: `The text contains placeholder content (“${placeholder[0]}”).`,
      excerpt: excerptAround(body, placeholder[0]),
      recommended_action: "Replace the placeholder with real content.",
      evidence: [],
    });
  }

  const lower = body.toLowerCase();
  for (const word of input.wordsToAvoid) {
    const w = word.trim().toLowerCase();
    if (w && lower.includes(w)) {
      issues.push({
        issue_type: "brand_consistency",
        severity: "warning",
        title: `Uses a phrase you avoid: “${word}”`,
        explanation: "This word or phrase is on your voice profile's avoid list.",
        excerpt: excerptAround(body, word),
        recommended_action: "Rephrase without it.",
        evidence: [{ note: "Source: My Voice → words to avoid" }],
      });
    }
  }

  const generic = GENERIC_AI_PHRASES.filter((p) => lower.includes(p));
  if (generic.length) {
    issues.push({
      issue_type: "brand_consistency",
      severity: "warning",
      title: "Generic, AI-sounding phrasing",
      explanation: `Found: ${generic.map((g) => `“${g}”`).join(", ")}. These phrases make content sound templated.`,
      excerpt: excerptAround(body, generic[0]),
      recommended_action: "Replace with a specific, concrete statement in your own words.",
      evidence: [],
    });
  }

  const unsupported = findUnsupportedStatistics(body, input.supportingTexts);
  for (const stat of unsupported) {
    issues.push({
      issue_type: "unsupported_statistic",
      severity: "warning",
      title: `Statistic not found in sources: “${stat}”`,
      explanation: "This number does not appear in any attached source or in your perspective notes, so ORBIT cannot trace where it came from.",
      excerpt: excerptAround(body, stat),
      recommended_action: "Remove the number, or add a source that states it.",
      evidence: [{ note: `Checked against ${input.supportingTexts.length} source/perspective text(s).` }],
    });
  }

  const haystack = input.supportingTexts.join(" ");
  const years = [...new Set(body.match(YEAR_RE) ?? [])].filter((y) => !haystack.includes(y));
  for (const year of years) {
    issues.push({
      issue_type: "date_check",
      severity: "info",
      title: `Date not found in sources: ${year}`,
      explanation: "This year does not appear in the attached sources or your perspective. It may be correct, but ORBIT cannot confirm it.",
      excerpt: excerptAround(body, year),
      recommended_action: "Confirm the date is accurate.",
      evidence: [],
    });
  }

  for (const other of input.otherBodies) {
    const score = similarity(body, other.body);
    if (score >= 0.6) {
      issues.push({
        issue_type: "duplicate_content",
        severity: "warning",
        title: "Very similar to another draft",
        explanation: `About ${Math.round(score * 100)}% overlap with “${other.title}”. Publishing near-duplicates can look repetitive.`,
        excerpt: null,
        recommended_action: "Differentiate the angle or wording, or archive one of them.",
        evidence: [{ note: `Similar asset id: ${other.id}` }],
      });
      break;
    }
  }

  if (input.hasResearch && input.linkedSourceCount === 0 && extractStatistics(body).length > 0) {
    issues.push({
      issue_type: "source_traceability",
      severity: "warning",
      title: "No sources attached",
      explanation: "This research-based content has factual figures but no linked sources.",
      excerpt: null,
      recommended_action: "Regenerate from the research report, or remove the unsupported facts.",
      evidence: [],
    });
  }

  return issues;
}

export function overallStatus(issues: { severity: string; review_status?: string }[]): "pass" | "warnings" | "blocking" {
  const open = issues.filter((i) => (i.review_status ?? "open") === "open");
  if (open.some((i) => i.severity === "blocking")) return "blocking";
  if (open.some((i) => i.severity === "warning")) return "warnings";
  return "pass";
}
