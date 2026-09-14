<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Quality-Gates Wiring

- **Plan**: `context/changes/testing-quality-gates/plan.md`
- **Scope**: Full plan — Phases 1–4 of 4
- **Date**: 2026-09-14
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 6 warnings, 4 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Evidence base

Automated criteria re-run locally at `26b5f74` (clean tree):

| Gate                   | Result                                       |
| ---------------------- | -------------------------------------------- |
| `npm run format:check` | exit 0, clean                                |
| `npm run lint`         | exit 0                                       |
| `npm run typecheck`    | 82 files — **0 errors**, 0 warnings, 4 hints |
| `npm test`             | **12 files / 166 tests**, 417ms              |
| `ruleset.json` present | yes                                          |

Enforcement verified against live GitHub, not just the notes: ruleset `23294037`
"master: gates required", `enforcement: active`, `bypass_actors: []`,
`current_user_can_bypass: never`, `~DEFAULT_BRANCH`, required checks `ci` + `db`
(integration 15368). The checked-in `ruleset.json` matches the live object
field-for-field on every key it carries. `commits/master/check-runs` reports
`ci` success, `db` skipped, `changes` success — the required check-name strings
are real, and the skipped-`db` path is confirmed non-blocking.

All six CI run ids and all four PRs cited in `change.md` exist with the stated
conclusions (#26 MERGED, #27 CLOSED, #28 CLOSED, #29 MERGED). The manual
criteria are genuinely evidenced rather than rubber-stamped — unusually so.

Both self-reported deviations were checked independently. Deviation 1 (the
annotation form instead of an `as` cast) is **confirmed**: reintroducing the
cast produces `@typescript-eslint/no-unnecessary-type-assertion` at
`routes.test.ts:196`, so the plan's literal form really is impossible under
`strictTypeChecked`. Deviation 2 is **wrong about its cause** — see F6.

Every "What We're NOT Doing" guardrail held: no coverage tooling, no e2e
dependency, no dep-audit/security-scan/bundle-size/license step, no pre-push
hook, deploy still a step inside `ci`, no Docker layer caching, and `typecheck`
is bare `astro check` with no lowered failure severity (the 4 `ts(6387)` hints
still emit without blocking).

One undeclared file: `supabase/tests/README.md` (+32 lines, `b61f4ab`). No
"Changes Required" item covers it, but it documents the very job this phase
built, its content is accurate, and it carries the corrected image-pull number.
Benign and on-subject, so Scope Discipline is recorded as PASS rather than
WARNING — flagged here so that call is visible rather than silent.

## Findings

### F1 — The `changes` detector fails open, and §6.7 argues the wrong way about it

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: `.github/workflows/ci.yml:51-53`, `context/foundation/test-plan.md:591-592`
- **Detail**: `db` is gated on `needs: changes` plus a job-level `if:`. The
  workflow's own comment (`ci.yml:13-18`) establishes that a job skipped by `if:`
  reports **Success** — which is also true when the job is skipped because its
  `needs` dependency **failed**. `changes` is deliberately not a required check,
  so a failed `changes` job leaves `db` reporting skipped-success and the PR
  mergeable with the policy suite never executed. §6.7 justifies the exclusion
  with "Requiring it adds a name to keep in sync and **guarantees nothing**" —
  that is precisely inverted: requiring it is what would guarantee the detector
  actually ran. A second, quieter path exists at `ci.yml:42`: GitHub's default
  step shell is `bash -e {0}` with **no `pipefail`**, so in
  `git diff … | grep -q .` the pipeline's status is `grep`'s alone. If `git diff`
  fails after the `cat-file -e` guard passed, `grep` sees empty stdin, exits 1,
  and the `else` branch writes `supabase=false` — green job, "no database
  changes". Both paths contradict the in-script guards at `ci.yml:37-41`, which
  are carefully written to err _toward_ running. The failure direction here is
  "the gate disappears", on the one gate CLAUDE.md calls the only thing standing
  between two users. Mitigated, not closed, by `npm run test:db` being a
  mandated local gate.
- **Fix A ⭐ Recommended**: Make `db` err toward running when its detector did not
  succeed, and fix the pipeline masking.
  ```yaml
  db:
    needs: changes
    if: always() && (needs.changes.result != 'success' || needs.changes.outputs.supabase == 'true')
  ```
  plus `shell: bash` on the `filter` step so `pipefail` applies.
  - Strength: Matches the failure direction the job's own guards already chose
    (`ci.yml:37-41` treats an undiffable base as "changed"); costs one runner on
    a rare infra failure and nothing otherwise; no new required-check name to
    keep in sync.
  - Tradeoff: The `if:` expression gets harder to read, and `always()` needs the
    cancellation case thought through.
  - Confidence: HIGH — the skipped-on-failed-dependency behaviour is documented
    GitHub semantics, and the `bash -e` vs `-eo pipefail` default is the
    documented difference between an implicit and an explicit `shell:` key.
  - Blind spot: Not exercised on a real run; `changes` has never actually failed
    here, so the fail-open is reasoned rather than observed.
- **Fix B**: Add `changes` to `required_status_checks` in the ruleset and
  `ruleset.json`.
  - Strength: One line, no workflow logic; a broken detector then blocks rather
    than waves through.
  - Tradeoff: Contradicts a rule §6.7 states explicitly, so §6.7 must be
    rewritten too; adds a third name matched by string, which §6.7 correctly
    calls out as a maintenance hazard.
  - Confidence: MEDIUM — closes the `needs`-failure path but not the `pipefail`
    path, since that one leaves `changes` green.
  - Blind spot: Whether a required `changes` interacts badly with any future
    workflow-level skip.
- **Decision**: FIXED via Fix A — applied to `.github/workflows/ci.yml` with two amendments: `!cancelled()` instead of `always()` (so a cancelled run does not start `db`), and the `git diff | grep -q` pipeline replaced with a capture, because `shell: bash`/`pipefail` alone would still have fallen through to the `else` branch and written `supabase=false`. Verified by mutation: on a git-diff-failure case the old form writes `supabase=false` with exit 0, the new form writes `supabase=true`. Five other cases (touches supabase/, docs-only, all-zero base, unreachable base, empty base) all unchanged. **The §6.7 wording ("requiring it guarantees nothing") is not yet corrected** — carried into the documentation batch below.

### F2 — The paths scope does not watch the file that defines the gate

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `.github/workflows/ci.yml:42`
- **Detail**: The pathspec is `-- supabase/`. A change to
  `.github/workflows/ci.yml` itself does not match it, so `db` skips. The `-x`
  exclusion list on `ci.yml:68-70` — which `CLAUDE.md` and
  `supabase/tests/README.md` both call load-bearing — can therefore be edited,
  extended, or the `db` job deleted outright, and merged without the pgTAP suite
  ever running under the new configuration. The change most likely to break the
  gate is the one change the gate does not watch. This is not a fail-open under
  fault conditions like F1; it is the designed behaviour.
- **Fix**: Widen the pathspec to `-- supabase/ .github/workflows/ci.yml`.
- **Decision**: FIXED — pathspec widened to `supabase/ .github/workflows/ci.yml`. Verified by replay: a commit touching only `ci.yml` + `CLAUDE.md` (`a404db7`) now yields `supabase=true`, where the old pathspec yielded `false`.

### F3 — No job timeouts, on a repo with no bypass actor

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `.github/workflows/ci.yml` (no `timeout-minutes` on any of the three jobs)
- **Detail**: All three jobs inherit the 360-minute default. The plan's own
  Migration Notes name this exact exposure — "merges block with no bypass actor
  to route around it" — and the live ruleset confirms `bypass_actors: []` with
  `current_user_can_bypass: "never"`. A stalled `npx supabase start` image pull
  (`ci.yml:68-70`, the step measured at ~83s of the job's 111s) holds the
  required `db` check for up to six hours; cancelling reports `cancelled`, not
  success, so it still blocks until re-run. The plan identified the risk and
  priced the recovery as "edit the ruleset in the GitHub UI, which takes
  seconds" — a timeout is the cheaper half of that story and was not added.
- **Fix**: `timeout-minutes: 10` on `db`, `5` on `changes`, `20` on `ci`.
- **Decision**: FIXED — `timeout-minutes` 5 / 10 / 20 on `changes` / `db` / `ci`.

### F4 — The workflow still asserts the image-pull claim Phase 3 disproved

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `.github/workflows/ci.yml:65-66`
- **Detail**: The comment reads "Excluding the other thirteen containers turns a
  fourteen-image pull into one." Phase 3 measured **five** images pulled and
  `624f45e` corrected that number in `supabase/tests/README.md`,
  `test-plan.md` §6.7 ("`-x` bounds which containers start, not which images are
  pulled… still pulled five images", `:601-604`) and `change.md` — but not in
  the workflow comment, which is the copy a future editor reads first while
  editing the `-x` list. `ci.yml:65` is now the only surviving place carrying the
  disproven number.
- **Fix**: Update the comment to the measured five-image figure and point at
  `test-plan.md` §6.7, matching the correction already made in the other three
  files.
- **Decision**: FIXED — comment corrected to the measured result: `-x` leaves one container running but still pulled five images, and the `supabase/**` scoping rather than the trimming is what keeps the job affordable. Now agrees with `supabase/tests/README.md` and §6.7.

### F5 — `CLAUDE.md`'s CI section says the workflow has one job; it has three

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `CLAUDE.md:94`
- **Detail**: "One job, `ci`, running in order:" was true when written in Phase 2
  (`a404db7`) and went stale in Phase 3 when `changes` and `db` were added to the
  same workflow. The step chain beneath it is still exact, and the `db` job is
  described correctly at `CLAUDE.md:66-82`, but the `## CI` section is the
  canonical description and now tells a reader the workflow has one job. Progress
  item 2.6 ("`CLAUDE.md`'s `## CI` section matches `ci.yml` step for step") is no
  longer satisfied for the job list — Phase 3's own edit invalidated a Phase 2
  criterion, which is the cross-phase interaction this review exists to catch.
- **Fix**: Change to "Three jobs — `changes` (plumbing), `db` (conditional on
  `supabase/**`), and `ci`, which runs in order:" and keep the step chain as-is.
- **Decision**: FIXED — `## CI` now reads "Three jobs: `changes` (plumbing), `db` (conditional), and `ci`, which runs in order:". Step chain unchanged; Progress item 2.6 holds again.

### F6 — The recorded Phase 1 deviation misattributes its own cause

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `context/changes/testing-quality-gates/change.md:28-33`
- **Detail**: The note claims "the repo-wide Prettier pass in `736de34` had
  already normalised that file". It had not: `git show 736de34 --name-only`
  covers 95 files and `context/foundation/roadmap.md` is not among them, and
  running the project's own Prettier against `git show 4519924:…/roadmap.md`
  still reports DRIFTED. What actually happened is that `0749c6d` flipped the
  At-a-glance `Status` cell `planning` → `in-progress` (8 → 11 chars), which
  incidentally widened the over-wide column into correctness, so `roadmap.md`
  fell out of drift as a side effect of a status edit. The other half of the
  claim is true — `plan.md` and `plan-brief.md` were genuinely drifted and
  genuinely normalised. No functional consequence (`format:check` is green), but
  the note is the record a future reader trusts when re-deriving this history.
- **Fix**: Correct the note to say the drift was resolved incidentally by the
  `planning → in-progress` status flip in `0749c6d`, not by `736de34`.
- **Decision**: FIXED — the deviation note now records the real cause (the `planning → in-progress` status flip in `0749c6d` widened the At-a-glance `Status` column from 8 to 11 chars, clearing the drift as a side effect) and marks the correction as coming from this review.

### F7 — The ruleset mirror is missing a field that is live

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `context/changes/testing-quality-gates/ruleset.json:19-27`
- **Detail**: The file matches live ruleset `23294037` on every key it carries.
  Two fields exist live but not in the file, inside the `pull_request` rule:
  `required_reviewers: []` (a harmless default) and
  `require_extra_approval_for_unattributed_changes: true` (currently **on** in
  production). The file's stated purpose is a faithful restore artifact — the
  plan's Migration Notes call re-enabling it "a single `gh api` call rather than
  a re-derivation" — so a mirror that omits a live enforcement field is a mirror
  that restores a slightly weaker ruleset. The `deletion` rule is a fourth rule
  where the contract named three; benign and arguably implied by "block
  non-fast-forward / direct pushes", but also undeclared.
- **Fix**: Re-dump the live ruleset over `ruleset.json` rather than hand-editing
  it, and note in §6.7 that GitHub adds fields over time so the mirror should be
  refreshed from the API.
- **Decision**: FIXED — `ruleset.json` re-dumped from `gh api …/rulesets/23294037` rather than hand-edited, so it now carries `require_extra_approval_for_unattributed_changes: true` and `required_reviewers: []`. Restoring from the file now reproduces the live enforcement exactly.

### F8 — A red `db` on a master push does not stop the deploy

- **Severity**: 📋 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture
- **Location**: `.github/workflows/ci.yml:103-109`, `context/foundation/test-plan.md:593-596`
- **Detail**: The deploy condition itself is correct and cannot fire from a PR
  (`github.ref` is `refs/pull/N/merge` on `pull_request`, and the `event_name`
  clause is belt-and-braces). But `ci` and `db` are independent jobs with no
  ordering, so on a master push touching `supabase/**`, `wrangler deploy` runs as
  soon as `ci`'s build finishes — while `db` is still in its ~83s stack start,
  and regardless of how `db` concludes. §6.7's defence is that "the ruleset gates
  deploy transitively, because every path to `master` now goes through a PR whose
  checks passed". That is mostly true and is a sound reason not to split the job
  — but it is weaker than stated, because `strict_required_status_checks_policy`
  is `false`, so a PR merges on checks computed against an older base rather than
  against the tree that gets deployed. The plan's decision not to split is still
  the right call; the documentation just claims slightly more than it delivers.
- **Fix**: Amend §6.7 to state plainly that a red `db` on a master push does not
  stop that push's deploy, and that the transitive gate is bounded by
  `strict_required_status_checks_policy: false`. Prefer this to restructuring the
  job — the plan's reasoning against `needs: [ci, db]` is correct.
- **Decision**: FIXED — §6.7's deploy bullet now states plainly that `ci` and `db` are unordered, so a master-push deploy fires regardless of how `db` ends, and that the transitive gate is bounded by `strict_required_status_checks_policy: false`. Job structure deliberately unchanged; the plan's reasoning against `needs: [ci, db]` stands, and the strict policy is named as the thing to revisit if a second contributor joins.

### F9 — Workflow hardening omissions on a public repo

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `.github/workflows/ci.yml:1-8`, `:105`
- **Detail**: Three small gaps, none exploitable today. (a) No `permissions:`
  block at workflow or job level. The repo setting is currently
  `default_workflow_permissions: "read"`, so impact is nil — but that is a silent
  dependency on a setting any admin can flip, and `actions/checkout@v4` defaults
  to `persist-credentials: true`. (b) No `concurrency:` group anywhere in
  `.github/`, so rapid pushes queue full duplicate runs, each paying `npm ci`,
  the Cloudflare remote proxy session, and — on `supabase/**` — the 111s `db`
  job; now that these are required checks, a superseded run also keeps a PR
  pending longer. (c) `cloudflare/wrangler-action@v4` (`:105`) is a third-party
  action pinned to a mutable tag while being handed the production deploy
  credential; pre-existing, but in scope now that this file is the enforcement
  surface. Positively: there is no `pull_request_target`, no untrusted string is
  interpolated into any `run:` body (the one candidate goes through `env: BASE`
  and is quoted at every use), and the job-level secrets at `:80-82` are scoped
  to `ci` alone — `changes` and `db` inherit none.
- **Fix**: Add `permissions: contents: read` at the top of the workflow, add a
  `concurrency:` group keyed on `github.workflow` + PR number/ref with
  `cancel-in-progress` only for `pull_request`, and SHA-pin
  `cloudflare/wrangler-action` with a trailing version comment.
- **Decision**: FIXED — added `permissions: contents: read`, a `concurrency:` group keyed on workflow + PR number/ref with `cancel-in-progress` only for `pull_request` (never master, so a deploy is not interrupted and no required check is left `cancelled`), and SHA-pinned `cloudflare/wrangler-action` to `ebbaa1584979971c8614a24965b4405ff95890e0 # v4.0.0`.

### F10 — `test-plan.md` §4 still reports eight test files

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: `context/foundation/test-plan.md:103`
- **Detail**: The §4 stack table's "unit + integration" row says "Eight test
  files: five service tests plus the route, middleware and source-scan files" —
  the suite is 12 files / 166 tests, a number §6.7 itself states correctly at
  `:548`. Pre-existing rather than introduced by this change, but Phase 4 #4's
  contract bumped §8 to record §1–§5 as "last reviewed 2026-09-14", and §4 is
  inside that range, so the freshness stamp now asserts a review that would have
  caught it.
- **Fix**: Update the §4 cell to "Twelve test files / 166 tests" with the current
  breakdown.
- **Decision**: FIXED — §4 now reads "Twelve test files / 166 tests: nine service tests plus the route, middleware and source-scan files". Breakdown verified on disk: 9 under `src/lib/services/`, plus `routes.test.ts`, `middleware.test.ts`, `no-privileged-client.test.ts`.

## Triage outcome

All ten findings fixed. One item was raised during triage and **declined**: §6.7
still reads "Don't require the `changes` job. It is plumbing. Requiring it adds a
name to keep in sync and guarantees nothing." The F1 fix makes the _workflow_
err toward running when the detector does not succeed, so the repository is no
longer exposed — but that sentence still argues the fail-open case is harmless,
which is the reasoning F1 showed to be inverted. Left as-is by decision; worth
revisiting the next time §6.7 is edited.

Post-fix gate run, clean:

| Gate                   | Result                                       |
| ---------------------- | -------------------------------------------- |
| `npm run format:check` | exit 0, clean                                |
| `npm run lint`         | exit 0                                       |
| `npm run typecheck`    | 82 files — 0 errors, 0 warnings, 4 hints     |
| `npm test`             | 12 files / 166 tests                         |
| workflow YAML          | parses; `bash -n` clean on the filter script |

The `changes` detector was replayed against six inputs after the edit — touches
`supabase/`, `ci.yml`-only, docs-only, all-zero base, unreachable base, empty
base — and errs toward running in every case except the genuine docs-only one.
