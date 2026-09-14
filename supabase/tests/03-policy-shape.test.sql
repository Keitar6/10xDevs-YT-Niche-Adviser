-- 03-policy-shape.test.sql — the policies say what they must say.
--
-- 01 and 02 prove isolation behaviourally. This file proves it structurally,
-- and it exists because of a specific review finding on an earlier change
-- (`context/archive/2026-09-13-save-and-view-opportunities/reviews/plan-review.md:80-87`,
-- "F5"): a verification criterion that asserted only *"`pg_policies` returns 4
-- rows for the table"* was rejected on the grounds that **four `using (true)`
-- policies would satisfy it equally well**.
--
-- So nothing here counts policies. Every assertion is about the *expression* a
-- policy carries and the *role* it is granted to. A policy that exists, is
-- named correctly, and says `true` fails this file.
--
-- No role switching: `pg_policies` is read as `postgres`, since this is a
-- statement about the catalogue rather than about what any caller can do.
--
-- The ownership assertions on the two `public` tables compare `qual` for
-- *equality*, not with `like '%…%'`. A substring test is satisfied by
-- `using (auth.uid() = user_id or true)`, which is the same class of hole F5
-- caught and would make this file's claim above untrue. The cost is that a
-- future Postgres which re-prints the stored expression differently will fail
-- here — that is the intended trade: a loud failure asking a human to confirm
-- the expression, rather than a silent weakening. `storage.objects` carries a
-- longer expression and is checked structurally instead, with an explicit
-- no-`OR` guard closing the same hole.

begin;

create extension if not exists pgtap;

select plan(19);

-- ---------------------------------------------------------------------------
-- public.channel_profiles
-- ---------------------------------------------------------------------------

select results_eq(
  $$select cmd::text from pg_policies
    where schemaname = 'public' and tablename = 'channel_profiles'
    order by cmd$$,
  $$values ('DELETE'::text), ('INSERT'::text), ('SELECT'::text), ('UPDATE'::text)$$,
  'channel_profiles has one policy per verb — all four verbs, no verb twice'
);

-- `anon` isolation in this project is an *absence*: there is no REVOKE
-- anywhere, and Supabase's implicit Data-API grants apply, so `anon` gets zero
-- rows purely because no policy matches it. A policy that named `anon` or
-- `public` would hand it everything with nothing underneath to catch that.
select is_empty(
  $$select policyname from pg_policies
    where schemaname = 'public' and tablename = 'channel_profiles'
      and ('anon' = any(roles) or 'public' = any(roles))$$,
  'no channel_profiles policy is granted to anon or to public'
);

select is_empty(
  $$select policyname from pg_policies
    where schemaname = 'public' and tablename = 'channel_profiles'
      and roles <> '{authenticated}'::name[]$$,
  'every channel_profiles policy is scoped to authenticated and to nothing else'
);

select is_empty(
  $$select policyname from pg_policies
    where schemaname = 'public' and tablename = 'channel_profiles'
      and cmd in ('SELECT', 'UPDATE', 'DELETE')
      and (qual is null or qual <> '(auth.uid() = user_id)')$$,
  'every channel_profiles read/modify policy tests ownership in its USING clause'
);

select is_empty(
  $$select policyname from pg_policies
    where schemaname = 'public' and tablename = 'channel_profiles'
      and cmd in ('INSERT', 'UPDATE')
      and (with_check is null or with_check <> '(auth.uid() = user_id)')$$,
  'every channel_profiles write policy tests ownership in its WITH CHECK clause'
);

-- Named separately from the blanket assertion above because this is the one
-- specific hole worth being able to read off a failure report: a USING-only
-- UPDATE policy lets an owner rewrite `user_id` and hand their row to someone
-- else. This codebase does not have that hole; this assertion is what keeps it
-- that way.
select isnt(
  (select with_check from pg_policies
    where schemaname = 'public' and tablename = 'channel_profiles' and cmd = 'UPDATE'),
  null,
  'the channel_profiles UPDATE policy carries a WITH CHECK — the owner-reassignment vector stays closed'
);

-- ---------------------------------------------------------------------------
-- public.content_opportunities
-- ---------------------------------------------------------------------------

