# Quality-Gates Wiring Implementation Plan

## Overview

This is `test-plan.md` §3 **Phase 4 — Quality-gates wiring**, the last and
deliberately thinnest phase of the test rollout, and roadmap element **F-06**
(milestone M-2, MS-06). Phases 1–3 built a floor: boundary resilience, provable
per-user isolation, and a scoring oracle. This phase makes that floor
_enforced_ rather than documented.

Four gates change state:

| Gate                  | Today                                                | After                                                        |
| --------------------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| typecheck             | no script, never run, **currently 4 errors**         | `npm run typecheck` in CI                                    |
| formatting            | pre-commit on `*.{json,css,md}`, **already drifted** | `npm run format:check` in CI                                 |
| database policy tests | local only (`npm run test:db`)                       | CI job, scoped to changes under `supabase/**`                |
| enforcement           | red X + skipped deploy; `master` unprotected         | ruleset on `master`: PR required, checks required, no bypass |

## Current State Analysis

**CI is further along than the documentation claims.** `.github/workflows/ci.yml`
already runs `astro sync → lint → test → build → deploy` as sequential steps in
one job (`ci.yml:26-33`). `CLAUDE.md` still describes it as "lint + build" —
stale since `npm test` was added. The `unit + integration` gate in §5 is
genuinely wired; §5 is correct about that one.

**Typecheck is the real gap, and it is currently red.** There is no `typecheck`
script. `npx astro check` runs in **13.9s** over 82 files and reports **4 errors**,
all in `src/pages/api/routes.test.ts` and all the same shape: `await response.json()`
is typed `unknown`, so `Object.keys(body)` (ts2769) and `body.error` (ts18046)
do not typecheck at lines 193/194 and 323/325. `eslint.config.js` additionally
emits `ts(6387)` deprecation **hints** on `tseslint.config`; `astro check`
defaults to failing on severity `error` only, so those do not block.

**Formatting is drifting right now.** `npx prettier --check .` fails on
`context/foundation/roadmap.md`. lint-staged formats only `*.{json,css,md}` on
commit, and `*.{ts,tsx,astro}` go through `eslint --fix` (with
`eslint-plugin-prettier` installed, so `npm run lint` already covers code
formatting). The open gap is markdown/JSON/CSS edited outside a hooked commit.

**The policy-test placement decision is open and already evidenced.**
`roadmap.md:93` measured it: local costs ~0.1s CPU against a warm stack; a cold
CI runner pays a full Supabase image pull. Both `test-plan.md` §5 and roadmap
F-06 name this phase as where the decision is made.

**Nothing blocks a merge.** `gh api repos/Keitar6/10xDevs-YT-Niche-Adviser/branches/master/protection`
returns 404 "Branch not protected". "Enforced on every change" today means a red
X on the commit and a skipped deploy step — visible, not enforced.

Suite baseline: 12 files, 166 tests, **0.65s**. pgTAP: 5 files under
`supabase/tests/`.

## Desired End State

A change that breaks types, formatting, unit tests, the build, or (when it
touches `supabase/**`) the policy suite **cannot reach `master`**. Verified by
opening a pull request carrying a deliberate type error and observing that the
merge button is blocked, then observing that a docs-only PR still merges with
the `db` check reported as skipped-success.

### Key Discoveries:

- **Workflow-level `paths:` filters deadlock required checks.** GitHub docs, in
  both `workflow-syntax` and `trigger-a-workflow`: "If a workflow is skipped due
  to path filtering, branch filtering, or a commit message, checks associated
  with that workflow remain in a 'Pending' state. Consequently, pull requests
  requiring those checks to be successful will be blocked from merging." With no
  bypass actors, a separate paths-filtered `db.yml` would freeze every PR that
  does not touch migrations. **This is the single most important constraint in
  the plan.**
- **Job-level `if:` is the safe form.** Same source set, `control-jobs-with-conditions`:
  "A skipped job reports its status as 'Success' and will not prevent a pull
  request from merging, even if the job was configured as a required check."
  The db gate therefore lives as a job inside the existing `ci.yml`.
- **The image pull is avoidable.** `supabase start -x` accepts the full
  container list: `gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor`.
  pgTAP touches only the database, and the `avatars` bucket row is created by a
  **migration** — `supabase/migrations/20260913134159_add_channel_profile_avatar.sql:24`
  inserts into `storage.buckets` — not by storage-api at boot. Excluding all
  thirteen should leave the suite green. Phase 3 measures this rather than
  assuming it.
