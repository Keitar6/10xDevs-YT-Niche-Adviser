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

begin;

create extension if not exists pgtap;

select plan(12);

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
      and (qual is null or qual not like '%auth.uid() = user_id%')$$,
  'every channel_profiles read/modify policy tests ownership in its USING clause'
);

select is_empty(
  $$select policyname from pg_policies
    where schemaname = 'public' and tablename = 'channel_profiles'
      and cmd in ('INSERT', 'UPDATE')
      and (with_check is null or with_check not like '%auth.uid() = user_id%')$$,
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
      and (qual is null or qual not like '%auth.uid() = user_id%')$$,
  'every content_opportunities read/modify policy tests ownership in its USING clause'
);

select is_empty(
  $$select policyname from pg_policies
    where schemaname = 'public' and tablename = 'content_opportunities'
      and cmd in ('INSERT', 'UPDATE')
      and (with_check is null or with_check not like '%auth.uid() = user_id%')$$,
  'every content_opportunities write policy tests ownership in its WITH CHECK clause'
);

select isnt(
  (select with_check from pg_policies
    where schemaname = 'public' and tablename = 'content_opportunities' and cmd = 'UPDATE'),
  null,
  'the content_opportunities UPDATE policy carries a WITH CHECK — the owner-reassignment vector stays closed'
);

select * from finish();

rollback;
