-- Save and view opportunities (S-03 / FR-010, FR-011).
--
-- A saved row is a frozen snapshot, not a reference to a video: outlier_score
-- and channel_median drift between analysis runs as the channel median shifts
-- underneath them (context/changes/analyze-and-rank-opportunities/change.md,
-- Phase 4 pre-verification 4.5), so the number the user decided on would
-- otherwise silently change.

create table public.content_opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  video_id text not null,
  title text not null,
  channel_id text not null,
  channel_title text,
  published_at timestamptz not null,
  view_count bigint not null,
  outlier_score double precision not null,
  channel_median double precision not null,
  sample_size integer not null,
  justification text,
  status text not null default 'new',
  saved_at timestamptz not null default now(),
  constraint content_opportunities_status_check check (status in ('new', 'in_production', 'done')),
  constraint content_opportunities_outlier_score_check check (outlier_score > 0),
  constraint content_opportunities_channel_median_check check (channel_median > 0),
  constraint content_opportunities_view_count_check check (view_count >= 0),
  constraint content_opportunities_sample_size_check check (sample_size > 0),
  -- One saved row per video per user. Also serves as the user_id prefix index
  -- for the list query, so no separate index is needed.
  constraint content_opportunities_user_video_unique unique (user_id, video_id)
);

alter table public.content_opportunities enable row level security;

create policy "content_opportunities_select_own" on public.content_opportunities
  for select to authenticated
  using (auth.uid() = user_id);

create policy "content_opportunities_insert_own" on public.content_opportunities
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "content_opportunities_update_own" on public.content_opportunities
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "content_opportunities_delete_own" on public.content_opportunities
  for delete to authenticated
  using (auth.uid() = user_id);