- **Deploy needs no restructuring.** A ruleset requiring a pull request means
  every path to `master` passes required checks, so the deploy step inside the
  `ci` job is gated transitively. Splitting it into `needs: [ci, db]` would
  actively break it: a skipped `needs` dependency skips the dependent job.
- **The Supabase CLI is already a devDependency** (`supabase@^2.116.0`), so
  `npx supabase start` works after `npm ci` — no `supabase/setup-cli` action
  needed.
- **`astro sync` opens a remote Cloudflare proxy session** that authenticates
  from the environment (`ci.yml:10-15`). It must precede `astro check`, and it is
  the CI pipeline's one external dependency.

## What We're NOT Doing

- **No test-volume or coverage floor.** Deleting half of `scoring.test.ts` will
  still leave every gate green. Declined deliberately: no risk in `test-plan.md`
  §2 is "someone deletes the tests", §7 already excludes test infrastructure
  beyond what a named risk demands, and a coverage percentage rewards the
  assert-nothing tests §6.5 spent Phase 3 removing. Recorded as an explicit §7
  exclusion so it reads as decided, not overlooked.
- **No e2e gate.** The §5 standing trade is re-affirmed with a fresh date and its
  revisit trigger, not reopened.
- **No new gate classes** — no dependency audit, no security scan, no bundle-size
  budget, no license check. None is named by a risk.
- **No pre-push hook.** The ruleset supersedes it.
- **No deploy-job split**, for the reason in Key Discoveries.
- **No Docker layer caching or CI restructuring** beyond the one new job.
- **Not lowering `astro check`'s failure severity** to catch the `ts(6387)`
  deprecation hints. That would make an upstream `typescript-eslint` deprecation
  block merges on a repo that cannot fix it.

## Implementation Approach

Strictly ordered by a single rule: **a gate must be green before it is wired,
and wired before it is required.** Phase 1 makes every gate pass locally.
Phase 2 wires the two cheap always-on gates. Phase 3 adds the conditional
Docker-bearing job. Phase 4 makes the resulting checks blocking and syncs the
documents. Inverting any pair locks the repository against its own author.

## Critical Implementation Details

**State sequencing.** The ruleset in Phase 4 is created **last** and only after
a real CI run has been observed, because GitHub matches required status checks
by the _check name string_. For an Actions job with no `name:`, that string is
the job id — `ci`, `db`. A ruleset naming a check that never reports blocks
every merge, and with no bypass actors the recovery is to edit the ruleset in
the GitHub UI. Read the names off an actual run (`gh api …/commits/<sha>/check-runs`)
before writing them into the ruleset; do not infer them.

**Timing & lifecycle.** The `changes` job needs full history to diff against, so
its checkout takes `fetch-depth: 0`; the diff base differs by event
(`github.event.pull_request.base.sha` for `pull_request`, `github.event.before`
for `push`). Do not require the `changes` job itself as a status check — it is
plumbing, and requiring it adds a name to keep in sync for no guarantee.

## Phase 1: Green the Floor and Script the Gates

### Overview

Make all four gates pass locally. Nothing is wired to CI in this phase; the
point is that no gate is ever switched on while red.

### Changes Required:

#### 1. Type errors in the route test

**File**: `src/pages/api/routes.test.ts`

**Intent**: Fix the four `astro check` errors at lines 193/194 and 323/325 so the
typecheck gate can go green. Both sites are the same shape — `await response.json()`
yields `unknown`, and the file then calls `Object.keys()` on it and reads
`.error`.

**Contract**: Narrow the parsed body to `Record<string, unknown>` at each of the
two `await response.json()` sites. **The narrowing must not be to `{ error: string }`.**
Those two assertions exist to prove the 401/404 envelope has exactly one key and
that the key is a string; a type that already says so makes both assertions
tautological, which is the `Branch condition as assertion` anti-pattern in
`test-plan.md` §6.5. `Record<string, unknown>` keeps `Object.keys` and the
`typeof` check load-bearing.

#### 2. Formatting drift

**File**: `context/foundation/roadmap.md`

**Intent**: Normalize with Prettier so `format:check` can go green. This is the
file `prettier --check` currently reports.

**Contract**: Formatting only — no content change. Verify with `git diff --stat`
that nothing but whitespace/wrapping moved.

#### 3. Gate scripts

**File**: `package.json`

**Intent**: Give the two unwired gates runnable names, so CI, the pre-commit
story and a human all invoke the same command.

