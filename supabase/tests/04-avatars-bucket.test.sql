-- 04-avatars-bucket.test.sql — per-verb, per-role isolation on the private
-- `avatars` bucket.
--
-- The third surface, and the one whose ownership is shaped differently: there
-- is no `user_id` column here. All four `avatars` policies key on
-- `(storage.foldername(name))[1]` — the object's **first path segment**. So an
-- object written at `<user_id>/<filename>` belongs to that user, and an object
-- written at the bucket root belongs to nobody.
--
-- That makes a malformed fixture the storage-layer twin of the NULL-auth.uid()
-- problem `00-harness.test.sql` guards: an object at the root would be
-- invisible to every actor, and every "the stranger sees nothing" assertion
-- below would pass without a policy being consulted. Assertions 2 and 9 exist
-- to make that impossible, so the fixture fails loudly rather than silently.

begin;

create extension if not exists pgtap;

select plan(16);

-- ---------------------------------------------------------------------------
-- Fixtures — created as `postgres`, before the first `set local role`
-- ---------------------------------------------------------------------------
--
-- The `avatars` bucket row already exists, created by
-- `20260913134159_add_channel_profile_avatar.sql:24-32` under
-- `on conflict (id) do nothing`, so nothing here has to create it.

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

insert into storage.objects (id, bucket_id, name, owner, owner_id, metadata)
values (
  '11111111-1111-1111-1111-111111111111',
  'avatars',
  'aaaaaaaa-0000-0000-0000-000000000001/avatar.png',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000001',
  '{"size": 1024, "mimetype": "image/png"}'::jsonb
);

-- ---------------------------------------------------------------------------
-- The bucket itself
-- ---------------------------------------------------------------------------

select is(
  (select public from storage.buckets where id = 'avatars'),
  false,
  'the avatars bucket is private — there is no public-read path around the policies'
);

-- ---------------------------------------------------------------------------
-- Fixture sanity: ownership is the path
-- ---------------------------------------------------------------------------

select is(
  (select (storage.foldername(name))[1] from storage.objects
    where id = '11111111-1111-1111-1111-111111111111'),
  'aaaaaaaa-0000-0000-0000-000000000001',
  'the fixture object''s first path segment is user A''s id — without this, every assertion below is vacuous'
);

-- ---------------------------------------------------------------------------
-- Standing down the accident guard so RLS is the thing under test
-- ---------------------------------------------------------------------------
--
-- `storage.objects` carries a statement-level BEFORE DELETE trigger
-- (`protect_objects_delete` → `storage.protect_delete()`) that raises 42501 on
-- any direct DELETE unless `storage.allow_delete_query` is 'true'. It fires per
-- *statement*, not per row, so it fires even when RLS has already filtered the
-- target away.
--
-- It must be stood down here, and the reason is the whole thesis of this suite:
-- left up, every DELETE assertion below would pass because the statement throws
-- for *everyone* — the owner included — not because the policy denied anyone.
-- That is a vacuous pass wearing a green tick.
--
-- Nor is the trigger a security boundary: `authenticated` can set this GUC
-- itself, exactly as the next line does. It guards against orphaned objects
-- left behind when a row is deleted without the Storage API, which is a
-- data-integrity concern, not an access-control one. RLS is what isolates
-- users, and RLS is what the DELETE assertions below measure.

set local storage.allow_delete_query = 'true';

-- ---------------------------------------------------------------------------
-- The owner can see their own object
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

select results_eq(
  $$select name from storage.objects where bucket_id = 'avatars'$$,
  $$values ('aaaaaaaa-0000-0000-0000-000000000001/avatar.png'::text)$$,
  'user A sees exactly their own avatar object'
);

-- ---------------------------------------------------------------------------
-- User B: all four verbs denied against user A's prefix
-- ---------------------------------------------------------------------------

set local request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';

select is_empty(
  $$select name from storage.objects where bucket_id = 'avatars'$$,
  'user B sees nothing in the avatars bucket — user A''s object is invisible'
);