select results_eq(
  $$select cmd::text from pg_policies
    where schemaname = 'public' and tablename = 'content_opportunities'
    order by cmd$$,
  $$values ('DELETE'::text), ('INSERT'::text), ('SELECT'::text), ('UPDATE'::text)$$,
  'content_opportunities has one policy per verb — all four verbs, no verb twice'
);

select is_empty(
  $$select policyname from pg_policies
    where schemaname = 'public' and tablename = 'content_opportunities'
      and ('anon' = any(roles) or 'public' = any(roles))$$,
  'no content_opportunities policy is granted to anon or to public'
);

select is_empty(
  $$select policyname from pg_policies
    where schemaname = 'public' and tablename = 'content_opportunities'
      and roles <> '{authenticated}'::name[]$$,
  'every content_opportunities policy is scoped to authenticated and to nothing else'
);

select is_empty(
  $$select policyname from pg_policies
    where schemaname = 'public' and tablename = 'content_opportunities'
      and cmd in ('SELECT', 'UPDATE', 'DELETE')
      and (qual is null or qual <> '(auth.uid() = user_id)')$$,
  'every content_opportunities read/modify policy tests ownership in its USING clause'
);

select is_empty(
  $$select policyname from pg_policies
    where schemaname = 'public' and tablename = 'content_opportunities'
      and cmd in ('INSERT', 'UPDATE')
      and (with_check is null or with_check <> '(auth.uid() = user_id)')$$,
  'every content_opportunities write policy tests ownership in its WITH CHECK clause'
);

select isnt(
  (select with_check from pg_policies
    where schemaname = 'public' and tablename = 'content_opportunities' and cmd = 'UPDATE'),
  null,
  'the content_opportunities UPDATE policy carries a WITH CHECK — the owner-reassignment vector stays closed'
);


-- ---------------------------------------------------------------------------
-- storage.objects — the `avatars` bucket
-- ---------------------------------------------------------------------------

-- 04 proves the avatars policies behaviourally. They get a structural check too
-- because `storage.objects` is the one table in this suite shared with the
-- Supabase platform rather than owned by this repo's migrations: a policy can
-- appear on it from outside, and a `public`-scoped one would hand every user's
-- avatar to every caller with nothing in `04` positioned to notice.

select results_eq(
  $$select cmd::text from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'avatars%'
    order by cmd$$,
  $$values ('DELETE'::text), ('INSERT'::text), ('SELECT'::text), ('UPDATE'::text)$$,
  'the avatars bucket has one policy per verb — all four verbs, no verb twice'
);

-- Deliberately spans *every* policy on storage.objects, not just the avatars
-- ones: the risk here is a policy arriving from outside this repo.
select is_empty(
  $$select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and ('anon' = any(roles) or 'public' = any(roles))$$,
  'no storage.objects policy is granted to anon or to public'
);

select is_empty(
  $$select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'avatars%'
      and roles <> '{authenticated}'::name[]$$,
  'every avatars policy is scoped to authenticated and to nothing else'
);

-- Ownership on this surface is the first path segment, not a column. A policy
-- that dropped the `foldername` test would still read as an avatars policy.
select is_empty(
  $$select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'avatars%' and cmd in ('SELECT', 'UPDATE', 'DELETE')
      and (qual is null
           or qual not like '%(storage.foldername(name))[1]%'
           or qual not like '%bucket_id = ''avatars''%')$$,
  'every avatars read/modify policy tests the owner path prefix and the bucket in its USING clause'
);

select is_empty(
  $$select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'avatars%' and cmd in ('INSERT', 'UPDATE')
      and (with_check is null
           or with_check not like '%(storage.foldername(name))[1]%'
           or with_check not like '%bucket_id = ''avatars''%')$$,
  'every avatars write policy tests the owner path prefix and the bucket in its WITH CHECK clause'
);

select isnt(
  (select with_check from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'avatars_update_own'),
  null,
  'the avatars UPDATE policy carries a WITH CHECK — an owner cannot move an object under another user''s prefix'
);

-- The substring assertions above are satisfied by `… or true`. All four stored
-- expressions are pure conjunctions, so the absence of `OR` is what closes that
-- hole here — the structural equivalent of the equality test used on the two
-- `public` tables.
select is_empty(
  $$select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'avatars%'
      and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~* '\\mor\\M'$$,
  'no avatars policy expression is widened by an OR branch'
);

select * from finish();

rollback;
