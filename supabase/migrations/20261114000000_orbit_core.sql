-- ORBIT core schema
-- Every user-owned table carries user_id and has RLS restricted to auth.uid().
-- Child tables also carry user_id so policies stay simple and index-backed.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- BRAIN: identity, voice, knowledge, preferences
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text,
  profession text,
  industry text,
  organization text,
  bio text,
  target_audience text,
  expertise text[] not null default '{}',
  preferred_platforms text[] not null default '{}',
  content_objectives text[] not null default '{}',
  timezone text not null default 'UTC',
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_interests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic text not null check (char_length(topic) between 1 and 200),
  description text,
  priority smallint not null default 2 check (priority between 1 and 3),
  created_at timestamptz not null default now(),
  unique (user_id, topic)
);
create index on public.user_interests (user_id);

create table public.voice_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Primary voice',
  tone text,
  formality text,
  personality text,
  vocabulary text,
  sentence_length text,
  humor text,
  technical_depth text,
  writing_preferences text,
  words_to_avoid text[] not null default '{}',
  preferred_ctas text[] not null default '{}',
  sample_analysis jsonb,
  is_default boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.voice_profiles (user_id);
create unique index voice_profiles_one_default on public.voice_profiles (user_id) where is_default;

create table public.writing_samples (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  body text not null check (char_length(body) <= 20000),
  sample_type text not null default 'post',
  created_at timestamptz not null default now()
);
create index on public.writing_samples (user_id);

create table public.knowledge_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content text not null,
  category text not null default 'observation'
    check (category in ('expertise','observation','opinion','experience','project','fact','preference','topic')),
  source_type text not null default 'manual'
    check (source_type in ('manual','perspective','voice','onboarding','ai_suggestion')),
  source_reference text,
  confidence text not null default 'confirmed' check (confidence in ('confirmed','inferred')),
  approved_by_user boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.knowledge_entries (user_id, category);

create table public.user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  preference_key text not null,
  preference_value text not null,
  rationale text,
  source text not null default 'explicit' check (source in ('explicit','inferred_from_edits','inferred_from_feedback')),
  confidence text not null default 'medium' check (confidence in ('low','medium','high')),
  user_confirmed boolean not null default false,
  status text not null default 'suggested' check (status in ('suggested','accepted','rejected')),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index on public.user_preferences (user_id, status);

-- ---------------------------------------------------------------------------
-- RADAR / RESEARCH
-- ---------------------------------------------------------------------------
create table public.research_feeds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  title text,
  last_fetched_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (user_id, url)
);

create table public.research_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  title text,
  publisher text,
  published_at timestamptz,
  published_at_text text,          -- raw date string as reported by the provider (e.g. "2 days ago")
  retrieved_at timestamptz not null default now(),
  provider text not null check (provider in ('web_search','rss','url','manual')),
  excerpt text,                    -- passages actually retrieved from the source
  content_hash text,
  fetch_status text not null default 'not_fetched' check (fetch_status in ('not_fetched','fetched','failed','blocked')),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (user_id, url)
);
create index on public.research_sources (user_id);

create table public.discoveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  summary text not null,
  category text not null check (category in (
    'breaking_development','emerging_trend','industry_analysis','research_discovery',
    'competitive_intelligence','educational_opportunity','opinion_opportunity',
    'product_update','community_discussion','evergreen_knowledge')),
  topics text[] not null default '{}',
  entities text[] not null default '{}',
  key_findings jsonb not null default '[]',
  why_it_matters text,
  content_angles jsonb not null default '[]',
  relevance_score smallint check (relevance_score between 0 and 100),
  relevance_factors jsonb not null default '{}',
  impact_assessment text,
  confidence text check (confidence in ('high','medium','low')),
  event_date text,                 -- when the development occurred, if known
  query text,                      -- what produced this discovery
  provider text not null,
  status text not null default 'new' check (status in ('new','saved','reviewed','dismissed','in_progress','used')),
  discovered_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index on public.discoveries (user_id, discovered_at desc);
create index on public.discoveries (user_id, status);

create table public.discovery_sources (
  discovery_id uuid not null references public.discoveries(id) on delete cascade,
  research_source_id uuid not null references public.research_sources(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  relevance_note text,
  primary key (discovery_id, research_source_id)
);
create index on public.discovery_sources (user_id);

create table public.research_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  discovery_id uuid not null references public.discoveries(id) on delete cascade,
  title text not null,
  summary text not null,
  key_findings jsonb not null default '[]',
  claims jsonb not null default '[]',
  entities jsonb not null default '[]',
  important_dates jsonb not null default '[]',
  uncertainties jsonb not null default '[]',
  conflicts jsonb not null default '[]',
  implications jsonb not null default '[]',
  content_opportunities jsonb not null default '[]',
  model text,
  created_at timestamptz not null default now()
);
create index on public.research_reports (user_id, discovery_id, created_at desc);

