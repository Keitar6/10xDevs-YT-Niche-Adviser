-- 01-channel-profiles.test.sql — per-verb, per-role isolation on channel_profiles.
--
-- User A owns a profile. User B and `anon` must not be able to read it, change
-- it, delete it, or plant a row under A's name — and after every one of those
-- denied attempts, A's row must still be exactly what A left there.
--
-- That last clause is the point. A stranger's SELECT returning nothing is not
-- proof of isolation on its own: a denied UPDATE reports `UPDATE 0` and returns
-- silently, so "zero rows affected" and "the row was quietly rewritten" are
-- indistinguishable without reading the row back as its owner. Every denied
-- write below is therefore paired with an intactness check performed as A.
--
-- Denied INSERTs behave differently again: they raise 42501 and abort the
-- transaction, which would take every later assertion in this file with them.
-- They go through `throws_ok`, whose internal exception handler acts as a
-- savepoint. See ./README.md.

begin;

create extension if not exists pgtap;

select plan(14);

-- ---------------------------------------------------------------------------
-- Fixtures — created as `postgres`, before the first `set local role`
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  (
    'aaaaaaaa-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'user-a@isolation.test',
    '',
    now(),
    now()
  ),
  (
    'bbbbbbbb-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'user-b@isolation.test',
    '',
    now(),
    now()
  );

-- `competitors` carries a CHECK requiring a JSON array of 3 to 5 entries, so a
-- shorter fixture would fail this file for the wrong reason entirely.
insert into public.channel_profiles (user_id, niche, sub_niche, competitors)
values (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'woodworking',
  'hand tools',
  '[{"id": "UC-a1"}, {"id": "UC-a2"}, {"id": "UC-a3"}]'::jsonb
);

-- ---------------------------------------------------------------------------
-- The owner can see their own row
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

select results_eq(
  $$select niche from public.channel_profiles$$,
  $$values ('woodworking'::text)$$,
  'user A sees exactly their own profile'
);

-- ---------------------------------------------------------------------------
-- User B: all four verbs denied
-- ---------------------------------------------------------------------------

set local request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';

select is_empty(
  $$select id from public.channel_profiles$$,
  'user B sees no profile at all — user A''s row is invisible'
);

with denied as (
  update public.channel_profiles
  set niche = 'hijacked-by-b'
  where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'
  returning 1
)
select is(
  (select count(*)::int from denied),
  0,
  'user B''s UPDATE of user A''s profile affects zero rows'
);

with denied as (
  delete from public.channel_profiles
  where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'
  returning 1
)
select is(
  (select count(*)::int from denied),
  0,
  'user B''s DELETE of user A''s profile affects zero rows'
);

select throws_ok(
  $$insert into public.channel_profiles (user_id, niche, competitors)
    values (
      'aaaaaaaa-0000-0000-0000-000000000001',
      'planted-by-b',
      '[{"id": "UC-b1"}, {"id": "UC-b2"}, {"id": "UC-b3"}]'::jsonb
    )$$,
  '42501',
  null::text,
  'user B cannot INSERT a profile owned by user A'
);

-- Read back as the owner: zero rows affected is only half the proof.
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

select results_eq(
  $$select niche, sub_niche from public.channel_profiles$$,
  $$values ('woodworking'::text, 'hand tools'::text)$$,
  'after user B''s denied writes, user A''s row is unchanged'
);

select is(
  (select count(*)::int from public.channel_profiles),
  1,
  'after user B''s denied writes, user A still has exactly one profile'
);

-- ---------------------------------------------------------------------------
-- anon: all four verbs denied
-- ---------------------------------------------------------------------------
--
-- Note what this is really testing. There is no REVOKE anywhere in this
-- project, and Supabase's implicit Data-API grants give `anon` the table
-- privileges. `anon` gets nothing purely because no policy matches it — an
-- absence, not a statement. A single careless `for select using (true)` (the
-- shape a future "public profile" feature reaches for) reopens all of this with
-- no second layer underneath. That is why these four assertions exist.

set local role anon;
set local request.jwt.claim.sub = '';

select is_empty(
  $$select id from public.channel_profiles$$,
  'an anonymous caller sees no profiles'
);

with denied as (
  update public.channel_profiles
  set niche = 'hijacked-by-anon'
  where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'
  returning 1
)
select is(
  (select count(*)::int from denied),
  0,
  'an anonymous UPDATE of user A''s profile affects zero rows'
);

with denied as (
  delete from public.channel_profiles
  where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'
  returning 1
)
select is(
  (select count(*)::int from denied),
  0,
  'an anonymous DELETE of user A''s profile affects zero rows'
);

select throws_ok(
  $$insert into public.channel_profiles (user_id, niche, competitors)
    values (
      'aaaaaaaa-0000-0000-0000-000000000001',
      'planted-by-anon',
      '[{"id": "UC-x1"}, {"id": "UC-x2"}, {"id": "UC-x3"}]'::jsonb
    )$$,
  '42501',
  null::text,
  'an anonymous caller cannot INSERT a profile'
);

-- ---------------------------------------------------------------------------
-- Row intactness, and the DB-enforced one-profile-per-user rule
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

select results_eq(
  $$select niche, sub_niche, avatar_path, competitors
    from public.channel_profiles$$,
  $$values (
      'woodworking'::text,
      'hand tools'::text,
      null::text,
      '[{"id": "UC-a1"}, {"id": "UC-a2"}, {"id": "UC-a3"}]'::jsonb
    )$$,
  'after every denied write from every other role, user A''s row is byte-for-byte what A left'
);

select is(
  (select count(*)::int from public.channel_profiles),
  1,
  'exactly one profile row survives the whole file'
);

-- `user_id … unique` means the one-profile-per-user rule is enforced by the
-- database, not merely by the route. Worth pinning: a migration that dropped
-- the constraint would leave every application-level check still passing.
select throws_ok(
  $$insert into public.channel_profiles (user_id, niche, competitors)
    values (
      'aaaaaaaa-0000-0000-0000-000000000001',
      'second-profile',
      '[{"id": "UC-a4"}, {"id": "UC-a5"}, {"id": "UC-a6"}]'::jsonb
    )$$,
  '23505',
  null::text,
  'a second profile for the same user is rejected by the unique constraint'
);

select * from finish();

rollback;
