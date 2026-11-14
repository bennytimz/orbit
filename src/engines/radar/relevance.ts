import type { RelevanceFactor, RelevanceFactorKey, RelevanceFactors } from "@/types/domain";

/**
 * Relevance is a transparent weighted average of named factors. Each factor
 * carries a reason that the UI shows, so the score is never an unexplained
 * number. Recency is computed deterministically from source dates; the other
 * factors are AI assessments and are labelled as such in the interface.
 */

export const FACTOR_WEIGHTS: Record<RelevanceFactorKey, number> = {
  interest_match: 0.22,
  audience_relevance: 0.16,
  recency: 0.14,
  expertise_match: 0.12,
  potential_impact: 0.12,
  discussion_potential: 0.08,
  novelty: 0.08,
  source_credibility: 0.08,
};

export const FACTOR_LABELS: Record<RelevanceFactorKey, string> = {
  interest_match: "Matches your interests",
  expertise_match: "Matches your expertise",
  audience_relevance: "Relevant to your audience",
  recency: "Recency",
  potential_impact: "Potential impact",
  discussion_potential: "Discussion potential",
  novelty: "Novelty",
  source_credibility: "Source credibility",
};

export function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function computeRelevanceScore(factors: RelevanceFactors): number | null {
  let weighted = 0;
  let totalWeight = 0;
  for (const [key, weight] of Object.entries(FACTOR_WEIGHTS) as [RelevanceFactorKey, number][]) {
    const factor = factors[key];
    if (!factor) continue;
    weighted += clampScore(factor.score) * weight;
    totalWeight += weight;
  }
  if (totalWeight === 0) return null;
  return clampScore(weighted / totalWeight);
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * Parses provider date strings: ISO dates, "March 3, 2026", "3 days ago",
 * "2 weeks ago", "yesterday". Returns null when the date is unknown.
 */
export function parseSourceDate(text: string | null | undefined, now: Date = new Date()): Date | null {
  if (!text) return null;
  const t = text.trim().toLowerCase();
  if (!t) return null;
  const rel = t.match(/^(\d+)\s+(minute|hour|day|week|month|year)s?\s+ago$/);
  if (rel) {
    const n = Number(rel[1]);
    const unitMs: Record<string, number> = {
      minute: 60_000,
      hour: 3_600_000,
      day: 86_400_000,
      week: 7 * 86_400_000,
      month: 30 * 86_400_000,
      year: 365 * 86_400_000,
    };
    return new Date(now.getTime() - n * unitMs[rel[2]]);
  }
  if (t === "yesterday") return new Date(now.getTime() - 86_400_000);
  if (t === "today") return now;
  if (MONTHS.some((m) => t.includes(m)) || /\d{4}-\d{2}-\d{2}/.test(t)) {
    const d = new Date(text);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

export function recencyFactor(dates: (Date | null)[], now: Date = new Date()): RelevanceFactor {
  const known = dates.filter((d): d is Date => d !== null && d.getTime() <= now.getTime() + 86_400_000);
  if (!known.length) return { score: 40, reason: "Publication dates of the sources are unknown, so recency could not be assessed." };
  const newest = new Date(Math.max(...known.map((d) => d.getTime())));
  const days = Math.max(0, (now.getTime() - newest.getTime()) / 86_400_000);
  const when = days < 1 ? "today" : `${Math.round(days)} day${Math.round(days) === 1 ? "" : "s"} ago`;
  let score: number;
  if (days <= 2) score = 100;
  else if (days <= 7) score = 88;
  else if (days <= 30) score = 70;
  else if (days <= 90) score = 48;
  else if (days <= 365) score = 30;
  else score = 15;
  return { score, reason: `Most recent source was published ${when} (${newest.toISOString().slice(0, 10)}).` };
}

export function relevanceBand(score: number | null): { label: string; tone: "high" | "medium" | "low" | "unknown" } {
  if (score === null) return { label: "Not assessed", tone: "unknown" };
  if (score >= 75) return { label: "High relevance", tone: "high" };
  if (score >= 50) return { label: "Moderate relevance", tone: "medium" };
  return { label: "Low relevance", tone: "low" };
}
