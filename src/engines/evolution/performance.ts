import type { Platform } from "@/types/domain";

/**
 * Pure helpers for ORBIT's performance loop. Everything here works from
 * metrics Buffer actually reported. Nothing is estimated or invented, and no AI
 * call is made. A suggestion needs enough posts on both sides of a comparison,
 * and suggestions are only ever stored as "suggested" preferences that the user
 * must accept.
 */

export interface MetricLike {
  type: string;
  unit: string;
  value: number;
}

export function metricValue(metrics: MetricLike[] | null | undefined, type: string): number | null {
  const m = (metrics ?? []).find((x) => x.type === type);
  return m ? m.value : null;
}

/**
 * Engagement rate in percent. Uses Buffer's own `engagementRate` when reported;
 * otherwise (reactions + comments + reposts + shares) / impressions. Null when
 * neither can be computed honestly.
 */
export function engagementRate(metrics: MetricLike[] | null | undefined): number | null {
  const reported = metricValue(metrics, "engagementRate");
  if (reported !== null) return reported;
  const impressions = metricValue(metrics, "impressions");
  if (!impressions) return null;
  const interactions = ["reactions", "comments", "reposts", "shares"].reduce((sum, t) => sum + (metricValue(metrics, t) ?? 0), 0);
  return (interactions / impressions) * 100;
}

export interface PostFeatures {
  platform: Platform | null;
  isThread: boolean;
  hasMedia: boolean;
  /** Characters of the text sent (first post for threads). */
  length: number;
}

export interface ScoredPost {
  features: PostFeatures;
  engagementRate: number | null;
}

export interface PerformanceInsight {
  preference_key: string;
  preference_value: string;
  rationale: string;
  confidence: "low" | "medium";
  ratio: number;
  groupSizes: [number, number];
}

/** Minimum posts in EACH group before ORBIT will say anything. */
export const MIN_GROUP_SIZE = 3;
/** Minimum ratio between group averages worth mentioning. */
export const MIN_RATIO = 1.5;
export const LONG_POST_CHARS = 600;

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

interface Comparison {
  key: string;
  yes: (f: PostFeatures) => boolean;
  /** Restricts the comparison to posts where it makes sense. */
  applies?: (f: PostFeatures) => boolean;
  yesLabel: string;
  noLabel: string;
  preferYes: string;
  preferNo: string;
}

const COMPARISONS: Comparison[] = [
  {
    key: "performance_media",
    yes: (f) => f.hasMedia,
    yesLabel: "posts with images",
    noLabel: "text-only posts",
    preferYes: "Attach an image when it adds information; image posts have performed better for you.",
    preferNo: "Text-only posts have performed better for you; add images only when they carry information.",
  },
  {
    key: "performance_threads",
    yes: (f) => f.isThread,
    applies: (f) => f.platform === "x",
    yesLabel: "X threads",
    noLabel: "single X posts",
    preferYes: "On X, consider a thread when the idea needs room; your threads have performed better.",
    preferNo: "On X, prefer a single focused post; your single posts have performed better than threads.",
  },
  {
    key: "performance_length",
    yes: (f) => f.length >= LONG_POST_CHARS,
    applies: (f) => f.platform === "linkedin" || f.platform === "facebook",
    yesLabel: `longer posts (${LONG_POST_CHARS}+ characters)`,
    noLabel: `shorter posts (under ${LONG_POST_CHARS} characters)`,
    preferYes: "Longer, developed posts have performed better for you on LinkedIn/Facebook.",
    preferNo: "Shorter posts have performed better for you on LinkedIn/Facebook.",
  },
];

/** Compares engagement rates between simple, objective post features. */
export function performanceInsights(posts: ScoredPost[]): PerformanceInsight[] {
  const scored = posts.filter((p): p is ScoredPost & { engagementRate: number } => p.engagementRate !== null && Number.isFinite(p.engagementRate));
  const out: PerformanceInsight[] = [];
  for (const c of COMPARISONS) {
    const pool = scored.filter((p) => (c.applies ? c.applies(p.features) : true));
    const yes = pool.filter((p) => c.yes(p.features)).map((p) => p.engagementRate);
    const no = pool.filter((p) => !c.yes(p.features)).map((p) => p.engagementRate);
    if (yes.length < MIN_GROUP_SIZE || no.length < MIN_GROUP_SIZE) continue;
    const a = mean(yes);
    const b = mean(no);
    const high = Math.max(a, b);
    const low = Math.min(a, b);
    if (low <= 0) continue; // a ratio against zero would be meaningless
    const ratio = high / low;
    if (ratio < MIN_RATIO) continue;
    const yesWins = a > b;
    out.push({
      preference_key: c.key,
      preference_value: yesWins ? c.preferYes : c.preferNo,
      rationale: `Your ${yesWins ? c.yesLabel : c.noLabel} averaged a ${ratio.toFixed(1)}× higher engagement rate than your ${yesWins ? c.noLabel : c.yesLabel} (${high.toFixed(2)}% vs ${low.toFixed(2)}%, ${yesWins ? yes.length : no.length} vs ${yesWins ? no.length : yes.length} posts). Source: Buffer post metrics for posts ORBIT sent. A small sample can reflect topic or timing rather than format.`,
      confidence: Math.min(yes.length, no.length) >= 8 ? "medium" : "low",
      ratio,
      groupSizes: [yes.length, no.length],
    });
  }
  return out;
}

/** Cached metrics older than this are refreshed when the Performance panel opens. */
export const METRICS_REFRESH_MS = 12 * 60 * 60 * 1000;

export function isStale(lastFetchedAt: string | null, now: number = Date.now()): boolean {
  return !lastFetchedAt || now - new Date(lastFetchedAt).getTime() > METRICS_REFRESH_MS;
}
