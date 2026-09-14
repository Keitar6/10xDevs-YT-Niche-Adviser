# Database policy tests (pgTAP)

These files prove per-user isolation at the database boundary — the layer that
actually enforces it. There is no service-role client anywhere in `src/`, so
row-level security is not defence-in-depth here: it is the only thing standing
between two users. The application's `.eq("user_id", …)` filters exist to make
intent legible, not to enforce.

Run them with:

```bash
npm run test:db
```

Requires a container runtime and a running local stack (`npx supabase start`).
The `pgtap` extension does **not** need a migration — each file creates it
inside its own transaction and rolls it back again.

## Files

| File                                | Proves                                                                                                                                 |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `00-harness.test.sql`               | Impersonation resolves to two distinct non-null identities, `anon` to none, and RLS is on for all three surfaces. **Read this first.** |
| `01-channel-profiles.test.sql`      | Per-verb, per-role isolation on `public.channel_profiles`                                                                              |
| `02-content-opportunities.test.sql` | Per-verb, per-role isolation on `public.content_opportunities`                                                                         |
| `03-policy-shape.test.sql`          | The policy _expressions_ say what they must say                                                                                        |
| `04-avatars-bucket.test.sql`        | Per-verb, per-role isolation on the private `avatars` bucket                                                                           |

`00-harness.test.sql` is the precondition for every other file. If it goes red,
nothing else in this directory means anything — a suite where `auth.uid()` is
NULL for both actors passes every "the stranger sees nothing" assertion without
a single policy being consulted.

## Conventions

### Fixture identities

Two fixed users, with visually distinct prefixes so a failing assertion names
its actor legibly:

| Actor                     | UUID                                   |
| ------------------------- | -------------------------------------- |
| **User A** — the owner    | `aaaaaaaa-0000-0000-0000-000000000001` |
| **User B** — the stranger | `bbbbbbbb-0000-0000-0000-000000000002` |

Insert them into `auth.users` with the minimal accepted column set: `id`,
`instance_id`, `aud`, `role`, `email`, `encrypted_password`, `created_at`,
`updated_at`. Nothing here authenticates for real, so the password is a
placeholder.

### Transaction per file

Every file is wrapped in `begin` / `rollback` and creates its own fixtures
in-transaction. Nothing persists, nothing depends on `supabase db reset`, and
files do not have to run in any particular order relative to one another.

The `rollback` is load-bearing, not tidiness. These files write to the shared
`auth.users` and `storage.objects`. Running one in Studio or `psql` with the
trailing `rollback;` dropped leaves the two `*@isolation.test` fixture users and
an `avatars` object committed in your local database — harmless but confusing,
and they will still be there the next time you go looking for real data.

```sql
begin;
create extension if not exists pgtap;
select plan(N);
-- fixtures, then assertions
select * from finish();
rollback;
```

### Impersonation

```sql
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
```

Both are transaction-scoped, so switching actor mid-file is just re-issuing the
claim. Two traps:

- `auth.uid()` reads the **claim**, not the role. `set local role anon` on its
  own leaves the previous user's identity attached, so an `anon` case must also
  clear the claim: `set local request.jwt.claim.sub = '';`
- Returning from `anon` to a user needs **both** the role and the claim again.

Fixture inserts that must bypass RLS (creating the owner's row, writing to
`auth.users`) happen before the first `set local role`, while still `postgres`.

### Denied writes fail in two different ways

This decides how each assertion is written, and getting it wrong takes out the
rest of the file:

- A denied **`UPDATE` or `DELETE`** matches zero rows and returns silently
  (`UPDATE 0`). Assert on the affected count — and **always pair it with a
  row-intactness assertion**, because zero rows affected is not by itself proof
  that the owner's row survived untouched. That pairing is the whole difference
  between this suite and a naive one.
- A denied **`INSERT`** raises SQLSTATE `42501` and **aborts the enclosing
  transaction**, taking every later assertion in the file down with it.
  Denied inserts must therefore go through `throws_ok`, whose internal
  PL/pgSQL exception handler acts as a savepoint.

```sql
select throws_ok(
  $$insert into public.channel_profiles (user_id, niche, competitors)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'x', '[{},{},{}]'::jsonb)$$,
  '42501',
  'new row violates row-level security policy for table "channel_profiles"',
  'user B cannot insert a row owned by user A'
);
```

### Assert expressions, never policy counts

`03-policy-shape.test.sql` asserts the `qual` and `with_check` **expressions**
of each policy. It deliberately does not assert that a table has four policies:
four `using (true)` policies would satisfy a count and prove nothing. This is a
direct inheritance of a review finding on an earlier change
(`context/archive/2026-09-13-save-and-view-opportunities/reviews/plan-review.md:80-87`).

### Storage ownership is the first path segment

All four `avatars` policies key on `(storage.foldername(name))[1]`, so fixture
objects must be written at `<user_id>/<filename>`. An object written at the
bucket root belongs to nobody and makes every assertion about it vacuous — the
storage-layer twin of the `auth.uid()` problem `00-harness.test.sql` guards.