**Contract**: Two new `scripts` entries — `typecheck` running `astro check`, and
`format:check` running `prettier --check .`. `format` (write mode) stays as-is.

### Success Criteria:

#### Automated Verification:

- Typecheck passes: `npm run typecheck` exits 0 with `0 errors`
- Format check passes: `npm run format:check` exits 0
- Tests still pass: `npm test` reports 12 files / 166 tests
- Lint passes: `npm run lint` exits 0

#### Manual Verification:

- The `routes.test.ts` narrowing did not weaken the envelope assertions: add a
  second key to a `jsonError` response by hand and confirm `npm test` goes red on
  `Object.keys(body)`, then revert. (`test-plan.md` §6.4 prescribes exactly this
  mutation discipline before trusting a route assertion.)
- `git diff` on `roadmap.md` shows no semantic change

**Implementation Note**: Pause here for manual confirmation before Phase 2.

---

## Phase 2: Wire the Always-On Gates into CI

### Overview

Add the two cheap gates (~16s combined) to the existing `ci` job, and correct the
project documentation that describes what CI runs.

### Changes Required:

#### 1. CI steps

**File**: `.github/workflows/ci.yml`

**Intent**: Run `format:check` and `typecheck` on every push and pull request, in
the existing `ci` job.

**Contract**: Two new steps in the `ci` job's `steps` list. `typecheck` must come
**after** the existing `npx astro sync` step — `astro check` needs the generated
types that `sync` produces. Order the two so the cheapest fails first:
`format:check` (~2s) before `lint`, `typecheck` (~14s) after `lint` and before
`test`. No new job, no new secret.

#### 2. Stale CI description

**File**: `CLAUDE.md`

**Intent**: The `## CI` section says the workflow "runs lint + build"; it has run
`npm test` for some time and now runs four gates. A rules file that misdescribes
the gates teaches every future agent the wrong floor.

**Contract**: Rewrite the `## CI` section to name the actual step sequence, and
add the two new scripts to the `## Commands` list.

### Success Criteria:

#### Automated Verification:

- The pushed branch's CI run is green: `gh run list --limit 1` shows success
- Both new steps appear in the run: `gh run view --log | grep -E "format:check|typecheck"`
- The run's total wall time stays under two minutes

#### Manual Verification:

- Push a commit with a deliberate formatting error and confirm CI goes red on
  `format:check`; revert
- Push a commit with a deliberate type error and confirm CI goes red on
  `typecheck`; revert
- `CLAUDE.md`'s `## CI` section matches `ci.yml` step for step

**Implementation Note**: Pause here for manual confirmation before Phase 3.

---

## Phase 3: Policy-Test Gate in CI, Scoped to `supabase/**`

### Overview

Resolve the placement decision deferred by `test-plan.md` §5 and `roadmap.md:93`:
the pgTAP suite runs in CI, in its own job, only when the change touches
`supabase/**` — using a **job-level condition**, never a workflow-level `paths:`
filter.

### Changes Required:

#### 1. Change-detection job

**File**: `.github/workflows/ci.yml`

**Intent**: Emit a boolean saying whether this event touched `supabase/**`, for
the `db` job to condition on. A job is used rather than a workflow `paths:` filter
because the latter leaves the check Pending forever (see Key Discoveries).

**Contract**: A new job `changes` with an output (e.g. `supabase`) of `'true'` /
`'false'`. Checkout with `fetch-depth: 0`. The diff base is event-dependent:
`github.event.pull_request.base.sha` on `pull_request`,
`github.event.before` on `push`. Handle the `push` case where `before` is all
zeroes (first push on a branch) by treating it as changed. No third-party action
— plain `git diff --name-only` in a `run` step is sufficient and keeps the gate's
supply-chain surface at `actions/checkout` alone.

#### 2. Policy-test job

**File**: `.github/workflows/ci.yml`

**Intent**: Start a local Supabase stack trimmed to the database container and run
the pgTAP suite.

**Contract**: A new job `db` with `needs: changes` and a **job-level**
`if: needs.changes.outputs.supabase == 'true'`. Steps: checkout, setup-node with
npm cache, `npm ci`, start the stack, `npm run test:db`. Start the stack with the
exclusion list, so the runner pulls one image rather than fourteen:

```yaml
- run: npx supabase start -x gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
```