create table public.research_report_sources (
  research_report_id uuid not null references public.research_reports(id) on delete cascade,
  research_source_id uuid not null references public.research_sources(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (research_report_id, research_source_id)
);

-- ---------------------------------------------------------------------------
-- CAMPAIGNS (declared before content so content can reference it)
-- ---------------------------------------------------------------------------
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  objective text not null default 'thought_leadership' check (objective in (
    'product_launch','brand_awareness','educational','thought_leadership','event_promotion',
    'product_update','customer_acquisition','community_engagement','promotional')),
  target_audience text,
  status text not null default 'planning' check (status in ('planning','active','paused','completed','archived')),
  phases jsonb not null default '[]',   -- [{key, name, description}] user-customizable
  research_discovery_ids uuid[] not null default '{}',
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.campaigns (user_id, status);

-- ---------------------------------------------------------------------------
-- PERSPECTIVE
-- ---------------------------------------------------------------------------
create table public.perspectives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  discovery_id uuid references public.discoveries(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  question text,
  content text not null check (char_length(content) <= 10000),
  input_type text not null default 'text' check (input_type in ('text','voice')),
  transcript text,
  created_at timestamptz not null default now()
);
create index on public.perspectives (user_id, discovery_id);

-- ---------------------------------------------------------------------------
-- STUDIO
-- ---------------------------------------------------------------------------
create table public.content_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null default '',
  thread_parts jsonb,                 -- for X threads: ["part 1", "part 2"]
  content_type text not null default 'social_post',
  platform text not null check (platform in ('linkedin','x','threads','facebook','instagram','bluesky','mastodon','newsletter','generic')),
  status text not null default 'draft' check (status in ('idea','draft','in_review','approved','scheduled','published','rejected','archived')),
  objective text,
  voice_profile_id uuid references public.voice_profiles(id) on delete set null,
  discovery_id uuid references public.discoveries(id) on delete set null,
  research_report_id uuid references public.research_reports(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  generation_group uuid,              -- variants generated together share this
  ai_generated boolean not null default false,
  original_ai_body text,              -- preserved for the Evolution feedback loop
  guardian_status text not null default 'unchecked' check (guardian_status in ('unchecked','pass','warnings','blocking','stale')),
  visual_brief text,
  generation_notes jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.content_assets (user_id, status, updated_at desc);
create index on public.content_assets (user_id, campaign_id);
create index on public.content_assets (user_id, discovery_id);

create table public.content_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content_asset_id uuid not null references public.content_assets(id) on delete cascade,
  version_number integer not null,
  body text not null,
  thread_parts jsonb,
  change_type text not null check (change_type in ('ai_generated','user_edit','autosave','before_ai_transform','ai_transform','restore')),
  note text,
  created_at timestamptz not null default now(),
  unique (content_asset_id, version_number)
);
create index on public.content_versions (user_id, content_asset_id);

create table public.content_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content_asset_id uuid not null references public.content_assets(id) on delete cascade,
  research_source_id uuid not null references public.research_sources(id) on delete cascade,
  claim_text text,
  support_status text check (support_status in ('supported','partially_supported','unsupported','conflicting','unable_to_verify')),
  explanation text,
  created_at timestamptz not null default now()
);
create index on public.content_sources (user_id, content_asset_id);

create table public.campaign_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  content_asset_id uuid not null references public.content_assets(id) on delete cascade,
  phase text,
  sequence_number integer not null default 0,
  scheduled_at timestamptz,
  channel_ids text[] not null default '{}',  -- Buffer channel ids selected for this asset
  status text not null default 'planned' check (status in ('planned','approved','sent_to_buffer','partially_sent','failed')),
  created_at timestamptz not null default now(),
  unique (campaign_id, content_asset_id)
);
create index on public.campaign_assets (user_id, campaign_id);

-- ---------------------------------------------------------------------------
-- GUARDIAN
-- ---------------------------------------------------------------------------
create table public.guardian_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content_asset_id uuid not null references public.content_assets(id) on delete cascade,
  overall_status text not null check (overall_status in ('pass','warnings','blocking')),
  summary text,
  body_checked text not null,
  ai_checked boolean not null default false,
  ai_error text,
  checked_at timestamptz not null default now()
);
create index on public.guardian_reports (user_id, content_asset_id, checked_at desc);

create table public.guardian_issues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  guardian_report_id uuid not null references public.guardian_reports(id) on delete cascade,
  content_asset_id uuid not null references public.content_assets(id) on delete cascade,
  issue_type text not null,
  severity text not null check (severity in ('info','warning','blocking')),
  title text not null,
  explanation text not null,
  evidence jsonb not null default '[]',
  excerpt text,
  verification_status text check (verification_status in ('supported','partially_supported','unsupported','conflicting','unable_to_verify')),
  recommended_action text,
  check_source text not null check (check_source in ('rule','ai')),
  review_status text not null default 'open' check (review_status in ('open','resolved','dismissed','superseded')),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.guardian_issues (user_id, review_status);
