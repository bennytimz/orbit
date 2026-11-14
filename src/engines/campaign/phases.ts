import type { CampaignObjective, CampaignPhase } from "@/types/domain";

/** Starting phase templates. Every campaign's phases are editable. */
export const DEFAULT_PHASES: Record<CampaignObjective, CampaignPhase[]> = {
  product_launch: [
    { key: "awareness", name: "Awareness", description: "Introduce the problem and generate curiosity." },
    { key: "education", name: "Education", description: "Explain the solution, features and misconceptions." },
    { key: "launch", name: "Launch", description: "Official announcement, demonstration, benefits and use cases." },
    { key: "distribution", name: "Distribution", description: "Supporting stories, FAQs and additional use cases." },
    { key: "sustain", name: "Sustained attention", description: "Updates, lessons and new developments." },
  ],
  thought_leadership: [
    { key: "insight", name: "Insight", description: "Share the development and your perspective on it." },
    { key: "depth", name: "Depth", description: "Analysis, implications and evidence." },
    { key: "conversation", name: "Conversation", description: "Questions and follow-ups that invite discussion." },
  ],
  educational: [
    { key: "foundations", name: "Foundations", description: "Core concepts and why they matter." },
    { key: "practice", name: "Practice", description: "How-tos, examples and common mistakes." },
    { key: "recap", name: "Recap", description: "Summary and next steps." },
  ],
  brand_awareness: [
    { key: "introduce", name: "Introduce", description: "Who you are and what you stand for." },
    { key: "proof", name: "Proof", description: "Work, perspectives and evidence." },
    { key: "engage", name: "Engage", description: "Community and conversation." },
  ],
  event_promotion: [
    { key: "announce", name: "Announce", description: "Event details and why to attend." },
    { key: "build", name: "Build-up", description: "Speakers, agenda and reminders." },
    { key: "live", name: "Live", description: "During the event." },
    { key: "follow_up", name: "Follow-up", description: "Takeaways and recordings." },
  ],
  product_update: [
    { key: "announce", name: "Announce", description: "What changed and why." },
    { key: "explain", name: "Explain", description: "How to use it." },
    { key: "feedback", name: "Feedback", description: "Invite feedback and share early results." },
  ],
  customer_acquisition: [
    { key: "problem", name: "Problem", description: "Name the pain point." },
    { key: "solution", name: "Solution", description: "Show how it's solved." },
    { key: "offer", name: "Offer", description: "Clear call to action." },
  ],
  community_engagement: [
    { key: "prompt", name: "Prompts", description: "Questions and discussion starters." },
    { key: "spotlight", name: "Spotlight", description: "Highlight community voices." },
    { key: "recap", name: "Recap", description: "Summarize what you learned." },
  ],
  promotional: [
    { key: "tease", name: "Tease", description: "Build anticipation." },
    { key: "promote", name: "Promote", description: "The offer and its details." },
    { key: "last_call", name: "Last call", description: "Final reminders before it ends." },
  ],
};

export const OBJECTIVE_LABELS: Record<CampaignObjective, string> = {
  product_launch: "Product launch",
  brand_awareness: "Brand awareness",
  educational: "Educational",
  thought_leadership: "Thought leadership",
  event_promotion: "Event promotion",
  product_update: "Product update",
  customer_acquisition: "Customer acquisition",
  community_engagement: "Community engagement",
  promotional: "Promotional",
};
