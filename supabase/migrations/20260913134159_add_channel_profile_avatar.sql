-- Channel profile avatar (S-05 / FR-015).
--
-- Two halves: a nullable pointer on the profile, and a private bucket whose
-- objects are reachable only by the user whose id names their top-level folder.
--
-- The column is `avatar_path`, not `avatar_url`, even though FR-015 and the
-- roadmap say "avatar_url". The bucket is private, so it is read through
-- `createSignedUrl`, which expires — a persisted URL would rot in the row.
-- What is durable is the object path; the URL is minted per render.

alter table public.channel_profiles
  add column avatar_path text;

-- The bucket is declared here rather than in `config.toml` so that one
-- definition covers both the local stack and the hosted project. `config.toml`
-- buckets are a local-only convenience and would have to be recreated by hand
-- after `supabase db push`.
--
-- The two limits are the outermost guard: there is no server-side resizing
-- available (Supabase transforms are Pro-only, and the free-tier 10ms CPU cap
-- plus sharp's workerd incompatibility rule out doing it in the Worker), so
-- anything the client sends is stored as-is. Size and type are therefore
-- enforced by storage itself, not only by application code.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  false,
  2097152, -- 2 MiB
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

-- Four granular per-operation policies rather than one `for all`, matching the
-- shape established for `channel_profiles` in 20260909213911.
--
-- `storage.foldername(name)` splits the object key on '/', so `[1]` is the
-- top-level folder. Writing objects as `<user_id>/<uuid>.<ext>` therefore makes
-- ownership a property of the path, checked by Postgres rather than by the
-- route. `(select auth.uid())` is wrapped in a subselect so the planner
-- evaluates it once per statement instead of once per row.

create policy "avatars_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and (select auth.uid()::text) = (storage.foldername(name))[1]
  );

create policy "avatars_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (select auth.uid()::text) = (storage.foldername(name))[1]
  );

create policy "avatars_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (select auth.uid()::text) = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'avatars'
    and (select auth.uid()::text) = (storage.foldername(name))[1]
  );

create policy "avatars_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (select auth.uid()::text) = (storage.foldername(name))[1]
  );