create index on public.guardian_issues (guardian_report_id);

-- ---------------------------------------------------------------------------
-- PUBLISHER (Buffer)
-- ---------------------------------------------------------------------------
create table public.buffer_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  auth_type text not null default 'oauth' check (auth_type in ('oauth','api_key')),
  account_id text,
  account_email text,
  organization_id text,
  organization_name text,
  organizations jsonb not null default '[]',
  scopes text[] not null default '{}',
  token_expires_at timestamptz,
  status text not null default 'active' check (status in ('active','needs_reauth','disconnected')),
  last_error text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Encrypted credentials live apart from connection metadata. RLS is enabled with
-- NO policies, so only the server's service-role client can read or write them.
create table public.buffer_credentials (
  connection_id uuid primary key references public.buffer_connections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  encrypted_access_token text not null,
  encrypted_refresh_token text,
  -- Buffer refresh tokens are single-use and reuse revokes the grant, so only one
  -- request may refresh at a time (claimed via a conditional UPDATE).
  refresh_lock_until timestamptz,
  updated_at timestamptz not null default now()
);

create table public.buffer_channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  buffer_connection_id uuid not null references public.buffer_connections(id) on delete cascade,
  channel_id text not null,
  organization_id text not null,
  name text not null,
  display_name text,
  service text not null,
  avatar text,
  is_disconnected boolean not null default false,
  is_locked boolean not null default false,
  is_queue_paused boolean not null default false,
  selected boolean not null default true,
  metadata jsonb not null default '{}',
  connected_at timestamptz not null default now(),
  unique (user_id, channel_id)
);

create table public.buffer_publications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content_asset_id uuid references public.content_assets(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  campaign_asset_id uuid references public.campaign_assets(id) on delete set null,
  idempotency_key text not null,
  channel_id text not null,
  channel_name text,
  channel_service text,
  mode text not null check (mode in ('draft','addToQueue','customScheduled','shareNext','shareNow')),
  text_sent text not null,
  buffer_post_id text,
  buffer_status text,
  operation_status text not null default 'pending'
    check (operation_status in ('pending','succeeded','failed','unknown')),
  scheduled_at timestamptz,
  due_at timestamptz,
  error_message text,
  error_type text,
  attempted_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create index on public.buffer_publications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- EVOLUTION + activity
-- ---------------------------------------------------------------------------
create table public.user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content_asset_id uuid references public.content_assets(id) on delete set null,
  feedback_type text not null check (feedback_type in ('edit','approve','reject','explicit')),
  original_content text,
  edited_content text,
  feedback_text text,
  analyzed boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.user_feedback (user_id, analyzed);

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  resource_type text,
  resource_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.activity_logs (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger trg_profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger trg_voice_updated before update on public.voice_profiles for each row execute function public.set_updated_at();
create trigger trg_knowledge_updated before update on public.knowledge_entries for each row execute function public.set_updated_at();
create trigger trg_prefs_updated before update on public.user_preferences for each row execute function public.set_updated_at();
create trigger trg_campaigns_updated before update on public.campaigns for each row execute function public.set_updated_at();
create trigger trg_content_updated before update on public.content_assets for each row execute function public.set_updated_at();
create trigger trg_buffer_conn_updated before update on public.buffer_connections for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','user_interests','voice_profiles','writing_samples','knowledge_entries','user_preferences',
    'research_feeds','research_sources','discoveries','discovery_sources','research_reports','research_report_sources',
    'campaigns','perspectives','content_assets','content_versions','content_sources','campaign_assets',
    'guardian_reports','guardian_issues','buffer_connections','buffer_channels','buffer_publications',
    'user_feedback','activity_logs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t || '_owner_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t || '_owner_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t || '_owner_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t || '_owner_delete', t);
  end loop;
end $$;

-- Credentials: RLS on, no policies, and no grants => unreachable from anon/authenticated.
alter table public.buffer_credentials enable row level security;
revoke all on public.buffer_credentials from anon, authenticated;

-- The publication ledger is written by the server only, after an explicit approval
-- flow; users can read it but cannot forge or alter outcomes from the browser.
drop policy buffer_publications_owner_insert on public.buffer_publications;
drop policy buffer_publications_owner_update on public.buffer_publications;
drop policy buffer_publications_owner_delete on public.buffer_publications;

-- Buffer connection metadata is server-managed too (users may still delete = disconnect).
drop policy buffer_connections_owner_insert on public.buffer_connections;
drop policy buffer_connections_owner_update on public.buffer_connections;
drop policy buffer_channels_owner_insert on public.buffer_channels;

-- ---------------------------------------------------------------------------
-- New-user bootstrap: create a profile and a default voice profile
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, full_name)
  values (new.id, nullif(new.raw_user_meta_data->>'full_name', ''));
  insert into public.voice_profiles (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
