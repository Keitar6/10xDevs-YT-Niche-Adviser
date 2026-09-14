<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Provable User Isolation

- **Plan**: `context/changes/provable-user-isolation/plan.md`
- **Scope**: Phases 1–5 of 5 (full plan)
- **Date**: 2026-09-14
- **Verdict**: NEEDS ATTENTION → **RESOLVED** (all 10 findings fixed during triage 2026-09-14)
- **Findings**: 0 critical, 6 warnings, 4 observations

## Verdicts

| Dimension           | Verdict                     |
| ------------------- | --------------------------- |
| Plan Adherence      | PASS                        |
| Scope Discipline    | PASS                        |
| Safety & Quality    | WARNING → PASS after triage |
| Architecture        | PASS                        |
| Pattern Consistency | PASS                        |
| Success Criteria    | WARNING → PASS after triage |

## Post-triage state

All ten findings fixed. Final gates: `npm test` 8 files / **97 tests** pass,
`npm run test:db` 5 files / **77 assertions** `Result: PASS`, lint clean, build
clean. Assertion counts rose from 92 → 97 (Vitest) and 66 → 77 (pgTAP).

Every fix was mutation-verified rather than assumed — each one was confirmed to
turn the suite red against the defect it targets and green again once reverted:

| Fix                             | Red on                                                        |
| ------------------------------- | ------------------------------------------------------------- |
| F1 positive controls            | owner UPDATE+DELETE policies dropped → `01` 2/16, `02` 2/18   |
| F3 modern key patterns          | `sb_secret_` client → 3 assertions                            |
| F4 factory exclusivity          | second `createAdminClient()` in `src/lib/supabase.ts`         |
| F5 filesystem-derived route set | unguarded `src/pages/api/reports.ts`, named in the diff       |
| F6 single include glob          | test at `src/components/hooks/` now collected (was skipped)   |
| F7 exact `qual` + storage block | `using (… or true)`; `avatars_select_own` losing `foldername` |
| F10 widened extensions          | `.mjs` file containing `sb_secret_` (was invisible)           |

F2 was settled by running `npx supabase db reset` for real, with the local dev
data backed up first — see its decision entry.

## Evidence gathered

Automated criteria, all re-run during this review:

| Check                                            | Result                                                                             |
| ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `npm test`                                       | 8 files, 92 tests, pass                                                            |
| `npm run test:db`                                | 5 files, 66 tests, `Result: PASS` (`plan(N)` sums to 8+14+16+12+16 = 66; no skips) |
| `npm run lint`                                   | pass                                                                               |
| `npm run build`                                  | pass                                                                               |
| `git status --porcelain`                         | clean                                                                              |
| `TBD — see §3 Phase 2` removed from test-plan.md | confirmed                                                                          |

Mutation probes run by this review (all reverted; tree returned to `0a4b4d3`):

- Collapsing user B's JWT claim into user A's UUID in `01-channel-profiles.test.sql` → **6 of 14 red**, including both row-intactness assertions. The isolation assertions genuinely bind to two distinct identities.
- Removing the `if (!context.locals.user)` guard from `POST /api/profile` → **exactly one test red** (`expected 400 to be 401`). Criterion 4.5 holds precisely.
- Planting `createClient(..., "service_role_key_here")` under `src/lib/` → **both scan assertions red**. Criterion 4.6 holds.

Additional mutation evidence from the safety agent (rolled-back transactions against the local stack; database confirmed unchanged afterwards — 1 profile row, all 4 policies present):

| Mutation                                                           | Result                       |
| ------------------------------------------------------------------ | ---------------------------- |
| `disable row level security` on `channel_profiles`                 | 01 fails 13/14               |
| select policy → `using (true)`                                     | 01 fails 6/14                |
| UPDATE policy loses `with check`                                   | 03 fails 2/12                |
| extra `for select to anon using (true)`                            | 03 fails 4/12                |
| avatars select policy drops foldername check                       | 04 fails 4/16                |
| fixture object at bucket root                                      | 04 fails 4/16                |
| **owner UPDATE+DELETE policies dropped (`channel_profiles`)**      | **01 passes 14/14 — see F1** |
| **owner UPDATE+DELETE policies dropped (`content_opportunities`)** | **02 passes 16/16 — see F1** |
| same for avatars                                                   | 04 fails 1/16 (caught)       |

Plan adherence was checked item-by-item against every "Changes Required" contract in all five phases: every item verdicts MATCH. Both deviations recorded in `change.md` are accurate and correctly documented. Nothing on the "What We're NOT Doing" list was violated — no migration, no `seed.sql`, no CI wiring, no `/api/auth/*` tests, no route-handler refactor, no production source change of any kind.

