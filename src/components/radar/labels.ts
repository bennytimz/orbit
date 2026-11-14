import type { DiscoveryCategory } from "@/types/domain";

export const CATEGORY_LABELS: Record<DiscoveryCategory, string> = {
  breaking_development: "Breaking development",
  emerging_trend: "Emerging trend",
  industry_analysis: "Industry analysis",
  research_discovery: "Research discovery",
  competitive_intelligence: "Competitive intelligence",
  educational_opportunity: "Educational opportunity",
  opinion_opportunity: "Opinion opportunity",
  product_update: "Product / technology update",
  community_discussion: "Community discussion",
  evergreen_knowledge: "Evergreen knowledge",
};

export const BASIS_LABELS = {
  verified_in_source: "Stated in source",
  reported_claim: "Reported claim",
  interpretation: "AI interpretation",
} as const;