The exclusion is safe **because pgTAP only touches the database**: `auth.uid()` is
a SQL function in the db image, and the `avatars` bucket row is inserted by
`20260913134159_add_channel_profile_avatar.sql:24`, not by storage-api. If any of
the five files goes red under the trimmed start, fall back to a plain
`npx supabase start` and record which container was actually required — do not
weaken an assertion to fit the trimmed stack.

`db` must **not** be listed in the `ci` job's `needs`, and the deploy step must
stay inside `ci` (see Key Discoveries).

#### 3. Gate documentation

**File**: `CLAUDE.md`

**Intent**: The "Access control is enforced by the database" section states the
policy suite is "a local gate rather than a CI one **for now**" and that the
placement decision is owned by `test-plan.md` §3 Phase 4. That decision is now
made.

**Contract**: Replace the deferral paragraph with the resolved placement, keeping
the local-gate instruction (it is still the fast path before pushing) and naming
the paths scope so a reader knows when CI will and will not run it.

### Success Criteria:

#### Automated Verification:

- On a branch touching `supabase/`, the `db` job runs and is green:
  `gh run view --job db` shows `Result: PASS` with all five pgTAP files
- The pgTAP assertion count under the trimmed start equals the count from a local
  `npm run test:db` run — no file silently skipped
- On a branch touching no `supabase/` path, the `db` job is skipped and the run is
  still green overall
- The `ci` job's wall time is unchanged from Phase 2 (the new job runs in parallel)

#### Manual Verification:

- In the GitHub checks UI, a skipped `db` shows "This check was skipped" and does
  not appear as failing
- Note the `db` job's wall time under the trimmed start, for the §6.7 cookbook
  entry — this is the number that justifies the paths scoping
- Break a policy in a migration (`alter policy … using (true)`), push, and confirm
  the `db` job goes red; revert. This is the §6.3 discipline applied to the gate
  itself rather than to a test file

**Implementation Note**: Pause here for manual confirmation before Phase 4.

---

## Phase 4: Enforce with a Ruleset, and Close the Documentation Loop

### Overview

Make the checks blocking, then bring every document that describes the gates into
agreement with what is now enforced.

### Changes Required:

#### 1. Repository ruleset

**File**: _(GitHub configuration — no repository file)_

**Intent**: Make `master` reachable only through a pull request whose required
checks passed, with no bypass actors, so "enforced on every change" is literally
true rather than conventional.

**Contract**: A ruleset targeting the default branch with three rules: require a
pull request before merging, require status checks to pass, and block non-fast-
forward / direct pushes. Required check names are **`ci` and `db`**, read off a
real run rather than inferred — `changes` is deliberately not required.
`bypass_actors` is empty.

Create it via `gh api` rather than clicking, so the configuration is
reproducible and reviewable:

```bash
gh api repos/Keitar6/10xDevs-YT-Niche-Adviser/rulesets \
  --method POST --input <ruleset.json>
```

Keep the request body in the change folder as `ruleset.json` so the enforced
configuration is a reviewable artifact, not tribal knowledge. Confirm the exact
check names first:

```bash
gh api repos/Keitar6/10xDevs-YT-Niche-Adviser/commits/master/check-runs \
  --jq '.check_runs[].name'
```

#### 2. Test plan §5 — gate table

**File**: `context/foundation/test-plan.md`

**Intent**: Three rows carry "required after §3 Phase 4" or a deferred placement.
That phase is this one.

**Contract**: In the §5 table, flip `typecheck` to wired, restate the
`database policy tests` row with the resolved CI placement and its paths scope,
and add a `format` row. Update the two-standing-trades paragraph beneath it: the
second trade (Docker placement) is now resolved and should read as a decision
with its measured cost; the first (e2e) is re-affirmed with today's date and its
revisit trigger intact.

#### 3. Test plan §6.7 — new cookbook entry

**File**: `context/foundation/test-plan.md`

**Intent**: §6 gains one sub-section per shipped phase. Phase 4's is the one a
future contributor needs when adding or changing a gate, and it must carry the
two findings that are expensive to re-derive.

**Contract**: A new `### 6.7 Adding or changing a quality gate` after §6.6, in
the established shape (location, run-locally, then the traps). It must record:
the green-then-wire-then-require ordering; that a workflow-level `paths:` filter
leaves a required check Pending and deadlocks merges while a job-level `if:`
reports skipped-success; that required-check names are matched by string and must
be read from a real run; that the deploy step stays inside `ci` because a skipped
`needs` dependency skips its dependent; and the measured `db` job wall time from
Phase 3.