## Findings

### F1 — Denied UPDATE/DELETE assertions have no positive control

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `supabase/tests/01-channel-profiles.test.sql:94,105,163,174`; `supabase/tests/02-content-opportunities.test.sql:102,113,160,171`
- **Detail**: Every "affects zero rows" assertion in these two files passes identically whether the policy is denying _the stranger_ or denying _everybody_. Dropping `channel_profiles_update_own` and `channel_profiles_delete_own` outright leaves `01` green at 14/14; the same for `content_opportunities` leaves `02` green at 16/16. Both files carry a read-side positive control (`01:62` "the owner can see their own row", `02:68`) but no write-side equivalent. `04-avatars-bucket.test.sql:255-267` closes exactly this hole and names the reasoning in its own comment — _"so the strangers' zero-row deletes were RLS, not a blanket block"_ — so the suite knows the technique and applies it in one file of three. This also sharpens `02:87-92`, which claims to pre-prove the S-06 write path: only the deny half is proven, and when S-06 lands an UPDATE nothing here says the owner can perform it. Note the uncaught mutation breaks _owner functionality_, not isolation — the security thesis of the change survives, but the suite is weaker than it advertises.
- **Fix**: Add 04's assertion-16 twin to both files — as user A, `with allowed as (update … where user_id = A returning 1) select is(count, 1, …)`, and the same for DELETE (run DELETE last, or re-insert). Bump `plan(14)`→`plan(16)` and `plan(16)`→`plan(18)`.
  - Strength: The pattern already exists in this change at `04:255-267` and is proven to catch the mutation that 01/02 miss.
  - Tradeoff: Four more assertions; DELETE ordering needs care inside the transaction.
  - Confidence: HIGH — mutation-confirmed in both directions.
  - Blind spot: None significant.
- **Decision**: FIXED — positive controls added to both files (owner CAN update / CAN delete), `plan(14)`→`plan(16)` and `plan(16)`→`plan(18)`. Suite now 70 assertions, green. Mutation-verified: with the owner UPDATE+DELETE policies dropped, `01` now fails 2/16 and `02` fails 2/18 where both were previously fully green.

### F2 — Progress 2.4 and 3.4 attest a `db reset` that provably never ran

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: `context/changes/provable-user-isolation/plan.md` Progress 2.4, 3.4; `change.md` deviations section
- **Detail**: Item 2.4 reads "restored via `db reset`" and 3.4 reads "Suite runs clean after `npx supabase db reset` — verified by the user", which `change.md` explicitly upgrades from accepted assumption to _"verified evidence rather than an accepted assumption"_. The database contradicts both. `auth.users` still holds `phase2-a@example.com` and `phase2-b@example.com` created `2026-09-13 16:33`, the dev profile from `16:47:17`, and its avatar object from `16:47:23`. There is no `supabase/seed.sql` (confirmed absent; the plan scopes it out deliberately). A `db reset` destroys all of that with nothing to recreate it — so no reset has run since `2026-09-13 16:33`, well before Phase 2 landed at `2026-09-14 07:26`. The property 3.4 targets is still largely carried structurally, as `change.md` argues, and this review's identity-collapse probe confirms assertions bind to fixture users — so this is a bookkeeping-accuracy problem, not a broken suite. But "verified evidence" currently overstates what happened.
- **Fix A ⭐ Recommended**: Downgrade both items to what is actually evidenced — mark 2.4 and 3.4 as structurally-argued rather than reset-verified, and correct the `change.md` note that calls 3.4 verified evidence.
  - Strength: Restores the plan's accuracy without destroying dev data; the structural argument in `change.md` already stands on its own and this review's mutation probes independently support it.
  - Tradeoff: Leaves one manual criterion genuinely unperformed.
  - Confidence: HIGH — the row timestamps and the absent seed file are decisive.
  - Blind spot: Does not establish the clean-database property; only stops claiming it.
- **Fix B**: Actually run `npx supabase db reset` and re-run the suite, accepting loss of the local dev profile, avatar and saved opportunities.
  - Strength: Converts both items into real evidence and would also exercise the break-a-policy restore path in 2.4.
  - Tradeoff: Destroys real local development data the user previously chose to protect — this is the user's call, not the reviewer's.
  - Confidence: MEDIUM — the suite would almost certainly pass, but the data loss is certain.
  - Blind spot: Whether anything else depends on that local data.
