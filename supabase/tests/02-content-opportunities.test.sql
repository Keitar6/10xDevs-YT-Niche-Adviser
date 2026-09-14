-- 02-content-opportunities.test.sql — per-verb, per-role isolation on saved
-- opportunities.
--
-- Same four-verb, three-role matrix as 01, against the table whose ownership
-- shape differs: `user_id` is NOT unique on its own here. The constraint is the
-- composite `(user_id, video_id)` — one save per video per user, many rows per
-- user. That difference is worth its own assertions, because a composite
-- constraint that had been written as a global `unique (video_id)` would leak
-- one user's saves into another user's failures.
--
-- Denied UPDATE/DELETE report zero rows silently; denied INSERT raises 42501
-- and aborts the transaction, so it goes through `throws_ok`. See ./README.md.

begin;

create extension if not exists pgtap;

select plan(18);

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

-- Two saves for A. Every numeric column carries a CHECK (> 0, or >= 0 for
-- view_count), so these values are chosen to satisfy them rather than at random.
insert into public.content_opportunities (
  user_id, video_id, title, channel_id, channel_title,
  published_at, view_count, outlier_score, channel_median, sample_size
)
values
  (
    'aaaaaaaa-0000-0000-0000-000000000001', 'vid-alpha', 'Alpha', 'UC-a1', 'Channel A1',
    '2026-09-01T00:00:00Z', 120000, 4.5, 26000, 20
  ),
  (
    'aaaaaaaa-0000-0000-0000-000000000001', 'vid-beta', 'Beta', 'UC-a2', 'Channel A2',
    '2026-09-02T00:00:00Z', 90000, 3.1, 29000, 20
  );

-- ---------------------------------------------------------------------------
-- The owner sees their own saves
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

select results_eq(
  $$select video_id from public.content_opportunities order by video_id$$,
  $$values ('vid-alpha'::text), ('vid-beta'::text)$$,
  'user A sees exactly their own two saved opportunities'
);

-- ---------------------------------------------------------------------------
-- User B: all four verbs denied
-- ---------------------------------------------------------------------------

set local request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';

select is_empty(
  $$select id from public.content_opportunities$$,
  'user B sees none of user A''s saved opportunities'
);

-- This is the assertion that protects code which does not exist yet. No route
-- in the codebase issues an UPDATE against this table; S-06
-- (`opportunity-status-transitions`) introduces the first one. The ownership
-- guarantee on that write path is proven here *before* the path has a caller —
-- which is precisely why F-03 is sequenced ahead of S-06. Do not delete this as
-- dead coverage.
with denied as (
  update public.content_opportunities
  set status = 'done'
  where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'
  returning 1
)
select is(
  (select count(*)::int from denied),
  0,
  'user B''s UPDATE of user A''s saved rows affects zero rows (the S-06 write path, pre-proven)'
);

with denied as (
  delete from public.content_opportunities
  where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'
  returning 1
)
select is(
  (select count(*)::int from denied),
  0,
  'user B''s DELETE of user A''s saved rows affects zero rows'
);

select throws_ok(
  $$insert into public.content_opportunities (
      user_id, video_id, title, channel_id,
      published_at, view_count, outlier_score, channel_median, sample_size
    )
    values (
      'aaaaaaaa-0000-0000-0000-000000000001', 'vid-planted', 'Planted', 'UC-b1',
      '2026-09-03T00:00:00Z', 1000, 2.0, 500, 10
    )$$,
  '42501',
  null::text,
  'user B cannot INSERT a saved opportunity owned by user A'
);

-- Read back as the owner: zero rows affected is only half the proof.
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

select results_eq(
  $$select video_id, status from public.content_opportunities order by video_id$$,
  $$values ('vid-alpha'::text, 'new'::text), ('vid-beta'::text, 'new'::text)$$,
  'after user B''s denied writes, both of user A''s rows are unchanged — status still ''new'''
);

-- ---------------------------------------------------------------------------
-- anon: all four verbs denied
-- ---------------------------------------------------------------------------

set local role anon;
set local request.jwt.claim.sub = '';

select is_empty(
  $$select id from public.content_opportunities$$,
  'an anonymous caller sees no saved opportunities'
);

with denied as (
  update public.content_opportunities
  set status = 'in_production'
  where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'
  returning 1
)
select is(
  (select count(*)::int from denied),
  0,
  'an anonymous UPDATE of user A''s saved rows affects zero rows'
);

