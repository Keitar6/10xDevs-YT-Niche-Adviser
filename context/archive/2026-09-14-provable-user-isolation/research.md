---
date: 2026-09-14T00:04:31+02:00
researcher: Mateusz
git_commit: abedb5947fc9e0034eaf0341e14bd23f650f2845
branch: master
repository: 10xDevs-YT-Niche-Adviser
topic: "Provable user isolation — the real access-control surface across tables, the avatar bucket, and every data-touching route"
tags: [research, codebase, rls, supabase, pgtap, access-control, api-routes, storage, F-03]
status: complete
last_updated: 2026-09-14
last_updated_by: Mateusz
---

# Research: Provable user isolation

**Date**: 2026-09-14T00:04:31+02:00 (CEST)
**Researcher**: Mateusz
**Git Commit**: `abedb5947fc9e0034eaf0341e14bd23f650f2845`
**Branch**: `master` (in sync with `origin/master` — permalinks below resolve)
**Repository**: `Keitar6/10xDevs-YT-Niche-Adviser`

## Research Question

Ground roadmap element **F-03 / `provable-user-isolation`**: what is the actual
access-control surface of this project — per table, per verb, per role, across
the two tables, the avatar storage bucket, and every data-touching route — and
what would it take to prove it by automated test rather than by assertion?

Scope confirmed with the user before the sweep: **full F-03 surface** (both
tables + bucket + complete route inventory + privileged-key audit), and the
pgTAP harness **verified by actually running it**, not assessed on paper.

Covers `test-plan.md` §2 risk **#3** (cross-user read/modify/delete) and risk
**#4** (unauthenticated or cross-caller route access), and the roadmap's
scope anchors **MS-01** and **MS-03**.

## Summary

**The headline is not what the risk map assumed.** `test-plan.md` §2 frames
risk #3 around policies that may be missing per verb, roles that carry
different grants, and a possible privileged bypass. The sweep found none of
those defects. What it found instead is that the guarantee is **correct today
and enforced entirely by developer discipline**, with nothing mechanical
preventing the next migration from silently undoing it.

Four findings define the shape of the work:

1. **The database really is the enforcement layer.** There is no service-role
   client anywhere in the repository — every one of the 13 Supabase client
   construction sites resolves to a single cookie-scoped factory using the
   anon key. This is the load-bearing precondition for the whole plan: it
   means pgTAP tests exercise the actual boundary, not a decoy that
   application code routinely bypasses.