- **Decision**: FIXED via Fix B — dev data backed up to the session scratchpad (`devdata-public.sql`, `devdata-auth-storage.sql`), then `npx supabase db reset` run for real. 3.4: database confirmed genuinely empty (0 users / 0 profiles / 0 opportunities / 0 storage objects), suite 70/70 PASS. 2.4: `using (true)` on the select policy turned the suite red (`01` 1/16, `03` 1/12), restored via a second `db reset` back to 70/70 with `qual` = `(auth.uid() = user_id)`. Plan Progress 2.4/3.4 rewritten as performed evidence; the `change.md` deviation note corrected to record that the original user report was mistaken. Roadmap assertion count updated 66 → 70.

### F3 — The no-service-role scan only knows legacy Supabase key naming

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/lib/no-privileged-client.test.ts:64-75`
- **Detail**: The four patterns (`service_role`, `serviceRole`, `SERVICE_ROLE`, `auth.admin`) match only the legacy key scheme. This project's own local stack reports the current one: `"SECRET_KEY":"sb_secret_N7UND0UgjKTVK-…"` beside `"PUBLISHABLE_KEY":"sb_publishable_…"`. A privileged client built from `SUPABASE_SECRET_KEY`, or from a literal `sb_secret_…`, matches none of the four. Given this file is the pin under the entire plan — CLAUDE.md states RLS "is not defence-in-depth here — it is the only thing standing between two users" — that is the gap that matters most.
- **Fix**: Add `/sb_secret_/`, `/SECRET_KEY/`, `/SUPABASE_SERVICE/i`, `/supabaseAdmin/i` to the `it.each` table.
- **Decision**: FIXED — four modern-key patterns added with a comment explaining why the legacy wording does not cover them. `npm test` now 96 tests, green. Probe confirmed: a `createServerClient(url, SUPABASE_SECRET_KEY)` using `sb_secret_…` trips `sb_secret_`, `SECRET_KEY` and the constructor-import check. Note for accuracy: that probe also tripped the pre-existing import check, so this fix adds depth rather than closing a hole on its own — the case only these patterns catch is a modern-key client placed _inside_ the exempt factory file, which is F4.

### F4 — The exempt client factory is only weakly constrained

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `src/lib/no-privileged-client.test.ts:77-100`
- **Detail**: The whole invariant funnels into `src/lib/supabase.ts`, which is then exempted from the constructor-import check by design (`file.path !== CLIENT_FACTORY`) and otherwise constrained only by `toMatch(/SUPABASE_KEY/)` and `toMatch(/cookies\s*:/)` — existence checks, not exclusivity checks. Adding a second exported factory to that same file (`export function createAdminClient() { return createServerClient(SUPABASE_URL, SUPABASE_SECRET, {}); }`) passes all four tests: `SUPABASE_SECRET` trips none of the string patterns (see F3), and the file is exempt from the import check. Related and lower-severity: the regex at line 81 requires `import\s+\{`, so `import{createClient}` (no space, unlikely under Prettier), `import * as s from "@supabase/supabase-js"`, and `await import(…)` all evade it.
- **Fix**: Assert the factory file contains exactly one `createServerClient(` occurrence and exactly one exported function, or scan it for any key identifier other than `SUPABASE_KEY`.
  - Strength: Closes the one file that the rest of the scan deliberately trusts.
  - Tradeoff: Slightly brittle against legitimate future refactors of that file.
  - Confidence: HIGH — the bypass was constructed and confirmed to pass.
  - Blind spot: None significant.
- **Decision**: FIXED — added an exclusivity assertion: the factory file must contain exactly one `@supabase/*` constructor call, exactly one `export`, and that export must be `createClient`. Probe-verified both ways: appending a second `createAdminClient()` factory to `src/lib/supabase.ts` turns it red; the clean file is green. `npm test` now 97 tests. (First attempt regressed — the constructor regex also matched the project's own `createClient(` declaration; narrowed to `create(Server|Browser)Client`.)

### F5 — Route-table exhaustiveness is asserted against a hardcoded constant

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `src/pages/api/routes.test.ts:133-137`
- **Detail**: `expect(DATA_ROUTES).toHaveLength(7)` checks a hardcoded constant against a hardcoded array. It guards the table against shrinking but not the codebase against growing: a new `src/pages/api/<thing>.ts` that forgets its 401 guard and is never added to `DATA_ROUTES` produces no failure. That directly undercuts the file's own thesis at lines 10-17 — _"a new route that forgets its guard is caught by adding a row rather than by remembering to write a test"_ — since it is still caught only by remembering. Separately, three SSR data-read sites sit outside the table entirely (`src/pages/dashboard.astro:6-8`, `src/components/Topbar.astro:19`, `src/components/Welcome.astro:9`); the latter two render on `/`, which is not in `PROTECTED_ROUTES`, guarded only by a frontmatter ternary that nothing pins. Residual risk there is low — the id is session-derived and RLS backstops it — but the header's "every data-touching handler" claim is silently `/api/*`-scoped.
- **Fix**: Glob `src/pages/api/**/*.ts` (minus `auth/`, minus `*.test.ts`), import each module, collect its exported verbs, and assert every one appears in `DATA_ROUTES`. Also state the `/api/*` scope explicitly in the header comment.
  - Strength: `no-privileged-client.test.ts` already demonstrates the filesystem-walk technique inside this same change.
  - Tradeoff: Importing every route module at test time is slower and needs the stubs to cover any new virtual import.
  - Confidence: HIGH — the gap follows directly from the assertion's shape.
  - Blind spot: Whether any future route legitimately needs no guard.
- **Decision**: FIXED — `toHaveLength(7)` replaced with `handlersOnDisk()`, which walks `src/pages/api/`, skips `auth/` and `*.test.ts`, extracts each exported verb from the source text, and asserts set-equality with `DATA_ROUTES`. Reading source text rather than importing keeps it independent of any handler module loading. Probe-verified: adding an unguarded `src/pages/api/reports.ts` turns it red and names `POST /api/reports`. Header comment now states the `/api/*` scope limit explicitly and names the three SSR `.astro` read sites it does not cover. `npm test` 97 tests, lint clean.

### F6 — Vitest `include` is a hand-maintained allowlist

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `vitest.config.ts:31`
- **Detail**: `include: ["src/lib/**/*.test.ts", "src/pages/api/**/*.test.ts", "src/*.test.ts"]` replaces Vitest's default `**/*.test.ts`. A future test at `src/components/hooks/useX.test.ts` or `src/pages/auth/foo.test.ts` is silently never run — no error, no warning, green CI. Given this change's whole thesis is "a green suite that proves nothing", the config carries the same failure mode it was written to eliminate.
- **Fix**: Use `["src/**/*.test.{ts,tsx}"]`, adding `exclude` entries if something genuinely needs keeping out.
- **Decision**: FIXED — collapsed to a single `src/**/*.test.{ts,tsx}` glob with a comment explaining why an allowlist is the wrong shape here. Probe-verified: a test at `src/components/hooks/scratch.test.ts` is now collected (9 files) where it was previously skipped in silence.

### F7 — The structural-proof file is weaker than it advertises

- **Severity**: 📝 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `supabase/tests/03-policy-shape.test.sql:57,65,111,119` and whole file
- **Detail**: Two gaps. First, `qual not like '%auth.uid() = user_id%'` is a substring test, so `using (auth.uid() = user_id or true)` satisfies it — while the file advertises itself as the structural proof (_"A policy that exists, is named correctly, and says `true` fails this file"_). `01` catches that shape behaviourally, so it is covered in depth, but not where it is claimed. Second, structural coverage stops at the two `public` tables: there is no counterpart for the four `avatars` policies — no "granted to `authenticated` and nothing else", no assertion that each carries `(storage.foldername(name))[1]`. `storage.objects` is the one table shared with the Supabase platform and the likeliest to acquire a third-party or `public`-scoped policy from outside this repo.
- **Fix**: Anchor the expression checks with `qual = '(auth.uid() = user_id)'`, and add a `storage.objects`/`avatars` block to `03`.
  - Strength: Makes the file's advertised guarantee match its actual one, and extends it to the surface with the most external exposure.
  - Tradeoff: Exact-match `qual` is brittle against Postgres reformatting the expression across versions.
  - Confidence: MEDIUM — the substring gap is certain; the brittleness cost of exact matching is a genuine judgement call.
  - Blind spot: How `qual` normalisation behaves on a future PG upgrade.
- **Decision**: FIXED (both halves). (1) The four ownership assertions on the two `public` tables now compare `qual` / `with_check` for equality against `(auth.uid() = user_id)` instead of `like '%…%'`; the header records why, and that a future Postgres re-printing the expression is meant to fail loudly rather than weaken silently. (2) A `storage.objects` / `avatars` block added — seven assertions: one-policy-per-verb, no policy on the whole table granted to `anon`/`public`, avatars policies scoped to `authenticated` only, the `foldername`+`bucket_id` test present in `USING` and in `WITH CHECK`, `avatars_update_own` carries a `WITH CHECK`, and no avatars expression widened by an `OR` branch (the structural equivalent of the equality test, since that expression is too long to pin exactly). `plan(12)`→`plan(19)`; suite now 77 assertions. Mutation-verified: `using (auth.uid() = user_id or true)` now fails `03` (it previously passed the substring test), and dropping the `foldername` test from `avatars_select_own` fails `03` and `04`. Restored via `db reset`; both suites green.

### F8 — `test-plan.md` §4 still describes the pre-change world

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `context/foundation/test-plan.md:101,103`
- **Detail**: Two §4 Stack rows were left stale by this change. Line 101: _"`include` in `vitest.config.ts` is currently scoped to `src/lib/services/**/*.test.ts` only; §3 Phase 1 widens it. Five test files exist, all in that one directory"_ — Phase 4 of _this_ change widened it, there are now eight files, and §6.4 documents the wider scope three sections below. Line 103: _"No tests written yet — see §3 Phase 2"_ — five pgTAP files now exist and §3's Phase 2 row already says `complete`. (`roadmap.md:78` carries similar wording but sits under an explicit `Repo state as of 2026-09-13` baseline header, so it reads as a dated snapshot and is not a defect.)
- **Fix**: Update both §4 rows to the post-change state.
- **Decision**: FIXED — both §4 rows rewritten to the current state (include glob `src/**/*.test.{ts,tsx}` and eight test files; five pgTAP files and 77 assertions wired as a local gate). Went further while in the file, since the cookbook is where this review's main lesson belongs: §6.3 gained step 7 (the owner-CAN-write positive control), a fourth trap explaining why a denial proves nothing without it, and a second break-it instruction (drop the owner's own policy, not just weaken it to `true`); §6.4 now notes that forgetting a `DATA_ROUTES` row fails by name rather than silently. Roadmap assertion count 70 → 77.

### F9 — Two documentation inaccuracies in the SQL suite

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `supabase/tests/04-avatars-bucket.test.sql:94-97`; `supabase/tests/README.md:51-64`
- **Detail**: The comment at `04:94-97` states that leaving the `storage.allow_delete_query` stand-down out would mean _"every DELETE assertion below would pass because the statement throws for everyone… a vacuous pass wearing a green tick."_ Removing line 105 actually produces `ERROR: Direct deletion from storage tables is not allowed` followed by `current transaction is aborted` — a loud file-level failure, not a vacuous pass. The stand-down is correct and necessary; only the stated reason is wrong, and a future reader would reason from a false model of pgTAP error handling. Separately, the README's transaction section is worth one line noting that a file pasted into Studio with the trailing `rollback;` dropped would leave two `*@isolation.test` users and an avatars object behind.
- **Fix**: Correct the `04` comment to name the real mechanism (statement-level trigger aborts the transaction) and add the README caveat.
- **Decision**: FIXED — the `04` comment now states the real failure mode (the file dies loudly with `42501 Direct deletion from storage tables is not allowed` and `current transaction is aborted`, so the danger is a lost measurement rather than a silent pass) while keeping the correct conclusion that the stand-down is necessary and is not an access-control boundary. `README.md` gained a paragraph on why the trailing `rollback;` is load-bearing.

### F10 — Scan exemption and stub hygiene

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/lib/no-privileged-client.test.ts:36,38`; `src/test/stubs/astro-env-server.ts:24`
- **Detail**: Three small items. (a) `EXEMPT` includes `"test/stubs/"` as a directory prefix, creating a permanently unscanned subtree inside `src/` — the one place a privileged client could now hide from its own guard; justified today (3 trivial files) but worth narrowing to the three exact paths. (b) `EXTENSIONS = [".ts", ".tsx", ".astro"]` means a future `.mjs`/`.js` under `src/` would be invisible to the scan; nothing is skipped today. (c) `YOUTUBE_API_KEY = ""` silently steers the one `POST /api/profile` happy-path test down the fallback branch (`profile.ts:77-89`), so the production branch that rebuilds `competitors` via `resolveChannelRefs` (`profile.ts:58-76`) is never exercised; the ownership conclusion is unaffected — `user_id` is set from the session at `profile.ts:100` in both branches — but a reader would not guess it. The stub's own comment concedes the `env.schema` correspondence _"is maintained by hand and nothing checks it"_; field-by-field it is currently an exact match.
- **Fix**: Narrow `EXEMPT` to exact paths, add `.mjs`/`.js` to `EXTENSIONS`, and add a one-line comment at the stub noting the fallback-branch consequence.
- **Decision**: FIXED (all three). `EXEMPT` now lists the three stub files individually, with a comment explaining why a directory prefix is the wrong shape; `EXTENSIONS` widened to `.js/.jsx/.mjs/.cjs`; the stub documents the fallback-branch consequence for `POST /api/profile`. Probe-verified: a `src/lib/scratch-probe.mjs` containing `sb_secret_…` is now caught, where it was previously invisible to the walk.