with denied as (
  delete from public.content_opportunities
  where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'
  returning 1
)
select is(
  (select count(*)::int from denied),
  0,
  'an anonymous DELETE of user A''s saved rows affects zero rows'
);

select throws_ok(
  $$insert into public.content_opportunities (
      user_id, video_id, title, channel_id,
      published_at, view_count, outlier_score, channel_median, sample_size
    )
    values (
      'aaaaaaaa-0000-0000-0000-000000000001', 'vid-anon', 'Anon', 'UC-x1',
      '2026-09-04T00:00:00Z', 1000, 2.0, 500, 10
    )$$,
  '42501',
  null::text,
  'an anonymous caller cannot INSERT a saved opportunity'
);

set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

select results_eq(
  $$select video_id, title, view_count, outlier_score, status
    from public.content_opportunities order by video_id$$,
  $$values
      ('vid-alpha'::text, 'Alpha'::text, 120000::bigint, 4.5::double precision, 'new'::text),
      ('vid-beta'::text, 'Beta'::text, 90000::bigint, 3.1::double precision, 'new'::text)$$,
  'after every denied write from every other role, user A''s saved rows are byte-for-byte what A left'
);

select is(
  (select count(*)::int from public.content_opportunities),
  2,
  'exactly two saved rows survive the whole file'
);

-- ---------------------------------------------------------------------------
-- The composite uniqueness constraint is scoped per user, not globally
-- ---------------------------------------------------------------------------

-- Same user, same video, twice. This raise is the precondition for the
-- idempotent-save branch at `src/pages/api/opportunities.ts:50-61`, which reads
-- 23505 as "already saved" rather than as an error.
select throws_ok(
  $$insert into public.content_opportunities (
      user_id, video_id, title, channel_id,
      published_at, view_count, outlier_score, channel_median, sample_size
    )
    values (
      'aaaaaaaa-0000-0000-0000-000000000001', 'vid-alpha', 'Alpha again', 'UC-a1',
      '2026-09-01T00:00:00Z', 120000, 4.5, 26000, 20
    )$$,
  '23505',
  null::text,
  'the same user saving the same video twice is rejected by the composite unique constraint'
);

-- Different user, same video. If the constraint had been written as a global
-- `unique (video_id)`, this would fail — and one user's library would silently
-- limit another's.
set local request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';

select lives_ok(
  $$insert into public.content_opportunities (
      user_id, video_id, title, channel_id,
      published_at, view_count, outlier_score, channel_median, sample_size
    )
    values (
      'bbbbbbbb-0000-0000-0000-000000000002', 'vid-alpha', 'Alpha', 'UC-a1',
      '2026-09-01T00:00:00Z', 120000, 4.5, 26000, 20
    )$$,
  'user B may save the same video user A saved — uniqueness is per user, not global'
);

select results_eq(
  $$select video_id from public.content_opportunities$$,
  $$values ('vid-alpha'::text)$$,
  'user B''s library contains only user B''s own save of that video'
);

set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

select is(
  (select count(*)::int from public.content_opportunities),
  2,
  'user B''s save did not appear in user A''s library'
);

-- ---------------------------------------------------------------------------
-- Positive controls: the owner CAN write their own rows
-- ---------------------------------------------------------------------------

-- Without these two, every "affects zero rows" assertion above would pass just
-- as happily if the UPDATE and DELETE policies denied *everybody* — dropping
-- both owner policies outright leaves the rest of this file green. They are
-- also the other half of the S-06 pre-proof above: that assertion shows a
-- stranger's UPDATE is refused, this one shows the owner's is not, which is
-- what S-06's write path will actually depend on.

with allowed as (
  update public.content_opportunities
  set status = 'in_production'
  where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'
  returning 1
)
select is(
  (select count(*)::int from allowed),
  2,
  'user A CAN update their own saved rows — so the strangers'' zero-row updates were RLS, not a blanket block'
);

-- DELETE runs last: it removes the rows every assertion above depends on.
with allowed as (
  delete from public.content_opportunities
  where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'
  returning 1
)
select is(
  (select count(*)::int from allowed),
  2,
  'user A CAN delete their own saved rows — so the strangers'' zero-row deletes were RLS, not a blanket block'
);

select * from finish();

rollback;