with denied as (
  update storage.objects
  set metadata = '{"size": 1, "mimetype": "image/png"}'::jsonb
  where id = '11111111-1111-1111-1111-111111111111'
  returning 1
)
select is(
  (select count(*)::int from denied),
  0,
  'user B''s UPDATE of user A''s avatar object affects zero rows'
);

with denied as (
  delete from storage.objects
  where id = '11111111-1111-1111-1111-111111111111'
  returning 1
)
select is(
  (select count(*)::int from denied),
  0,
  'user B''s DELETE of user A''s avatar object affects zero rows'
);

select throws_ok(
  $$insert into storage.objects (bucket_id, name, metadata)
    values (
      'avatars',
      'aaaaaaaa-0000-0000-0000-000000000001/planted-by-b.png',
      '{"size": 1, "mimetype": "image/png"}'::jsonb
    )$$,
  '42501',
  null::text,
  'user B cannot write an object under user A''s path prefix'
);

-- The counterpart that stops the assertion above from being vacuous: B is not
-- being denied writes in general, only writes under somebody else's prefix.
select lives_ok(
  $$insert into storage.objects (id, bucket_id, name, metadata)
    values (
      '22222222-2222-2222-2222-222222222222',
      'avatars',
      'bbbbbbbb-0000-0000-0000-000000000002/avatar.png',
      '{"size": 2048, "mimetype": "image/png"}'::jsonb
    )$$,
  'user B may write an object under their own path prefix'
);

select is(
  (select (storage.foldername(name))[1] from storage.objects
    where id = '22222222-2222-2222-2222-222222222222'),
  'bbbbbbbb-0000-0000-0000-000000000002',
  'user B''s own object''s first path segment is user B''s id'
);

select results_eq(
  $$select name from storage.objects where bucket_id = 'avatars'$$,
  $$values ('bbbbbbbb-0000-0000-0000-000000000002/avatar.png'::text)$$,
  'user B sees only their own object — owning one object does not reveal user A''s'
);

-- ---------------------------------------------------------------------------
-- anon: all four verbs denied
-- ---------------------------------------------------------------------------

set local role anon;
set local request.jwt.claim.sub = '';

select is_empty(
  $$select name from storage.objects where bucket_id = 'avatars'$$,
  'an anonymous caller sees nothing in the avatars bucket'
);

with denied as (
  update storage.objects
  set metadata = '{"size": 1, "mimetype": "image/png"}'::jsonb
  where id = '11111111-1111-1111-1111-111111111111'
  returning 1
)
select is(
  (select count(*)::int from denied),
  0,
  'an anonymous UPDATE of user A''s avatar object affects zero rows'
);

with denied as (
  delete from storage.objects
  where id = '11111111-1111-1111-1111-111111111111'
  returning 1
)
select is(
  (select count(*)::int from denied),
  0,
  'an anonymous DELETE of user A''s avatar object affects zero rows'
);

select throws_ok(
  $$insert into storage.objects (bucket_id, name, metadata)
    values (
      'avatars',
      'aaaaaaaa-0000-0000-0000-000000000001/planted-by-anon.png',
      '{"size": 1, "mimetype": "image/png"}'::jsonb
    )$$,
  '42501',
  null::text,
  'an anonymous caller cannot write an object into the avatars bucket'
);

-- ---------------------------------------------------------------------------
-- Row intactness, and the proof that the zeros above meant something
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

select results_eq(
  $$select name, metadata from storage.objects where bucket_id = 'avatars'$$,
  $$values (
      'aaaaaaaa-0000-0000-0000-000000000001/avatar.png'::text,
      '{"size": 1024, "mimetype": "image/png"}'::jsonb
    )$$,
  'after every denied write from every other role, user A''s object is byte-for-byte what A left'
);

-- The non-vacuity close for the DELETE assertions specifically. Both of them
-- above reported zero rows affected; this proves that was RLS filtering the row
-- away from a stranger, and not the statement being inert for everybody.
with allowed as (
  delete from storage.objects
  where id = '11111111-1111-1111-1111-111111111111'
  returning 1
)
select is(
  (select count(*)::int from allowed),
  1,
  'user A CAN delete their own object — so the strangers'' zero-row deletes were RLS, not a blanket block'
);

select * from finish();

rollback;
