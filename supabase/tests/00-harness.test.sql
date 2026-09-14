-- 00-harness.test.sql — the oracle guard.
--
-- This file asserts nothing about isolation. Its whole job is to make the
-- isolation assertions in 01…04 *capable of failing*.
--
-- The failure mode it exists to rule out: if `auth.uid()` returns NULL for both
-- impersonated users, then every "the stranger sees nothing" assertion in this
-- suite passes vacuously — not because the policies work, but because nobody is
-- anybody. A green suite would then mean exactly nothing. So before any other
-- file runs, prove that impersonation resolves to two *distinct, non-null*
-- identities, that `anon` resolves to none, and that row-level security is
-- actually switched on for all three surfaces the suite covers.
--
-- The third of those is asserted rather than assumed on purpose:
-- `storage.objects` is RLS-enabled by the Supabase platform, not by any
-- migration in this repository, so it is outside this project's control and is
-- exactly the kind of thing that can change underneath us.
--
-- See ./README.md for the shared fixture convention.

begin;

create extension if not exists pgtap;

select plan(8);

-- Fixture identities. Written with visually distinct prefixes so a failing
-- assertion names its actor legibly: A is `aaaaaaaa…`, B is `bbbbbbbb…`.
-- The minimal column set below is what `auth.users` requires to accept a row;
-- nothing in this suite authenticates for real, so the password is a placeholder.
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

-- ---------------------------------------------------------------------------
-- Impersonation drives auth.uid()
-- ---------------------------------------------------------------------------
--
-- `set local role` and `set local request.jwt.claim.sub` are scoped to this
-- transaction, so switching actor mid-file is just re-issuing the claim. Note
-- that the claim is read by `auth.uid()` regardless of the current role — the
-- role alone does not identify anyone, which is why the `anon` case below has
-- to clear the claim explicitly rather than only switching role.

set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

select is(
  auth.uid(),
  'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
  'auth.uid() resolves to user A while impersonating user A'
);

set local request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';

select is(
  auth.uid(),
  'bbbbbbbb-0000-0000-0000-000000000002'::uuid,
  'auth.uid() resolves to user B while impersonating user B'
);

-- The two assertions that close the vacuous-pass hole directly: the identity
-- must actually *move* between the two impersonations, and it must not be NULL.
select isnt(
  auth.uid(),
  'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
  'user B is a different identity from user A — the suite has two actors, not one'
);

select isnt(
  auth.uid(),
  null,
  'an impersonated identity is never NULL — a NULL auth.uid() would make every isolation assertion vacuous'
);

-- ---------------------------------------------------------------------------
-- anon is nobody
-- ---------------------------------------------------------------------------
--
-- Clearing the claim is the load-bearing half: `auth.uid()` reads the GUC, not
-- the role, so `set local role anon` on its own would leave user B's identity
-- attached to an anonymous session and make the `anon` cases in 01…04 test the
-- wrong thing.

set local role anon;
set local request.jwt.claim.sub = '';

select is(
  auth.uid(),
  null,
  'auth.uid() is NULL for an anonymous caller'
);

reset role;

-- ---------------------------------------------------------------------------
-- Row-level security is switched on for all three surfaces
-- ---------------------------------------------------------------------------

select is(
  (select relrowsecurity from pg_class where oid = 'public.channel_profiles'::regclass),
  true,
  'row-level security is enabled on public.channel_profiles'
);

select is(
  (select relrowsecurity from pg_class where oid = 'public.content_opportunities'::regclass),
  true,
  'row-level security is enabled on public.content_opportunities'
);

-- Asserted, not assumed: this one is a Supabase platform default rather than
-- something any migration in this repository sets.
select is(
  (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass),
  true,
  'row-level security is enabled on storage.objects'
);

select * from finish();

rollback;
