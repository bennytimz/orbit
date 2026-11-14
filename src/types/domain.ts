/**
 * Row types for ORBIT tables (mirrors supabase/migrations). Keep in sync with
 * the schema; JSON columns are typed with the shapes ORBIT writes into them.
 */

export type Platform = "linkedin" | "x" | "threads" | "facebook" | "instagram" | "bluesky" | "mastodon" | "newsletter" | "generic";

export type DiscoveryCategory =
  | "breaking_development"
  | "emerging_trend"
  | "industry_analysis"
  | "research_discovery"
  | "competitive_intelligence"
  | "educational_opportunity"
  | "opinion_opportunity"
  | "product_update"
  | "community_discussion"
  | "evergreen_knowledge";

export type SupportStatus = "supported" | "partially_supported" | "unsupported" | "conflicting" | "unable_to_verify";

export interface Profile {
  id: string;
  user_id: string;
  full_name: string | null;
  profession: string | null;
  industry: string | null;
  organization: string | null;
  bio: string | null;
  target_audience: string | null;
  expertise: string[];
  preferred_platforms: string[];
  content_objectives: string[];
  timezone: string;
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserInterest {
  id: string;
  user_id: string;
  topic: string;
  description: string | null;
  priority: number;
  created_at: string;
}

export interface VoiceProfile {
  id: string;
  user_id: string;
  name: string;
  tone: string | null;
  formality: string | null;
  personality: string | null;
  vocabulary: string | null;
  sentence_length: string | null;
  humor: string | null;
  technical_depth: string | null;
  writing_preferences: string | null;
  words_to_avoid: string[];
  preferred_ctas: string[];
  sample_analysis: VoiceSampleAnalysis | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface VoiceSampleAnalysis {
  analyzed_at: string;
  sample_count: number;
  observations: string[];
  caveats: string[];
}

export interface WritingSample {
  id: string;
  user_id: string;
  title: string | null;
  body: string;
  sample_type: string;
  created_at: string;
}

export type KnowledgeCategory = "expertise" | "observation" | "opinion" | "experience" | "project" | "fact" | "preference" | "topic";

export interface KnowledgeEntry {
  id: string;
  user_id: string;
  title: string;
  content: string;
  category: KnowledgeCategory;
  source_type: "manual" | "perspective" | "voice" | "onboarding" | "ai_suggestion";
  source_reference: string | null;
  confidence: "confirmed" | "inferred";
  approved_by_user: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserPreference {
  id: string;
  user_id: string;
  preference_key: string;
  preference_value: string;
  rationale: string | null;
  source: "explicit" | "inferred_from_edits" | "inferred_from_feedback";
  confidence: "low" | "medium" | "high";
  user_confirmed: boolean;
  status: "suggested" | "accepted" | "rejected";
  created_at: string;
  updated_at: string;
}

export interface ResearchFeed {
  id: string;
  user_id: string;
  url: string;
  title: string | null;
  last_fetched_at: string | null;
  last_error: string | null;
  created_at: string;
}

export interface ResearchSource {
  id: string;
  user_id: string;
  url: string;
  title: string | null;
  publisher: string | null;
  published_at: string | null;
  published_at_text: string | null;
  retrieved_at: string;
  provider: "web_search" | "rss" | "url" | "manual";
  excerpt: string | null;
  content_hash: string | null;
  fetch_status: "not_fetched" | "fetched" | "failed" | "blocked";
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface RelevanceFactor {
  score: number; // 0-100
  reason: string;
}

export type RelevanceFactorKey =
  | "interest_match"
  | "expertise_match"
  | "audience_relevance"
  | "recency"
  | "potential_impact"
  | "discussion_potential"
  | "novelty"
  | "source_credibility";

export type RelevanceFactors = Partial<Record<RelevanceFactorKey, RelevanceFactor>>;

export interface KeyFinding {
  text: string;
  source_ids: string[];
  basis: "verified_in_source" | "reported_claim" | "interpretation";
}

export interface ContentAngle {
  angle: string;
  format: string;
  rationale: string;
}

export interface Discovery {
  id: string;
  user_id: string;
  title: string;
  summary: string;
  category: DiscoveryCategory;
  topics: string[];
  entities: string[];
  key_findings: KeyFinding[];
  why_it_matters: string | null;
  content_angles: ContentAngle[];
  relevance_score: number | null;
  relevance_factors: RelevanceFactors;
  impact_assessment: string | null;
  confidence: "high" | "medium" | "low" | null;
  event_date: string | null;
  query: string | null;
  provider: string;
  status: "new" | "saved" | "reviewed" | "dismissed" | "in_progress" | "used";
  discovered_at: string;
  created_at: string;
}

export interface ReportClaim {
  id: string;
  text: string;
  source_ids: string[];
  supporting_passage: string | null;
  passage_verified: boolean; // passage literally found in retrieved source text
  basis: "verified_in_source" | "reported_claim" | "interpretation";
  confidence: "high" | "medium" | "low";
}

export interface ReportDate {
  date: string; // as stated, or "unknown"
  description: string;
  date_type: "event" | "publication" | "announcement" | "effective" | "deadline" | "other";
  source_ids: string[];
}

export interface ReportEntity {
  name: string;
  type: string;
  role: string;
}

export interface ReportConflict {
  description: string;
  source_ids: string[];
}

export interface ResearchReport {
  id: string;
  user_id: string;
  discovery_id: string;
  title: string;
  summary: string;
  key_findings: KeyFinding[];
  claims: ReportClaim[];
  entities: ReportEntity[];
  important_dates: ReportDate[];
  uncertainties: string[];
  conflicts: ReportConflict[];
  implications: string[];
  content_opportunities: ContentAngle[];
  model: string | null;
  created_at: string;
}

export interface Perspective {
  id: string;
  user_id: string;
  discovery_id: string | null;
  campaign_id: string | null;
  question: string | null;
  content: string;
  input_type: "text" | "voice";
  transcript: string | null;
  created_at: string;
}

export type ContentStatus = "idea" | "draft" | "in_review" | "approved" | "scheduled" | "published" | "rejected" | "archived";
export type GuardianStatus = "unchecked" | "pass" | "warnings" | "blocking" | "stale";

export interface GenerationNotes {
  perspective_used: string[];
  source_ids: string[];
  claims: { text: string; source_ids: string[] }[];
  notes: string | null;
}

export interface ContentAsset {
  id: string;
  user_id: string;
  title: string;
  body: string;
  thread_parts: string[] | null;
  content_type: string;
  platform: Platform;
  status: ContentStatus;
  objective: string | null;
  voice_profile_id: string | null;
  discovery_id: string | null;
  research_report_id: string | null;
  campaign_id: string | null;
  generation_group: string | null;
  ai_generated: boolean;
  original_ai_body: string | null;
  guardian_status: GuardianStatus;
  visual_brief: string | null;
  generation_notes: GenerationNotes | null;
  created_at: string;
  updated_at: string;
}

export interface ContentVersion {
  id: string;
  user_id: string;
  content_asset_id: string;
  version_number: number;
  body: string;
  thread_parts: string[] | null;
  change_type: "ai_generated" | "user_edit" | "autosave" | "before_ai_transform" | "ai_transform" | "restore";
  note: string | null;
  created_at: string;
}

export interface ContentSource {
  id: string;
  user_id: string;
  content_asset_id: string;
  research_source_id: string;
  claim_text: string | null;
  support_status: SupportStatus | null;
  explanation: string | null;
  created_at: string;
}

export type CampaignObjective =
  | "product_launch"
  | "brand_awareness"
  | "educational"
  | "thought_leadership"
  | "event_promotion"
  | "product_update"
  | "customer_acquisition"
  | "community_engagement"
  | "promotional";

export interface CampaignPhase {
  key: string;
  name: string;
  description: string;
}

export interface Campaign {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  objective: CampaignObjective;
  target_audience: string | null;
  status: "planning" | "active" | "paused" | "completed" | "archived";
  phases: CampaignPhase[];
  research_discovery_ids: string[];
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignAsset {
  id: string;
  user_id: string;
  campaign_id: string;
  content_asset_id: string;
  phase: string | null;
  sequence_number: number;
  scheduled_at: string | null;
  channel_ids: string[];
  status: "planned" | "approved" | "sent_to_buffer" | "partially_sent" | "failed";
  created_at: string;
}

export interface GuardianEvidence {
  source_id?: string;
  source_title?: string;
  source_url?: string;
  passage?: string;
  note?: string;
}

export interface GuardianReport {
  id: string;
  user_id: string;
  content_asset_id: string;
  overall_status: "pass" | "warnings" | "blocking";
  summary: string | null;
  body_checked: string;
  ai_checked: boolean;
  ai_error: string | null;
  checked_at: string;
}

export interface GuardianIssue {
  id: string;
  user_id: string;
  guardian_report_id: string;
  content_asset_id: string;
  issue_type: string;
  severity: "info" | "warning" | "blocking";
  title: string;
  explanation: string;
  evidence: GuardianEvidence[];
  excerpt: string | null;
  verification_status: SupportStatus | null;
  recommended_action: string | null;
  check_source: "rule" | "ai";
  review_status: "open" | "resolved" | "dismissed" | "superseded";
  resolved_at: string | null;
  created_at: string;
}

export interface BufferOrganizationSummary {
  id: string;
  name: string;
}

export interface BufferConnection {
  id: string;
  user_id: string;
  auth_type: "oauth" | "api_key";
  account_id: string | null;
  account_email: string | null;
  organization_id: string | null;
  organization_name: string | null;
  organizations: BufferOrganizationSummary[];
  scopes: string[];
  token_expires_at: string | null;
  status: "active" | "needs_reauth" | "disconnected";
  last_error: string | null;
  connected_at: string;
  updated_at: string;
}

export interface BufferChannelRow {
  id: string;
  user_id: string;
  buffer_connection_id: string;
  channel_id: string;
  organization_id: string;
  name: string;
  display_name: string | null;
  service: string;
  avatar: string | null;
  is_disconnected: boolean;
  is_locked: boolean;
  is_queue_paused: boolean;
  selected: boolean;
  metadata: Record<string, unknown>;
  connected_at: string;
}

export type PublishMode = "draft" | "addToQueue" | "customScheduled" | "shareNext" | "shareNow";

export interface BufferPublication {
  id: string;
  user_id: string;
  content_asset_id: string | null;
  campaign_id: string | null;
  campaign_asset_id: string | null;
  idempotency_key: string;
  channel_id: string;
  channel_name: string | null;
  channel_service: string | null;
  mode: PublishMode;
  text_sent: string;
  buffer_post_id: string | null;
  buffer_status: string | null;
  operation_status: "pending" | "succeeded" | "failed" | "unknown";
  scheduled_at: string | null;
  due_at: string | null;
  error_message: string | null;
  error_type: string | null;
  attempted_at: string;
  completed_at: string | null;
  created_at: string;
}

export interface UserFeedback {
  id: string;
  user_id: string;
  content_asset_id: string | null;
  feedback_type: "edit" | "approve" | "reject" | "explicit";
  original_content: string | null;
  edited_content: string | null;
  feedback_text: string | null;
  analyzed: boolean;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  user_id: string;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}
