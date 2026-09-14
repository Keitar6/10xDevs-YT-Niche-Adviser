# Provable User Isolation Implementation Plan

## Overview

Convert a per-user isolation guarantee that is **correct today and enforced
entirely by developer discipline** into one that is enforced mechanically. The
product of this change is a pgTAP suite proving isolation per verb and per role
across `channel_profiles`, `content_opportunities` and the `avatars` bucket,
plus a Vitest route suite proving every data-touching handler refuses a
sessionless caller and never derives ownership from the request.

This discharges roadmap element **F-03**, covers `test-plan.md` §2 risks **#3**
and **#4**, and fills the `test-plan.md` §6.3 / §6.4 cookbook entries that are
currently `TBD`.

## Current State Analysis

`research.md` swept the full access-control surface and found **no defects**.
The policy set is complete (12 policies, four verbs × three surfaces), every
`UPDATE` policy carries both `USING` and `WITH CHECK` so the owner-reassignment
vector does not exist, and there is **no service-role client anywhere** — all 13
Supabase construction sites resolve to the single cookie-scoped anon-key factory
at `src/lib/supabase.ts:6-24`.

What is missing is any mechanism that would catch the next migration silently
undoing it. Every prior isolation claim across four migrations was manual or
scripted curl, run locally, never in CI; one production verification criterion
was formally downgraded to "won't-do" after the fact
(`context/archive/2026-09-13-channel-profile-avatar/change.md:62-66`); and
`context/archive/2026-09-13-save-and-view-opportunities/plan-brief.md:97-98`
states the gap outright: *"a future migration that weakens a policy would not be
caught automatically."*

**This is therefore a pinning job, not a remediation job.** No phase below is
expected to find a bug. A phase that goes red on first run means the test is
wrong, not the policy — investigate in that order.

### Verified during planning (not inferred)

The riskiest mechanics were run against the live local stack before this plan
was written, so no phase carries a "does this work?" branch:

| Question | Result |
|---|---|
| Does `set local request.jwt.claim.sub` drive `auth.uid()`? | **Yes**, on this PG 17.6 stack. The JSON `request.jwt.claims` form also works. Research's open question #1 is closed. |
| Does the full protocol run? | **Yes** — a 4-assertion pgTAP probe (oracle guard → cross-user emptiness → denied insert → row intact) passed `Result: PASS`, then was deleted. |
| Does a denied write abort the test transaction? | **Denied `UPDATE`/`DELETE` fail silently (`UPDATE 0`). A denied `INSERT` raises `42501` and aborts the transaction.** `throws_ok` survives it via its internal subtransaction — verified. |
| Is an `enable pgtap` migration required? | **No.** `select … from pg_extension where extname='pgtap'` returns zero rows after a run; the extension is created and rolled back per file. |
| Can Vitest import a route handler today? | **No.** Every route transitively imports `astro:env/server`, and `analyze.ts` / `avatar/generate.ts` also import `cloudflare:workers`. Both must resolve before any handler can be imported. |

## Desired End State

`npm run test:db` proves, against the local stack, that a stranger cannot read,
update or delete another user's channel profile, saved opportunities or avatar
object — and that every denied write left the targeted row intact. `npm test`
proves that each of the seven data-touching API handlers returns 401 with no
data to a sessionless caller, that ownership is never taken from the request
body, and that no service-role client exists in `src/`.

Verified by: both commands green from a clean checkout with the local Supabase
stack running; and by deliberately breaking a policy (`alter policy … using
(true)`) and observing the suite go red before reverting.

### Key Discoveries

- **The oracle problem has a pgTAP-native form.** If `auth.uid()` returns NULL
  for *both* impersonated users, every "stranger sees nothing" assertion passes
  vacuously. Phase 1 exists solely to make that impossible.
- **F5 is the most reusable prior artifact.**
  `context/archive/2026-09-13-save-and-view-opportunities/reviews/plan-review.md:80-87`
  rejected a criterion asserting only that `pg_policies` returns 4 rows —
  noting four `using(true)` policies would also satisfy it. This plan asserts
  the `qual` / `with_check` **expressions**, not the count.
- **`anon` isolation is an absence, not a statement.** No `REVOKE` exists, and
  `supabase/config.toml:23` leaves `auto_expose_new_tables` commented out, so it
  falls back to `true` — Supabase's implicit Data-API grants apply. `anon` gets
  zero rows purely because no policy matches it.