2. **The policy set is complete and, on inspection, correct.** Twelve
   policies — four verbs × three surfaces (`channel_profiles`,
   `content_opportunities`, the `avatars` bucket's `storage.objects` rows) —
   all scoped `to authenticated` with `auth.uid()` ownership. Critically,
   **every UPDATE policy carries both a `USING` and a `WITH CHECK` clause**,
   so the owner-reassignment vector (`UPDATE ... SET user_id = <stranger>`)
   does not exist. No policy was ever dropped, altered, or recreated across
   the four migrations.

3. **The harness works today, with zero setup.** This was verified
   empirically, not inferred: a throwaway pgTAP probe was written, run via
   `npx supabase test db` against the already-running local stack, and passed
   (`Result: PASS`) before being deleted. The only cost was a one-time pull of
   the `pg_prove:3.36` image, now cached.

4. **Nothing has ever proven this by machine.** Every prior isolation claim
   across four migrations was manual curl or scripted curl, run locally, never
   in CI — and one production verification criterion was formally downgraded
   to "won't-do" after the fact.

**Therefore F-03 is a pinning job, not a remediation job.** The plan should not
be written as "find and fix the isolation holes." It should be written as
"convert a correct-by-discipline invariant into a mechanically enforced one,
and pin the three structural seams where it could silently regress." That
reframing changes what the phases look like and what success means.

The three structural seams, ranked, are: `anon` isolation resting on policy
_absence_ against Supabase's implicit Data-API grants with no `REVOKE`
backstop; the absence of `FORCE ROW LEVEL SECURITY` on both tables; and the
avatar signed-URL read path, which sits outside anything a DB-level suite can
reach.

## Detailed Findings

### 1. Database policy surface — complete, per verb, per role

Verified directly (`grep -c "create policy"`): **12 policies across three
migrations**, zero in the fourth.

| Migration                                         | `create policy` count |
| ------------------------------------------------- | --------------------- |
| `20260909213911_create_channel_profiles.sql`      | 4                     |
| `20260912190947_competitors_as_objects.sql`       | **0**                 |
| `20260913134159_add_channel_profile_avatar.sql`   | 4                     |
| `20260913160933_create_content_opportunities.sql` | 4                     |

#### `public.channel_profiles`

RLS enabled at `supabase/migrations/20260909213911_create_channel_profiles.sql:11`.
Not `FORCE`d (see §5).

| Verb   | `anon`                               | `authenticated`                                                                                  |
| ------ | ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| SELECT | **no policy** → default-deny, 0 rows | `channel_profiles_select_own`, `USING auth.uid() = user_id` (`:13-15`)                           |
| INSERT | **no policy** → denied               | `channel_profiles_insert_own`, `WITH CHECK auth.uid() = user_id` (`:17-19`)                      |
| UPDATE | **no policy** → denied               | `channel_profiles_update_own`, **`USING` + `WITH CHECK`** both `auth.uid() = user_id` (`:21-24`) |
| DELETE | **no policy** → denied               | `channel_profiles_delete_own`, `USING auth.uid() = user_id` (`:26-28`)                           |

Ownership column (`:3`):
`user_id uuid not null unique default auth.uid() references auth.users (id) on delete cascade`.
The bare `unique` means **the database itself enforces the PRD's
one-profile-per-user assumption** — not merely application code. A second
INSERT for the same `user_id` raises a unique violation regardless of role,
_before_ RLS is even consulted. That is a cheap, high-value assertion.

#### `public.content_opportunities`

RLS enabled at `supabase/migrations/20260913160933_create_content_opportunities.sql:34`.
Identical four-policy shape: `:36-38` (SELECT), `:40-42` (INSERT), `:44-47`
(UPDATE, both clauses), `:49-51` (DELETE). `anon` has no policy for any verb.

Ownership differs deliberately: `user_id` (`:11`) is **not** unique alone; the
constraint is composite `unique (user_id, video_id)` (`:31`) — one save per
video per user, many rows per user. Both FKs cascade on `auth.users` deletion.

**The UPDATE policy here currently has no caller.** No route in the codebase
issues an UPDATE against `content_opportunities`; S-06
(`opportunity-status-transitions`) is what introduces one. This is exactly the
sequencing the roadmap claims at `context/foundation/roadmap.md:87` — F-03
proves the ownership guarantee on that write path _before_ the path has a
caller. Worth stating plainly in the plan, because it is the one assertion in
the suite that protects code that does not exist yet.

#### The `avatars` storage bucket

Created in `supabase/migrations/20260913134159_add_channel_profile_avatar.sql:24-32`:
`public = false`, 2 MiB limit (`2097152`), mime allow-list
`image/png, image/jpeg, image/webp`, guarded by `on conflict (id) do nothing`.
**Private bucket — there is no public-read gap.**

Four `storage.objects` policies, all carrying the identical ownership
expression, quoted verbatim because the tests must reproduce it exactly:

```
bucket_id = 'avatars' and (select auth.uid()::text) = (storage.foldername(name))[1]
```

`avatars_select_own` (`:43-48`), `avatars_insert_own` (`:50-55`),
`avatars_update_own` (`:57-66`, both `USING` and `WITH CHECK`),
`avatars_delete_own` (`:68-73`). Ownership is **the first path segment**, so
test objects must be written at `<user_id>/<filename>`.

Note `storage.objects` itself is not `ENABLE ROW LEVEL SECURITY`'d by these
migrations — that is a Supabase platform default, outside project control, and
therefore something the suite should assert rather than assume.

#### What the migrations do _not_ contain

Swept and confirmed empty (`grep` across all four files, zero hits):
`FORCE ROW LEVEL SECURITY`, any `GRANT`, any `REVOKE`, any `SECURITY DEFINER`,
any `CREATE VIEW`. The only function is `public.set_updated_at()`
(`20260909213911_create_channel_profiles.sql:30-43`) — `SECURITY INVOKER` by
default, touches only `NEW.updated_at`, reads nothing. **No bypass object
exists.**

#### Migration drift — a confirmed non-finding

`test-plan.md` §2 cites "the owner-scoped policy pattern was replicated across
two tables and a storage bucket in four separate migrations" as evidence for
risk #3. The sweep looked specifically for drift and found none.
`20260912190947_competitors_as_objects.sql` swapped
`competitor_channel_ids text[]` → `competitors jsonb` with a 3–5 length CHECK
(`:36-41`) and touched **no** policy, documenting why in its own trailing
comment (`:43-44`):

> `-- RLS is unchanged: all four policies in 20260909213911_create_channel_profiles.sql`
> `-- are row-scoped on user_id and are unaffected by a column swap.`

That reasoning is correct. But it is a _comment_, verified by a human reading
it — which is precisely the class of guarantee F-03 exists to replace.

### 2. Route and session surface — exhaustive inventory

Every handler under `src/pages/api/`, plus the two server-rendered pages that
read user data in frontmatter.

| Route (verb)                                                                                | Handler                               | Session guard                               | No-session     | Ownership source                                                 |
| ------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------- | -------------- | ---------------------------------------------------------------- |
| `POST /api/analyze`                                                                         | `src/pages/api/analyze.ts:46`         | `:49-51`                                    | 401, no leak   | session — `.eq("user_id", locals.user.id)` `:80`                 |
| `POST /api/profile`                                                                         | `src/pages/api/profile.ts:31`         | `:32-34`                                    | 401, no leak   | session — `user_id: locals.user.id` `:100`                       |
| `POST /api/opportunities`                                                                   | `src/pages/api/opportunities.ts:16`   | `:19-21`                                    | 401, no leak   | session — `:43`, body schema has no `user_id`                    |
| `DELETE /api/opportunities`                                                                 | `src/pages/api/opportunities.ts:70`   | `:71-73`                                    | 401, no leak   | session — double-scoped `.eq("id", …).eq("user_id", …)` `:91-92` |
| `POST /api/avatar`                                                                          | `src/pages/api/avatar.ts:24`          | `:27-29`                                    | 401, no leak   | session — `replaceAvatar(supabase, locals.user.id, …)` `:58`     |
| `DELETE /api/avatar`                                                                        | `src/pages/api/avatar.ts:67`          | `:68-70`                                    | 401, no leak   | session — `clearAvatar(supabase, locals.user.id)` `:77`          |
| `POST /api/avatar/generate`                                                                 | `src/pages/api/avatar/generate.ts:24` | `:25-27`                                    | 401, no leak   | session — `:56`, `:78`                                           |
| `POST /api/auth/{signin,signup,signout}`, `POST /api/auth/google`, `GET /api/auth/callback` | `src/pages/api/auth/*`                | n/a — auth surface, establishes the session | 400 / redirect | n/a                                                              |
| `GET /dashboard` (page)                                                                     | `src/pages/dashboard.astro:6-9`       | **none in-page** — middleware only          | n/a            | session — `loadSavedOpportunities(…, user.id)` `:8`              |
| `GET /` (via `Topbar.astro:18-20`)                                                          | `src/components/Topbar.astro`         | conditional render, `/` is public           | n/a            | session — `loadChannelProfile(…, user.id)` `:19`                 |

**Every data-touching API handler carries its own 401 guard**, each with a
comment restating why (`PROTECTED_ROUTES` covers pages only). **No route
anywhere accepts a client-supplied `user_id` or owner field.** The single route
that takes a client id — `DELETE /api/opportunities?id=` — uses it only as a
row selector _inside_ a session-scoped filter, and returns `404` rather than
`403` for a stranger's row, deliberately declining to confirm existence
(`src/pages/api/opportunities.ts:99-103`).

The ownership-bypass vector that `test-plan.md` §2 names as risk #4's real
shape ("a route taking an owner identifier from the request body") **does not
exist in this codebase**. Risk #4's value is therefore entirely in
_exhaustiveness and regression-safety_, not in finding a current hole — which
matches the anti-pattern the test plan already warns about ("Testing one
representative route and assuming the rest follow").

#### Middleware

```
src/middleware.ts:4    const PROTECTED_ROUTES = ["/dashboard"];
src/middleware.ts:18   if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
```

`CLAUDE.md`'s claim that this never covers `/api/*` was **verified against the
code, not repeated**: the array holds exactly one entry, `/dashboard`, and
`/api/...` cannot start with it.

`locals.user` is populated at `src/middleware.ts:6-16` via
**`supabase.auth.getUser()`, not `getSession()`** — a round trip that verifies
the JWT against the auth server rather than trusting a locally decoded cookie.
There is no code path that sets `locals.user` from anything else. This is the
safe choice and should be pinned, because a future swap to `getSession()` would
silently make every route's guard trust an unverified token.

#### Privileged-key audit — the load-bearing negative result

Repo-wide sweep for `SERVICE_ROLE`, `service_role`, `serviceRole`, `auth.admin`,
`createClient(`, `createServerClient`, `persistSession`:

- All 13 client construction sites resolve to the single factory at
  `src/lib/supabase.ts:6-24`, which reads `SUPABASE_URL` / `SUPABASE_KEY` from
  `astro:env/server` (`:3`), both declared `context: "server", access: "secret"`
  in `astro.config.mjs:19-20`, and builds a `createServerClient` wired to the
  request's cookies (`:10-23`).
- `.env.example:6` documents `SUPABASE_KEY=<supabase-anon-key>` — the **anon**
  key.
- **Zero hits** for any service-role or admin client, anywhere.
- `src/lib/services/avatar-storage.ts:14-16` states the invariant in a comment
  and the code matches it: `replaceAvatar` / `clearAvatar` take `supabase` as a
  parameter and never construct their own client.

No React island under `src/components/` imports Supabase — the only hit is
`Topbar.astro`, which renders server-side. All data access is server-side
through cookie-scoped clients.

**This single result is what makes the whole plan worth writing.** The test
plan's challenge line — _"the application always filters by owner, so the
database policy is belt-and-braces — that inverts which layer is the
guarantee"_ — resolves cleanly here: RLS **is** the guarantee, and the app's
explicit `.eq("user_id", …)` filters are the belt-and-braces, documented as
such at `src/pages/api/analyze.ts:73-76` ("relying on RLS alone hides the
intent").

### 3. Harness feasibility — verified by running it

Not assessed on paper. The probe ran:

```
$ npx supabase test db
Connecting to local database...
supabase/tests/_probe.test.sql .. ok
All tests successful.
Files=1, Tests=1,  0 wallclock secs ( 0.02 usr +  0.00 sys =  0.02 CPU)
Result: PASS
```

Environment: Docker 29.7.2, 12 containers healthy, `supabase_db_…` on
`postgres:17.6.1.165` up 6 hours; `DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres`;
Supabase CLI 2.116.0 (already a devDependency); Node v22.23.2.

Three facts the plan can rely on:

- **No `enable pgtap` migration is required.** After the probe,
  `select extname from pg_extension where extname='pgtap'` returned 0 rows —
  the extension is created transactionally per run and rolls back with the
  test's own `begin/rollback`. A migration is optional, for editor
  introspection only.
- **The `supabase/tests/database/` subfolder is a docs convention, not a CLI
  requirement.** The probe passed from the tests root.
- **One-time cost already paid**: the `pg_prove:3.36` image is now cached
  locally.

The probe file and its directory were removed; `git status --porcelain` shows
only this change folder.

Current test wiring, for contrast — `vitest.config.ts` in full:

```ts
export default defineConfig({
  test: { include: ["src/lib/services/**/*.test.ts"] },
});
```

`npm test` can never see a route test outside `src/lib/services/`. **Risk #4's
route tests require widening this glob**, which is the same edit F-04
(`testing-analyze-boundary-resilience`) needs — a coordination point between
two parallel roadmap elements, both of which will want to touch this one file.

#### CI: yes-with-steps, not blocked

`.github/workflows/ci.yml` has one `ubuntu-latest` job: checkout → setup-node 22
→ `npm ci` → `npx astro sync` → `npm run lint` → `npm test` → `npm run build` →
conditional `wrangler-action` deploy on master. Docker is present on
`ubuntu-latest`, but **nothing starts a Supabase stack**. Wiring it needs
`npx supabase start` → `supabase test db` → `supabase stop`, and every cold
runner pays a full ~13-image ECR pull with no layer cache by default. Feasible,
but it belongs in its own job rather than folded into the existing one, which
has a different secret surface.

This is the evidence the roadmap's open unknown was waiting for
(`context/foundation/roadmap.md:92`): **local is free today; CI is a real but
bounded cost.** The decision is still the user's, but it is no longer
uninformed.

#### pgTAP authoring API (Context7, `/supabase/supabase`, current docs)

Impersonation, the minimal built-in form — no extra extension:

```sql
set local role anon;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
```

Assertions: `throws_ok(query, sqlstate, message, description)` for expected
denials, plus `results_eq`, `results_ne`, `is_empty`, `lives_ok`.

An optional richer tier exists — `tests.create_supabase_user()`,
`tests.get_supabase_uid()`, `tests.authenticate_as()` — from the community
`basejump-supabase_test_helpers` extension, but it drags in a `pg_tle` →
`pgsql-http` → `dbdev` install chain plus a `000-setup-tests-hooks.sql`
pre-test file. Convenience at the cost of a dependency chain; a genuine plan
decision, not a default.

### 4. What prior changes already decided (and deferred)

The four-policy pattern was not reinvented three times — it was established
once and deliberately replicated:

- **Origin.** `context/archive/2026-09-09-channel-profile-data-model/plan.md:19,58,73-90`
  establishes four granular per-operation policies, `to authenticated`,
  `auth.uid() = user_id`, with `user_id` unique + `default auth.uid()` + FK
  cascade — citing FR-002 and the CLAUDE.md granular-policy convention.
- **The "no pgTAP" decision, day one.** Same plan, `:34`: _"No pgTAP or other
  automated test framework — this repo has no test runner yet; verification is
  manual."_ Every subsequent slice inherited this.
- **The API self-guard rule was born from a review finding.**
  `context/archive/2026-09-09-channel-profile-crud/reviews/impl-review.md:115-123`
  (F8) elevated "every `/api/*` route touching user data must self-check
  `context.locals.user`" from accident to hard rule — and fixed `CLAUDE.md`
  rather than the code, because the code was already correct. That rule is now
  `CLAUDE.md:24`.
- **Storage ownership, and an explicit no-service-role commitment.**
  `context/archive/2026-09-13-channel-profile-avatar/plan.md:25,30,66-74` —
  private bucket, four path-scoped policies, `avatar_path` not `avatar_url`
  ("private buckets are read via `createSignedUrl`, which expires; a persisted
  URL would rot"), bucket defined in SQL not `config.toml` so local and hosted
  match.

Three deferrals are the highest-value finds, because they are precisely what
F-03 discharges:

1. **Production isolation was never verified live.**
   `context/archive/2026-09-13-channel-profile-avatar/plan.md:414` leaves
   criterion 5.4 unchecked, and `change.md:62-66` records it as _"won't-do,
   accepted by the user"_ — the hosted policies were dumped and byte-compared
   to local instead. A reader of the plan alone would believe otherwise.
2. **No regression guard, stated outright.**
   `context/archive/2026-09-13-save-and-view-opportunities/plan-brief.md:97-98`:
   _"No regression guard on RLS. The isolation protocol is scripted but not
   part of CI, so a future migration that weakens a policy would not be caught
   automatically."_
3. **CI was assumed green for every isolation-bearing migration, and was not
   running at all.** `context/archive/2026-09-13-channel-profile-avatar/change.md:55-90`
   discovered the repo (a fork) had **zero workflow runs ever**, Actions
   disabled by default — meaning "CI is green" had been assumed, never
   observed, through all four migrations. Later fixed.

**The most useful precedent of all** is a caught weak test.
`context/archive/2026-09-13-save-and-view-opportunities/reviews/plan-review.md:80-87`
(F5) rejected a verification criterion that asserted only _"`pg_policies`
returns 4 rows for the table"_ — noting that **four `using(true)` policies would
also satisfy it**. The fix asserted the actual `qual` / `with_check`
expressions contain `auth.uid() = user_id`, and added the cross-user PATCH
case that the original read+delete protocol had left unproven. The F-03 suite
must inherit both corrections, and the plan should cite F5 rather than
rediscover it.

The strongest existing protocol, worth porting into pgTAP rather than
replacing, is the scripted five-assertion curl sequence at
`context/archive/2026-09-13-save-and-view-opportunities/plan.md:216,356-360`:
save by A → B's list empty → B's DELETE of A's row returns 404 → **B's PATCH of
A's row affects 0 rows** → **A's row is unchanged afterward**. That last
assertion is the one `test-plan.md` §2 insists on and that most naive suites
omit.

## Code References

Permalinks pinned to `abedb59`.

- [`src/middleware.ts:4,18`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/abedb5947fc9e0034eaf0341e14bd23f650f2845/src/middleware.ts#L4) — `PROTECTED_ROUTES = ["/dashboard"]`, matched with `startsWith`
- [`src/middleware.ts:6-16`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/abedb5947fc9e0034eaf0341e14bd23f650f2845/src/middleware.ts#L6-L16) — `locals.user` from `getUser()`, not `getSession()`
- [`src/lib/supabase.ts:6-24`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/abedb5947fc9e0034eaf0341e14bd23f650f2845/src/lib/supabase.ts#L6-L24) — the only Supabase client factory; cookie-scoped, anon key
- [`astro.config.mjs:19-20`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/abedb5947fc9e0034eaf0341e14bd23f650f2845/astro.config.mjs#L19-L20) — `SUPABASE_URL` / `SUPABASE_KEY` as server-only secrets
- [`supabase/migrations/20260909213911_create_channel_profiles.sql:3`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/abedb5947fc9e0034eaf0341e14bd23f650f2845/supabase/migrations/20260909213911_create_channel_profiles.sql#L3) — `user_id … unique default auth.uid()` — DB-enforced one-profile-per-user
- [`…20260909213911…:11-28`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/abedb5947fc9e0034eaf0341e14bd23f650f2845/supabase/migrations/20260909213911_create_channel_profiles.sql#L11-L28) — RLS enable + the four canonical policies
- [`…20260909213911…:30-43`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/abedb5947fc9e0034eaf0341e14bd23f650f2845/supabase/migrations/20260909213911_create_channel_profiles.sql#L30-L43) — `set_updated_at()`, SECURITY INVOKER, no bypass
- [`supabase/migrations/20260912190947_competitors_as_objects.sql:43-44`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/abedb5947fc9e0034eaf0341e14bd23f650f2845/supabase/migrations/20260912190947_competitors_as_objects.sql#L43-L44) — the "RLS is unchanged" comment: correct, but human-verified only
- [`supabase/migrations/20260913134159_add_channel_profile_avatar.sql:24-32`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/abedb5947fc9e0034eaf0341e14bd23f650f2845/supabase/migrations/20260913134159_add_channel_profile_avatar.sql#L24-L32) — private `avatars` bucket definition
- [`…20260913134159…:43-73`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/abedb5947fc9e0034eaf0341e14bd23f650f2845/supabase/migrations/20260913134159_add_channel_profile_avatar.sql#L43-L73) — the four `storage.objects` policies, path-segment ownership
- [`supabase/migrations/20260913160933_create_content_opportunities.sql:31,34-51`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/abedb5947fc9e0034eaf0341e14bd23f650f2845/supabase/migrations/20260913160933_create_content_opportunities.sql#L31) — composite unique + the four policies
- [`src/pages/api/opportunities.ts:40-43,91-103`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/abedb5947fc9e0034eaf0341e14bd23f650f2845/src/pages/api/opportunities.ts#L40-L43) — "user_id comes from the session, never from the body"; double-scoped delete returning 404
- [`src/pages/api/analyze.ts:49-51,73-80`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/abedb5947fc9e0034eaf0341e14bd23f650f2845/src/pages/api/analyze.ts#L49-L51) — 401 guard; the "relying on RLS alone hides the intent" rationale
- [`src/lib/services/avatar-storage.ts:14-16`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/abedb5947fc9e0034eaf0341e14bd23f650f2845/src/lib/services/avatar-storage.ts#L14-L16) — "must never acquire a service-role client"
- [`src/pages/dashboard.astro:6-9`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/abedb5947fc9e0034eaf0341e14bd23f650f2845/src/pages/dashboard.astro#L6-L9) — the one data-reading page with no in-page guard
- [`vitest.config.ts`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/abedb5947fc9e0034eaf0341e14bd23f650f2845/vitest.config.ts) — `include` scoped to `src/lib/services/**/*.test.ts`
- [`.github/workflows/ci.yml`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/abedb5947fc9e0034eaf0341e14bd23f650f2845/.github/workflows/ci.yml) — single job, no Supabase stack

## Architecture Insights

**The guarantee is single-layered by design, and that is a deliberate choice
this project made and documented.** Because no service-role client exists, RLS
is not defence-in-depth — it is the only thing standing between two users.
Application-level `.eq("user_id", …)` filters exist to make intent legible, not
to enforce. Any future change that introduces a service-role client silently
demotes RLS from guarantee to decoration, which makes "no service-role client
exists" itself an invariant worth asserting mechanically.

**Correctness here is carried by comments and review discipline.** Three
separate migrations reproduce the same four-policy shape; the one migration
that could have broken it explains in prose why it did not. F5 shows the
discipline working — a reviewer caught a criterion that would have passed four
`using(true)` policies. F-03's real product is turning that reviewer into a
test.

**Isolation for `anon` is an absence, not a statement.** There is no `REVOKE`
anywhere, and `supabase/config.toml:13` exposes `public` via PostgREST with
Supabase's implicit Data-API grants for `anon` / `authenticated` /
`service_role`. So `anon` gets zero rows purely because no policy matches. A
single careless `for select using (true)` — the shape a future "public profile"
feature would reach for — reopens everything with no second layer. This is the
highest-value thing the suite can pin, and it is _not_ what the risk map
predicted it would find.

**Route-layer and DB-layer tests want different homes.** Risk #3 is a pgTAP
suite under `supabase/tests/`, run by `supabase test db`, needing Docker. Risk
#4 is table-driven handler tests under Vitest, needing no database at all —
but needing the `vitest.config.ts` glob widened, the same edit F-04 will want.
Treating them as one phase would couple a Docker-gated suite to a
Docker-free one.

## Historical Context (from prior changes)

- `context/archive/2026-09-09-channel-profile-data-model/plan.md:19,34,58,73-90,152-153` — origin of the four-policy pattern; the "no pgTAP, manual verification" decision; the original two-user PostgREST protocol (select + insert only, no cross-user UPDATE/DELETE)
- `context/archive/2026-09-09-channel-profile-crud/plan.md:39` — two-user RLS re-testing explicitly declined for that slice, on the grounds the data-model change already proved it
- `context/archive/2026-09-09-channel-profile-crud/reviews/impl-review.md:115-123` — F8, origin of the `/api/*` self-guard rule now at `CLAUDE.md:24`
- `context/archive/2026-09-10-analyze-and-rank-opportunities/plan.md:13,293-297` — rate limiter keyed on `locals.user.id` rather than IP; per-user isolation extended to resource budgeting
- `context/archive/2026-09-13-channel-profile-avatar/plan.md:25,30,38,66-74,414` + `change.md:62-66` — storage ownership decisions; automated tests declined again; **criterion 5.4 (production two-user isolation) marked won't-do**, replaced by a local-vs-hosted policy diff
- `context/archive/2026-09-13-save-and-view-opportunities/plan.md:83-84,216,356-360` + `plan-brief.md:97-98` — the five-assertion scripted protocol including row-intactness; the explicit "no regression guard on RLS" admission
- `context/archive/2026-09-13-save-and-view-opportunities/reviews/plan-review.md:80-87,116-117` — **F5**, the caught weak criterion; the single most reusable artifact for this change

Migration git history (`git log --follow -- supabase/migrations/`):
`822c33b` (channel_profiles, establishes the pattern) → `bac33fe` → `205bbb4`
(avatar bucket) → `38e5c37` (content_opportunities). `src/middleware.ts` last
changed in `062c9ee`; `PROTECTED_ROUTES` has been `["/dashboard"]` since
inception and never grew to cover `/api/*`, by repeated explicit decision.

## Related Research

- `context/foundation/test-plan.md` §2 risks #3/#4, §3 Phase 2 (status "not started"), §4 (pgTAP + Docker), §5 (gates), §6.3/§6.4 (cookbook entries this change fills in)
- `context/foundation/roadmap.md:82-93` — F-03 definition, unknowns, and the deliberate divergence from `test-plan.md` §3's ordering under `main_goal: speed`
- `context/archive/2026-09-10-analyze-and-rank-opportunities/research.md:107,154-156` — prior confirmation that a cookie-scoped server read is automatically owner-isolated
- `context/foundation/prd.md:89` (FR-002), `:139` (the NFR naming isolation as _weryfikowalna testem_), `:159` (Access Control — flat role model)

## Open Questions

1. **Does `set local request.jwt.claim.sub` actually drive `auth.uid()` on this
   Postgres 17 stack?** The Supabase docs show the singular
   `request.jwt.claim.sub` form; other guidance uses the JSON
   `request.jwt.claims`. The implementations differ across versions. **The
   first test file should assert `auth.uid()` returns the impersonated id
   before asserting anything else** — otherwise every downstream "stranger sees
   nothing" assertion passes vacuously, with `auth.uid()` returning NULL for
   _both_ users. This is the single most likely way the suite silently proves
   nothing, and it is the pgTAP-native form of the oracle problem the test plan
   warns about elsewhere.
2. **Built-in `set local role` / JWT claims, or the `basejump` helper tier?**
   The helpers are pleasant (`tests.authenticate_as('user1@test.com')`) but
   drag in `pg_tle` → `pgsql-http` → `dbdev` and a pre-test hook file. Given
   §7's "no test infrastructure beyond what a named risk demands", the built-in
   form looks right — but the plan should decide explicitly, not drift.
3. **CI or local-only gate?** Still the user's call
   (`context/foundation/roadmap.md:92`), but now evidenced: local costs
   nothing and works today; CI costs a full ~13-image pull per cold runner in a
   job that would need its own definition. `test-plan.md` §5 defers this to
   Phase 4, and a local gate is a valid end state.
4. **How far does the suite chase the avatar signed-URL path?** `createSignedUrl`
   is a distinct authorization mechanism from `avatars_select_own`; a
   DB-level test can only reach the latter. Either scope it out explicitly (and
   record it, as §7 records its other exclusions) or cover it at the route
   layer.
5. **Should `FORCE ROW LEVEL SECURITY` and an explicit `REVOKE` for `anon` be
   added, or merely asserted?** Adding them is a migration — arguably scope
   creep for a change whose outcome is "provable". Asserting their current
   effect is squarely in scope. The plan should pick one and say why; the
   roadmap's F-03 outcome ("provable rather than asserted") reads as
   _assert-only_.
6. **Who owns the `vitest.config.ts` glob widening — F-03 or F-04?** Both need
   it, they are marked parallel, and they will collide on that file.
7. **`supabase/seed.sql` is referenced by `supabase/config.toml:65-68`
   (`enabled = true`, `sql_paths = ["./seed.sql"]`) but does not exist on
   disk.** Harmless today, but a pgTAP suite that ever depends on
   `supabase db reset` inherits the ambiguity. Create it or drop the reference.
