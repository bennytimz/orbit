-- ORBIT post-submission additions (2026-11-19).
-- ADDITIVE ONLY: new tables, new nullable columns, new policies, one new private
-- storage bucket. Nothing existing is dropped, renamed or altered in type.
-- Safe to re-run: every statement is guarded with IF NOT EXISTS / ON CONFLICT.

-- ---------------------------------------------------------------------------
-- A. Media attached to Studio drafts
-- ---------------------------------------------------------------------------
create table if not exists public.content_media (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content_asset_id uuid not null references public.content_assets(id) on delete cascade,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/gif')),
  size_bytes integer not null check (size_bytes > 0),
  width integer,
  height integer,
  alt_text text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists content_media_asset_idx on public.content_media (content_asset_id, position);
create index if not exists content_media_user_idx on public.content_media (user_id);

alter table public.content_media enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='content_media' and policyname='content_media_owner_select') then
    create policy content_media_owner_select on public.content_media for select to authenticated using ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='content_media' and policyname='content_media_owner_insert') then
    create policy content_media_owner_insert on public.content_media for insert to authenticated with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='content_media' and policyname='content_media_owner_update') then
    create policy content_media_owner_update on public.content_media for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='content_media' and policyname='content_media_owner_delete') then
    create policy content_media_owner_delete on public.content_media for delete to authenticated using ((select auth.uid()) = user_id);
  end if;
end $$;

-- Private bucket. No storage.objects policies are created, so only trusted
-- server code (service role) can read or write objects. Server code checks
-- ownership on every operation; Buffer receives long-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('orbit-media', 'orbit-media', false, 4194304, array['image/jpeg','image/png','image/gif'])
on conflict (id) do nothing;

-- What ORBIT actually attached to each Buffer post, and Content Item grouping.
alter table public.buffer_publications add column if not exists media_sent jsonb;
alter table public.buffer_publications add column if not exists buffer_content_item_id text;

-- ---------------------------------------------------------------------------
-- B. Cached post metrics for posts ORBIT sent (read from Buffer, never invented)
-- ---------------------------------------------------------------------------
create table if not exists public.buffer_post_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  buffer_post_id text not null,
  publication_id uuid references public.buffer_publications(id) on delete set null,
  content_asset_id uuid references public.content_assets(id) on delete set null,
  channel_id text,
  channel_service text,
  buffer_status text,
  sent_at timestamptz,
  external_link text,
  metrics jsonb not null default '[]',
  metrics_updated_at timestamptz,
  fetched_at timestamptz not null default now(),
  unique (user_id, buffer_post_id)
);
create index if not exists buffer_post_metrics_user_idx on public.buffer_post_metrics (user_id, fetched_at desc);

alter table public.buffer_post_metrics enable row level security;
-- Owners may read and delete their cached metrics. Writes happen only in
-- trusted server code (service role), like buffer_publications.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='buffer_post_metrics' and policyname='buffer_post_metrics_owner_select') then
    create policy buffer_post_metrics_owner_select on public.buffer_post_metrics for select to authenticated using ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='buffer_post_metrics' and policyname='buffer_post_metrics_owner_delete') then
    create policy buffer_post_metrics_owner_delete on public.buffer_post_metrics for delete to authenticated using ((select auth.uid()) = user_id);
  end if;
end $$;