- **`content_opportunities`' UPDATE policy has no caller.** No route issues an
  UPDATE against that table; S-06 introduces the first one. Phase 2 proves the
  ownership guarantee on that path *before* the path exists.
- **Storage ownership is the first path segment.** All four `avatars` policies
  use `(storage.foldername(name))[1]`, so test objects must be written at
  `<user_id>/<filename>` — a fixture written at the bucket root would make every
  assertion in Phase 3 meaningless.
- **`vitest.config.ts:6` scopes `include` to `src/lib/services/**/*.test.ts`** —
  `npm test` can never see a route test until that widens. F-04 needs the same
  edit; **F-03 owns it** (decided during planning).

## What We're NOT Doing

- **No hardening migration.** No `FORCE ROW LEVEL SECURITY`, no `REVOKE` for
  `anon`. The roadmap's F-03 outcome reads as *assert-only*, and adding a
  `REVOKE` against Supabase's implicit Data-API grants risks breaking PostgREST
  paths not exercised locally. The current effect is asserted; the seam is
  recorded in "Open Risks" rather than closed.
- **No `service_role` or table-owner assertions.** `service_role` bypasses RLS
  by design — asserting that is asserting a platform truth that can never fail
  for a reason anyone cares about. The invariant that matters, *no service-role
  client exists in this codebase*, is pinned in Phase 4 instead.
- **No coverage of the avatar signed-URL read path.** `createSignedUrl` is a
  distinct authorization mechanism from `avatars_select_own`; a DB-level test
  cannot reach it, and covering it at the route layer would mean asserting on
  the argument passed to a stubbed storage client. Scoped out explicitly and
  added to `test-plan.md` §7, consistent with §7's existing exclusion of avatar
  surfaces on blast-radius grounds.
- **No `/api/auth/*` route tests.** Those five handlers *establish* the session
  rather than consume it; they share no contract with the seven data-touching
  handlers and would dilute the table-driven pattern into five one-offs.
- **No CI wiring.** `test-plan.md` §5 already defers the placement decision to
  its Phase 4, and a local gate is a valid end state. Phase 5 documents the
  local gate and records the evidence a later decision needs.
- **No refactor of route handlers to receive the Supabase client from
  `context.locals`.** It is the cleanest testability fix, but it is a production
  change across 10 files inside a change whose whole value is being reviewable
  as test-only.
