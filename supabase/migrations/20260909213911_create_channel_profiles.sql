create table public.channel_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique default auth.uid() references auth.users (id) on delete cascade,
  niche text not null,
  sub_niche text,
  competitor_channel_ids text[] not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.channel_profiles enable row level security;

create policy "channel_profiles_select_own" on public.channel_profiles
  for select to authenticated
  using (auth.uid() = user_id);

create policy "channel_profiles_insert_own" on public.channel_profiles
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "channel_profiles_update_own" on public.channel_profiles
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "channel_profiles_delete_own" on public.channel_profiles
  for delete to authenticated
  using (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger channel_profiles_set_updated_at
  before update on public.channel_profiles
  for each row
  execute function public.set_updated_at();