#### 4. Test plan §7 and §8

**File**: `context/foundation/test-plan.md`

**Intent**: Record the declined test-volume floor as a decision, and refresh the
freshness ledger.

**Contract**: One new §7 bullet — test volume and coverage thresholds are not
defended, with the reasoning (no §2 risk names it; §6.5's mutation ledger is the
oracle guard and is deliberately manual) and the revisit trigger (a coverage
regression reaching users, or a second contributor joining). Source it to this
phase, matching the existing bullets' attribution style. In §8, bump the
strategy review date and note that §5 was re-reviewed at gate-wiring time.

#### 5. Roadmap

**File**: `context/foundation/roadmap.md`

**Intent**: F-06 is the only M-2 element not `done`, and its one Unknown is the
placement decision this phase resolved.

**Contract**: Set the `F-06` row in `## At a glance` and the `- **Status:**` line
in the `### F-06` body to `done`; strike the Unknown with the resolved answer in
the style `roadmap.md:93` already uses for F-03's resolved unknown. Also resolve
open question 2 in the open-questions list, which names F-06 as its blocker. Bump
the frontmatter `updated:`. MS-06 can be marked satisfied. **Run
`npm run format:check` after editing** — this file is the one that was already
drifting.

#### 6. Change identity

**File**: `context/changes/testing-quality-gates/change.md`

**Contract**: `status: implemented`, `updated:` to today.

### Success Criteria:

#### Automated Verification:

- The ruleset exists with no bypass actors:
  `gh api repos/Keitar6/10xDevs-YT-Niche-Adviser/rulesets --jq '.[].name'` lists it,
  and its detail shows `"bypass_actors": []`
- The required check names in the ruleset exactly match the names emitted by a
  real run
- A direct `git push` to `master` is rejected by the remote
- All four gates still green on the final PR: `npm run lint && npm run typecheck && npm run format:check && npm test`
- `ruleset.json` exists in the change folder

#### Manual Verification:

- Open a PR carrying a deliberate type error; confirm the merge button is blocked
  and the blocking check is named. Close without merging
- Open a docs-only PR; confirm it is mergeable with `db` reported as skipped —
  this is the deadlock case the job-level `if:` exists to prevent, and the one
  failure mode that would lock the repository
- Confirm the ruleset applies to you: attempt a direct push to `master` and
  observe the rejection
- `test-plan.md` §5 now describes gates that all exist; §3 Phase 4 status reads
  `complete`
- Read §6.7 as a stranger: could someone add a fifth gate from it without
  rediscovering the Pending-check deadlock?

**Implementation Note**: This is the final phase. The ruleset lands last within
it — do not create it before the documentation commits are pushed, or the very
PR carrying them becomes the first thing it blocks.

---

## Testing Strategy