- **No `supabase/seed.sql`.** It is referenced by `supabase/config.toml:65-68`
  but absent on disk (research open question #7). Fixtures are created
  in-transaction, so nothing in this change depends on `supabase db reset`. Left
  alone deliberately; noted in Open Risks.

## Implementation Approach

Two harnesses, kept apart because they have different runtimes: pgTAP under
`supabase/tests/` needs Docker and proves the database boundary; Vitest proves
the route boundary and needs no database at all. Coupling them would gate a
Docker-free suite behind Docker.

Phase 1 is the foundation and the anti-vacuous-pass guard. Phases 2 and 3 are
the isolation proofs, one per surface. Phase 4 is the independent route suite.
Phase 5 records the gate and fills the cookbook the roadmap says F-03 owes.

Every denied-write assertion follows the five-step protocol ported from
`context/archive/2026-09-13-save-and-view-opportunities/plan.md:356-360`:
owner writes → stranger's read is empty → stranger's delete affects nothing →
stranger's update affects nothing → **owner's row is unchanged afterward**. The
last step is the one `test-plan.md` §2 insists on and that naive suites omit.

## Critical Implementation Details

**Denied writes fail in two different ways, and the difference decides how each
assertion is written.** A denied `UPDATE` or `DELETE` matches zero rows and
returns silently (`UPDATE 0`) — assert with `is`/`results_eq` on the affected
count *and* pair it with a row-intactness check, because zero rows alone is not
proof. A denied `INSERT` raises SQLSTATE `42501` and **aborts the enclosing
transaction**, taking every later assertion in the file with it. Denied inserts
must therefore go through `throws_ok`, whose internal PL/pgSQL exception handler
acts as a savepoint. This was verified during planning: a bare denied insert
killed the probe; the same insert inside `throws_ok` left the transaction alive
and the following assertion ran normally.

**Impersonation is per-statement-block, not per-connection.** `set local role`
and `set local request.jwt.claim.sub` are scoped to the enclosing transaction,
so switching users mid-file is just re-issuing the claim. Switching to `anon`
requires `set local role anon`; returning to a user requires *both* the role and
the claim again. The verified form:

```sql
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
```

**Vitest cannot import any route handler until two virtual modules resolve.**
`astro:env/server` is imported by `src/lib/supabase.ts:3` (which every handler
imports) and directly by `profile.ts:3` and `analyze.ts:11`;
`cloudflare:workers` is imported by `analyze.ts:15` and `avatar/generate.ts:13`.
Both must be aliased to stubs in `vitest.config.ts` before Phase 4's first test
can even load. The stub values must stay in sync with the `env.schema` block in
`astro.config.mjs:19-22` by hand — drift there is silent, which is why Phase 5
records it.

---

## Phase 1: pgTAP harness and the oracle guard

### Overview

Stand up `supabase/tests/`, wire a runnable script, and write the one file whose
job is to make every later assertion non-vacuous. Nothing in Phases 2 or 3 means
anything unless this phase's assertions hold.

### Changes Required

#### 1. Test runner script

**File**: `package.json`

**Intent**: Give the pgTAP suite a named entry point so it can be documented as
a gate and invoked the same way in every context.

**Contract**: A `test:db` script running the Supabase CLI's database test
command. The CLI is already a devDependency (`supabase ^2.116.0`); no new
dependency is added. `npm test` stays unchanged and does not invoke it — the two
suites have different prerequisites.

#### 2. Shared fixture convention

**File**: `supabase/tests/README.md`

**Intent**: Record the two fixed user UUIDs, the transaction-per-file shape, and
the `throws_ok`-for-denied-inserts rule, so files 2 through 4 are written
consistently and a future author does not rediscover the abort behaviour.

**Contract**: Prose plus the fixed identifiers. User A and user B get stable,
visually distinct UUIDs (A prefixed `aaaaaaaa`, B prefixed `bbbbbbbb`) so a
failing assertion names its actor legibly.

#### 3. The oracle guard

**File**: `supabase/tests/00-harness.test.sql`

**Intent**: Prove that impersonation actually works before any isolation claim
depends on it, and that RLS is switched on for all three surfaces. This is the
single most important file in the change: research names a NULL `auth.uid()` for
both users as "the single most likely way the suite silently proves nothing."

**Contract**: Wrapped in `begin` / `rollback` with `create extension if not
exists pgtap`. Inserts the two fixture rows into `auth.users` (minimal columns:
`id`, `instance_id`, `aud`, `role`, `email`, `encrypted_password`,
`created_at`, `updated_at` — verified sufficient during planning). Then asserts:

- `auth.uid()` equals A's UUID when impersonating A;
- `auth.uid()` equals B's UUID when impersonating B — **and is not equal to A's**,
  which is what rules out the both-NULL failure;
- `auth.uid()` is NULL under `set local role anon`;
- `relrowsecurity` is true for `public.channel_profiles`,
  `public.content_opportunities` and `storage.objects` — the last asserted
  rather than assumed, since it is a Supabase platform default outside this
  project's migrations.

### Success Criteria

#### Automated Verification

- `npm run test:db` exits 0 and reports `Result: PASS`
- The harness file reports its full planned assertion count, with no skipped tests
- `git status --porcelain` shows no stray files under `supabase/` beyond the intended ones
- `npm run lint` passes

#### Manual Verification

- Temporarily change the impersonated UUID in the second assertion to a third
  value and confirm the file goes **red** — proving the guard can fail

**Implementation Note**: After completing this phase and all automated
verification passes, pause here for manual confirmation before proceeding.

---

## Phase 2: Table isolation — `channel_profiles` and `content_opportunities`

### Overview

Prove per-verb, per-role isolation on both tables, including the row-intactness
assertion that distinguishes this suite from a naive one, and assert the policy
*expressions* rather than counting policies.

### Changes Required

#### 1. Channel profile isolation

**File**: `supabase/tests/01-channel-profiles.test.sql`

**Intent**: Prove one user's profile is invisible and immutable to another, and
to an anonymous caller, across all four verbs.

**Contract**: Same transaction-and-fixtures shape as Phase 1. A creates a
profile (`niche`, `competitors` — note the table's CHECK constraint requires a
JSON array of 3–5 entries, so a shorter fixture fails for the wrong reason).
Then:

- B's `select` is empty (`is_empty`);
- B's `update` affects 0 rows;
- B's `delete` affects 0 rows;
- B's `insert` with `user_id` set to A's id raises `42501` (via `throws_ok` —
  see Critical Implementation Details);
- `anon` sees nothing and is denied all four verbs;
- **A's row is unchanged afterward** — `results_eq` on the stored `niche`;
- a second insert for the same `user_id` raises `23505`, pinning the DB-enforced
  one-profile-per-user rule that `user_id … unique` gives for free
  (`supabase/migrations/20260909213911_create_channel_profiles.sql:3`).

#### 2. Saved opportunity isolation

**File**: `supabase/tests/02-content-opportunities.test.sql`

**Intent**: Same proof for the table whose ownership shape differs — `user_id`
is not unique alone; the constraint is composite `(user_id, video_id)`.

**Contract**: A saves two opportunities. Same four-verb, three-role matrix, same
row-intactness close. Additionally:

- two users may save the **same** `video_id` without collision — proving the
  composite constraint scopes per user rather than globally;
- the same user saving the same `video_id` twice raises `23505`, which is the
  precondition for the idempotent-save branch at
  `src/pages/api/opportunities.ts:50-61`;
- B's `update` of A's row affects 0 rows. **This is the assertion that protects
  code which does not exist yet** — no route issues an UPDATE against this table;
  S-06 introduces the first one. Call this out in a comment in the file so it is
  not deleted as dead coverage.

#### 3. Policy expression assertions

**File**: `supabase/tests/03-policy-shape.test.sql`

**Intent**: Catch the failure mode where policies exist but say the wrong thing
— directly inheriting review finding F5.

**Contract**: Over `pg_policies` for both tables, assert for each of the four
verbs that a policy exists, that its `roles` include `authenticated` and **not**
`anon`, and that its `qual` (and `with_check` where applicable) contains the
`auth.uid() = user_id` ownership expression. Assert specifically that both
`UPDATE` policies carry a non-null `with_check`, since a `USING`-only update
policy is exactly the owner-reassignment hole this codebase currently does not
have. Do **not** assert a policy count — four `using(true)` policies would
satisfy that, which is the trap F5 caught.

### Success Criteria

#### Automated Verification

- `npm run test:db` exits 0 with all files reporting `ok`
- Every denied-write assertion in both table files is paired with a
  row-intactness assertion in the same file
- `npm run lint` passes

#### Manual Verification

- Run `alter policy channel_profiles_select_own on public.channel_profiles using (true);`
  against the local database, confirm the suite goes **red**, then restore it
  with `npx supabase db reset` — this is the regression the whole change exists
  to catch, and it should be seen working once

**Implementation Note**: Pause for manual confirmation before proceeding.

---

## Phase 3: Avatar bucket isolation

### Overview

Extend the same proof to the third surface — `storage.objects` rows under the
private `avatars` bucket, where ownership is carried by the object's path rather
than a column.

### Changes Required

#### 1. Storage object isolation

**File**: `supabase/tests/04-avatars-bucket.test.sql`

**Intent**: Prove a user cannot read, overwrite or delete an object under
another user's path prefix, and that the bucket is private.

**Contract**: Fixtures insert directly into `storage.objects` (the bucket row
already exists from
`supabase/migrations/20260913134159_add_channel_profile_avatar.sql:24-32`, which
is guarded by `on conflict do nothing`). **Objects must be written at
`<user_id>/<filename>`** — the policies key on `(storage.foldername(name))[1]`,
so a fixture at the bucket root would make every assertion vacuous, the
storage-layer twin of the Phase 1 oracle problem. Assertions:

- A's object is visible to A and invisible to B and to `anon`;
- B's `update` and `delete` against A's object affect 0 rows;
- B's `insert` at a path under A's prefix raises `42501` (via `throws_ok`);
- A's object is unchanged afterward;
- the `avatars` bucket row has `public = false`, pinning that there is no
  public-read path around the policies.

### Success Criteria

#### Automated Verification

- `npm run test:db` exits 0 with all five files reporting `ok`
- The fixture object paths are asserted to have the owner's UUID as their first
  path segment, so a malformed fixture fails loudly rather than silently
- `npm run lint` passes

#### Manual Verification

- Confirm the whole suite still runs clean after `npx supabase db reset`, from a
  database with no prior test residue

**Implementation Note**: Pause for manual confirmation before proceeding.

---

## Phase 4: Route-layer guards and the no-bypass scan

### Overview

The Docker-free half. Widen the Vitest scope, resolve the two virtual modules
that currently make route handlers unimportable, and prove exhaustively that
every data-touching handler rejects a sessionless caller and takes ownership
from the session.

### Changes Required

#### 1. Vitest scope and virtual-module stubs

**File**: `vitest.config.ts`, plus stub files under `src/test/stubs/`

**Intent**: Make route handlers importable under Vitest without pulling the
Astro and Cloudflare build pipelines into the test run. **This phase owns the
edit that F-04 also needs** — F-04 extends the `include` glob rather than
re-deciding the approach.

**Contract**: `include` widens to also cover `src/pages/api/**/*.test.ts` and
`src/*.test.ts` (the latter for the middleware test). `resolve.alias` maps
`astro:env/server`, `cloudflare:workers` and `astro:middleware` to local stub
modules. The `astro:env/server` stub exports `SUPABASE_URL`, `SUPABASE_KEY`,
`YOUTUBE_API_KEY` and `ANTHROPIC_API_KEY` — the four fields declared in
`astro.config.mjs:19-22`, all `optional: true`. Keep the existing comment in
`vitest.config.ts` accurate: it currently explains why the scope was narrow, and
that rationale no longer holds.

#### 2. The route guard table

**File**: `src/pages/api/routes.test.ts`

**Intent**: Prove, one case per handler, that a caller with no session gets a
401 carrying no user data. Exhaustiveness *is* the value here —
`test-plan.md` §2 names "testing one representative route and assuming the rest
follow" as the anti-pattern for this risk.

**Contract**: A table of the seven data-touching handlers —
`POST /api/analyze`, `POST /api/profile`, `POST` and `DELETE /api/opportunities`,
`POST` and `DELETE /api/avatar`, `POST /api/avatar/generate` — each invoked with
`locals.user` null. Each case asserts status 401 and that the parsed body has
only the `error` key, matching the `jsonError` envelope in `src/lib/http.ts`.
The 401 check is the first statement in every handler, so no Supabase client is
constructed and no stub is needed for these cases.

#### 3. Ownership derivation

**File**: `src/pages/api/routes.test.ts` (same file)

**Intent**: Prove a client-planted owner field cannot redirect a write, closing
the vector `test-plan.md` §2 calls "the real shape of risk #4."

**Contract**: For the two handlers that read a JSON body — `POST /api/profile`
and `POST /api/opportunities` — invoke with a session for user A and a body
carrying an extra `user_id` set to a stranger's UUID, with `@/lib/supabase`
module-mocked so `createClient` returns a recording fake. Assert the row handed
to `insert` carries A's id. For `opportunities`, note that
`src/pages/api/opportunities.ts:43` spreads the parsed body *before* setting
`user_id`, so the session value wins by construction — the test pins that
ordering. The remaining five handlers read no owner field at all (`analyze` and
`avatar/generate` read no body; `avatar` POST reads raw bytes); the table should
carry an explicit `n/a` with that reason rather than silently omitting them.

#### 4. Stranger-delete response shape

**File**: `src/pages/api/routes.test.ts` (same file)

**Intent**: Pin the deliberate choice at `src/pages/api/opportunities.ts:99-103`
to answer `404` rather than `403` for another user's row, so the route never
confirms a stranger's id exists. This reads like a bug and would be "fixed" by a
well-meaning contributor.

**Contract**: With the Supabase client faked to return an empty array from the
double-scoped delete (the shape RLS produces for a stranger's row), assert the
response is 404 and its body does not distinguish "someone else's row" from
"already deleted."

#### 5. Session resolution pin

**File**: `src/middleware.test.ts`

**Intent**: Pin that `locals.user` comes from `supabase.auth.getUser()` — a
round trip that verifies the JWT — and not from `getSession()`, which trusts a
locally decoded cookie. One assertion protects all seven route guards.

**Contract**: With `@/lib/supabase` mocked, run the middleware and assert
`getUser` was called and `getSession` was not, and that `locals.user` is null
when the client returns no user. Include a comment naming why this asserts on a
call rather than on behaviour: a `getSession()` swap is invisible at the
behavioural level but silently makes every route trust an unverified token.

#### 6. No-service-role-client scan

**File**: `src/lib/no-privileged-client.test.ts`

**Intent**: Pin the invariant the entire plan rests on. If a service-role client
ever appears, RLS drops from *guarantee* to *decoration* and every pgTAP
assertion in Phases 1–3 stops describing production.

**Contract**: Walk `src/**` and fail on `service_role`, `serviceRole` or
`auth.admin`, and on any `createServerClient` / `createClient` call from
`@supabase/ssr` or `@supabase/supabase-js` outside `src/lib/supabase.ts`. Skip
this test file itself and the stub directory. The file needs a header comment
explaining why a grep-shaped test exists — it will otherwise look like a mistake
to the next reader, and it mirrors the invariant already stated in prose at
`src/lib/services/avatar-storage.ts:14-16`.

### Success Criteria

#### Automated Verification

- `npm test` exits 0 and reports the five pre-existing service test files plus
  the new route, middleware and scan files
- The route table covers exactly seven handler entries, matching the inventory
  in `research.md` §2
- `npm run lint` passes
- `npm run build` succeeds — confirming the `vitest.config.ts` changes did not
  disturb the Astro build

#### Manual Verification

- Temporarily delete the `if (!context.locals.user)` guard from one handler and
  confirm `npm test` goes **red** for that handler only
- Temporarily add a `const admin = createClient(url, SERVICE_ROLE_KEY)` line in a
  scratch file under `src/lib/` and confirm the scan test goes red, then remove it

**Implementation Note**: Pause for manual confirmation before proceeding.

---

## Phase 5: Gate wiring and cookbook

### Overview

Make the suites findable and the gate explicit, and pay the documentation debt
the roadmap lists under F-03's "Unlocks." Deliberately thin — it locks a floor
the earlier phases built.

### Changes Required

#### 1. Local gate

**File**: `CLAUDE.md`

**Intent**: State that `npm run test:db` is required locally before any change
under `supabase/migrations/` lands, and record why it is not in CI.

**Contract**: A short subsection under the existing Supabase-migrations
convention. Names the Docker prerequisite, the command, and the one-line reason
CI placement is deferred (a cold runner pays a full ~13-image pull; the decision
belongs to `test-plan.md` §3 Phase 4).

#### 2. Cookbook entries

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the two `TBD` entries this change exists to fill, and record
the scope boundary that was decided rather than discovered.

**Contract**: §6.3 gains the per-owner isolation pattern — file location, the
transaction-and-fixtures shape, the `throws_ok`-for-denied-inserts rule, and the
requirement that every denied write be paired with a row-intactness assertion.
§6.4 gains the route pattern — the table-driven shape, the virtual-module
aliases, and the ownership-from-session assertion. §7 gains the avatar
signed-URL exclusion with its reason. §3's Phase 2 row moves to a completed
status with `provable-user-isolation` as its change folder. §5's `database
policy tests` gate row is annotated as wired-locally.

#### 3. Roadmap sync

**File**: `context/foundation/roadmap.md`

**Intent**: Close F-03 and record that its one open unknown is now evidenced
rather than open.

**Contract**: F-03's status advances, and its Unknowns entry is rewritten to
state the measured position: local costs nothing and works today, CI costs a
full image pull per cold runner in a job needing its own definition, and the
placement decision now sits with `test-plan.md` §3 Phase 4.

### Success Criteria

#### Automated Verification

- `npm test` and `npm run test:db` both exit 0
- `npm run lint` and `npm run build` pass
- No `TBD — see §3 Phase 2` string remains in `context/foundation/test-plan.md`

#### Manual Verification

- A reader who was not part of this change can follow §6.3 alone to add an
  isolation test for a hypothetical new table, without reading the plan
- The F-03 roadmap entry reads as discharged, and its Unknowns entry no longer
  reads as an open question

---

## Testing Strategy

### Database policy tests (pgTAP, `supabase/tests/`)

- Four verbs × three roles × three surfaces, run per file in a rolled-back
  transaction with fixtures created in-transaction
- Every denied write paired with a row-intactness assertion — the assertion
  `test-plan.md` §2 insists on
- Policy **expressions** asserted, never policy counts (review finding F5)
- The oracle guard runs first and is the precondition for all of it

### Route tests (Vitest, `src/pages/api/`)

- Table-driven, one case per data-touching handler, no database
- 401-with-no-data for all seven; ownership-from-session for the two that read a
  body; the 404-not-403 shape for the one that takes a client id
- One middleware test pinning `getUser()` over `getSession()`
- One source scan pinning the no-service-role-client invariant

### Manual Testing Steps

1. With the local stack running, `npm run test:db` — expect `Result: PASS`
2. `npm test` — expect all files green, including the three new ones
3. Break a policy (`alter policy … using (true)`), re-run `npm run test:db`,
   confirm red, then `npx supabase db reset`
4. Remove one handler's 401 guard, re-run `npm test`, confirm red for that
   handler only, then restore
5. `npx supabase db reset && npm run test:db` from a clean database, confirming
   the suite has no hidden dependency on accumulated local state

## Performance Considerations

Negligible. The pgTAP suite runs entirely in-transaction against an already-warm
local Postgres — the planning probe completed in 0.02s CPU. The route tests add
no database and no network. The one thing to watch is `npm test` start-up time:
the `resolve.alias` approach was chosen over `getViteConfig()` specifically to
keep the Astro and Cloudflare adapter pipelines out of the currently-instant
service test run.

## Migration Notes

No migration is added, and no production behaviour changes. The `pgtap`
extension does not need to be installed or declared — it is created inside each
test file's transaction and rolls back with it, verified during planning.
`supabase/tests/` is new and touched by nothing else.

## References

- Research: `context/changes/provable-user-isolation/research.md`
- Roadmap element: `context/foundation/roadmap.md` — F-03
- Risk definitions and gates: `context/foundation/test-plan.md` §2 (#3, #4),
  §3 Phase 2, §5, §6.3/§6.4, §7
- **The caught weak criterion this plan inherits**:
  `context/archive/2026-09-13-save-and-view-opportunities/reviews/plan-review.md:80-87`
- The scripted five-assertion protocol being ported:
  `context/archive/2026-09-13-save-and-view-opportunities/plan.md:356-360`
- The `/api/*` self-guard rule's origin:
  `context/archive/2026-09-09-channel-profile-crud/reviews/impl-review.md:115-123`
- Policy definitions: `supabase/migrations/20260909213911_create_channel_profiles.sql:11-28`,
  `20260913134159_add_channel_profile_avatar.sql:43-73`,
  `20260913160933_create_content_opportunities.sql:34-51`
- Route inventory: `src/pages/api/` — seven data-touching handlers; guards at
  `analyze.ts:49-51`, `profile.ts:32-34`, `opportunities.ts:19-21,71-73`,
  `avatar.ts:27-29,68-70`, `avatar/generate.ts:25-27`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: pgTAP harness and the oracle guard

#### Automated

- [x] 1.1 `npm run test:db` exits 0 and reports `Result: PASS`
- [x] 1.2 The harness file reports its full planned assertion count, with no skipped tests
- [x] 1.3 `git status --porcelain` shows no stray files under `supabase/`
- [x] 1.4 `npm run lint` passes

#### Manual

- [x] 1.5 Changing the impersonated UUID makes the guard go red

### Phase 2: Table isolation — `channel_profiles` and `content_opportunities`

#### Automated

- [ ] 2.1 `npm run test:db` exits 0 with all files reporting `ok`
- [ ] 2.2 Every denied-write assertion is paired with a row-intactness assertion
- [ ] 2.3 `npm run lint` passes

#### Manual

- [ ] 2.4 A `using (true)` policy makes the suite go red; restored via `db reset`

### Phase 3: Avatar bucket isolation

#### Automated

- [ ] 3.1 `npm run test:db` exits 0 with all five files reporting `ok`
- [ ] 3.2 Fixture object paths asserted to carry the owner UUID as first path segment
- [ ] 3.3 `npm run lint` passes

#### Manual

- [ ] 3.4 Suite runs clean after `npx supabase db reset`

### Phase 4: Route-layer guards and the no-bypass scan

#### Automated

- [ ] 4.1 `npm test` exits 0 including the new route, middleware and scan files
- [ ] 4.2 The route table covers exactly seven handler entries
- [ ] 4.3 `npm run lint` passes
- [ ] 4.4 `npm run build` succeeds

#### Manual

- [ ] 4.5 Removing one handler's 401 guard makes only that handler's case red
- [ ] 4.6 A scratch service-role client makes the scan test red

### Phase 5: Gate wiring and cookbook

#### Automated

- [ ] 5.1 `npm test` and `npm run test:db` both exit 0
- [ ] 5.2 `npm run lint` and `npm run build` pass
- [ ] 5.3 No `TBD — see §3 Phase 2` string remains in `context/foundation/test-plan.md`

#### Manual

- [ ] 5.4 §6.3 is followable standalone for a hypothetical new table
- [ ] 5.5 F-03 reads as discharged and its Unknowns entry reads as evidenced