This phase wires gates rather than adding tests, so its own verification is
**adversarial**: every gate is proven by making it fail on purpose and then
reverting. That discipline is inherited from `test-plan.md` §6.3 ("break the
policy it covers and confirm the file goes red") and §6.5's mutation recipe, and
applied one level up — to the gate instead of the assertion.

### Gate mutation checks (one per gate, all in the Manual criteria above):

- **format**: introduce a formatting error → CI red on `format:check`
- **typecheck**: introduce a type error → CI red on `typecheck`
- **policy tests**: `alter policy … using (true)` → `db` job red
- **enforcement**: open a PR with any of the above → merge blocked

### The one check that is not a mutation:

- **The skipped-`db` path.** A docs-only PR must stay mergeable. This cannot be
  proven by breaking something — it is proven by the absence of a deadlock, and
  it is the failure mode with the worst blast radius, since the repository would
  be locked against its own author with no bypass actor configured.

### Unchanged:

`npm test` (12 files / 166 tests, 0.65s) and `npm run test:db` (5 files) are not
modified by this phase beyond the four type-error fixes in `routes.test.ts`,
whose non-weakening is itself verified by mutation in Phase 1.

## Performance Considerations

The `ci` job grows by roughly **16s** (`format:check` ~2s, `typecheck` ~13.9s
measured) on a run currently around a minute. Acceptable, and the ordering puts
the cheapest gate first so a formatting failure does not wait on a typecheck.

The `db` job is the real cost and the reason for the paths scoping. It runs in
parallel with `ci`, so it extends wall time only on the minority of changes that
touch `supabase/**` — four migrations exist in total. The trimmed
`supabase start -x` is what keeps that cost bounded; Phase 3 measures it and
§6.7 records the number so a future reader can tell whether the scoping still
earns its complexity.

## Migration Notes

The ruleset is the only change that is not a file in this repository, and the
only one with a recovery story worth stating: if a required check name is wrong
or CI breaks for an external reason (the `astro sync` remote Cloudflare proxy
session is the live candidate — `ci.yml:10-15`), merges block with no bypass
actor to route around it. Recovery is to disable or edit the ruleset in the
GitHub UI, which takes seconds. Keeping `ruleset.json` in the change folder means
re-enabling it afterwards is a single `gh api` call rather than a re-derivation.

## References

- Test plan: `context/foundation/test-plan.md` — §3 Phase 4, §5, §6, §7
- Roadmap: `context/foundation/roadmap.md` — F-06 (lines 125-138), and the
  resolved-unknown style at line 93
- Prior phases: `context/archive/2026-09-14-testing-scoring-oracle/`,
  `context/archive/2026-09-14-provable-user-isolation/`,
  `context/archive/2026-09-14-testing-analyze-boundary-resilience/`
- Current CI: `.github/workflows/ci.yml`
- pgTAP conventions: `supabase/tests/README.md`
- GitHub docs (via Context7): required status checks and skipped jobs —
  `workflow-syntax`, `trigger-a-workflow`, `control-jobs-with-conditions`
- Supabase CLI `start --exclude` container list: `cli_v1_commands.yaml`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Green the Floor and Script the Gates

#### Automated

- [x] 1.1 Typecheck passes: `npm run typecheck` exits 0 with `0 errors` — 0749c6d
- [x] 1.2 Format check passes: `npm run format:check` exits 0 — 0749c6d
- [x] 1.3 Tests still pass: `npm test` reports 12 files / 166 tests — 0749c6d
- [x] 1.4 Lint passes: `npm run lint` exits 0 — 0749c6d

#### Manual

- [x] 1.5 Envelope assertions still load-bearing after the narrowing (mutation check) — 0749c6d
- [x] 1.6 `git diff` on `roadmap.md` shows no semantic change — 0749c6d

### Phase 2: Wire the Always-On Gates into CI

#### Automated

- [x] 2.1 The pushed branch's CI run is green — a404db7
- [x] 2.2 Both new steps appear in the run log — a404db7
- [x] 2.3 The run's total wall time stays under two minutes — a404db7

#### Manual

- [x] 2.4 Deliberate formatting error turns CI red on `format:check`; reverted — a404db7
- [x] 2.5 Deliberate type error turns CI red on `typecheck`; reverted — a404db7
- [x] 2.6 `CLAUDE.md`'s `## CI` section matches `ci.yml` step for step — a404db7

### Phase 3: Policy-Test Gate in CI, Scoped to `supabase/**`

#### Automated

- [x] 3.1 On a `supabase/`-touching branch, the `db` job runs green with all five pgTAP files — 3c45ea5
- [x] 3.2 pgTAP assertion count under the trimmed start equals the local count — 3c45ea5
- [x] 3.3 On a branch touching no `supabase/` path, `db` is skipped and the run is green — 3c45ea5
- [x] 3.4 The `ci` job's wall time is unchanged from Phase 2 — 3c45ea5

#### Manual

- [x] 3.5 Skipped `db` renders as "This check was skipped", not as failing — 3c45ea5
- [x] 3.6 `db` job wall time recorded for the §6.7 entry — 3c45ea5
- [x] 3.7 Broken policy turns the `db` job red; reverted — 3c45ea5

### Phase 4: Enforce with a Ruleset, and Close the Documentation Loop

#### Automated

- [ ] 4.1 Ruleset exists with `"bypass_actors": []`
- [ ] 4.2 Required check names exactly match the names emitted by a real run
- [ ] 4.3 A direct `git push` to `master` is rejected by the remote
- [ ] 4.4 All four gates green on the final PR
- [ ] 4.5 `ruleset.json` exists in the change folder

#### Manual

- [ ] 4.6 PR with a deliberate type error is blocked from merging
- [ ] 4.7 Docs-only PR is mergeable with `db` reported as skipped
- [ ] 4.8 Direct push to `master` rejected for you personally (no bypass)
- [ ] 4.9 `test-plan.md` §5 describes only gates that exist; §3 Phase 4 reads `complete`
- [ ] 4.10 §6.7 is sufficient for a stranger to add a fifth gate without rediscovering the Pending-check deadlock
