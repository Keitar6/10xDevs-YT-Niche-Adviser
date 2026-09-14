# Quality-Gates Wiring — Plan Brief

> Full plan: `context/changes/testing-quality-gates/plan.md`
> Upstream: `context/foundation/test-plan.md` §3 Phase 4, §5 · `context/foundation/roadmap.md` F-06

## What & Why

The last phase of the test rollout. Phases 1–3 built a floor — boundary
resilience, provable per-user isolation, a scoring oracle. This phase makes that
floor **enforced rather than documented**: a change that breaks types,
formatting, tests, the build, or the database policy suite will not be able to
reach `master`. Roadmap F-06 / MS-06, the only M-2 element still open, and the
one whose prerequisites are non-empty precisely because a gate can only lock a
floor that already exists.

## Starting Point

CI is further along than the docs claim — `ci.yml` already runs
`astro sync → lint → test → build → deploy` sequentially, while `CLAUDE.md` still
says "lint + build". But three gates are unenforced and two are actively failing:
**`astro check` reports 4 errors** (all in `src/pages/api/routes.test.ts`, all
`await response.json()` typed `unknown`), **`prettier --check` fails** on
`roadmap.md`, the pgTAP suite is local-only, and `master` has **no branch
protection at all** (`gh api …/protection` → 404). "Enforced" currently means a
red X and a skipped deploy.

## Desired End State

Every path to `master` runs through a pull request whose required checks passed,
with no bypass actors — including for you. Proven by opening a PR with a
deliberate type error and watching the merge button block, then opening a
docs-only PR and watching it merge with the Docker-bearing `db` check reported as
skipped.

## Key Decisions Made

| Decision              | Choice                                                              | Why (1 sentence)                                                                                                     | Source    |
| --------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------- |
| Enforcement mechanism | GitHub ruleset: PR required, checks required, **no bypass actors**   | Only option where "enforced" is literally true; a gate with the author on the bypass list is documentation again      | Plan      |
| Typecheck scope       | `astro check` over the whole tree, including tests                   | 13.9s, covers `.astro` + `.ts` + `.tsx` in one pass; excluding tests to go green would be the gate failing its first test | Plan      |
| Policy-test placement | CI job scoped to `supabase/**` via **job-level `if:`**               | Resolves the decision `roadmap.md:93` and §5 both deferred here; pays the image pull only when migrations change      | Plan      |
| Test-volume floor     | Not defended — recorded as a §7 exclusion                            | No §2 risk names it; a coverage percentage rewards the assert-nothing tests Phase 3 spent its time removing           | Plan      |
| Formatting gate       | `prettier --check .` in CI                                           | The live drift in `roadmap.md` proves lint-staged leaks; `npm run lint` already covers `.ts`/`.tsx`/`.astro`          | Plan      |
| e2e                   | Deferral re-affirmed, dated                                          | §1 cost × signal and §7 both still rule it out; nothing changed since 2026-09-13 except that someone re-checked       | Test plan |
| Deploy structure      | Stays a step inside `ci`, not a separate job                         | The ruleset gates it transitively, and `needs: [ci, db]` would break it — a skipped dependency skips its dependent    | Plan      |

## Scope

**In scope:** fixing the 4 live type errors · `typecheck` + `format:check`
scripts · both wired into the existing `ci` job · a paths-scoped `db` job running
trimmed `supabase start` + pgTAP · a no-bypass ruleset on `master` · syncing
`test-plan.md` §5/§6.7/§7/§8, `roadmap.md` F-06, and `CLAUDE.md`.

**Out of scope:** coverage or test-count floors · e2e · dependency audit,
security scan, bundle-size budget · pre-push hooks · splitting the deploy job ·
Docker layer caching · lowering `astro check`'s failure severity to catch
upstream deprecation hints.

## Architecture / Approach

One workflow, three jobs. `ci` (always) gains two steps. `changes` computes a
`supabase/**` diff flag. `db` runs the pgTAP suite behind a **job-level**
condition on that flag. A ruleset then requires `ci` and `db` by name.

The whole plan is ordered by one rule: **green before wired, wired before
required.** Inverting any pair locks the repository against its own author.

## Phases at a Glance

| Phase                              | What it delivers                                      | Key risk                                                                             |
| ---------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1. Green the floor, script the gates | 4 type errors fixed, drift normalized, 2 new scripts | Narrowing `response.json()` too far would make the envelope assertions tautological  |
| 2. Wire the always-on gates          | `format:check` + `typecheck` in CI; `CLAUDE.md` fixed | `typecheck` must follow `astro sync` or it fails on missing generated types          |
| 3. Policy-test gate in CI            | `changes` + `db` jobs, trimmed Supabase start         | The trimmed `-x` start might drop a container the suite needs — measured, not assumed |
| 4. Enforce + close the loop          | Ruleset, `ruleset.json`, all documents synced         | A wrong check name, or a workflow `paths:` filter, deadlocks every merge with no bypass |

**Prerequisites:** F-03, F-04, F-05 — all `done`. Docker for Phase 3's local
verification. `gh` authenticated with admin rights on the repo for Phase 4.
**Estimated effort:** ~1–2 sessions across four phases; Phase 1 is minutes, Phase 4
is mostly documents.

## Open Risks & Assumptions

- **The deadlock is the real hazard, not the gates.** GitHub docs are explicit: a
  workflow skipped by a `paths:` filter leaves its check **Pending** and blocks
  merging, while a job skipped by `if:` reports **Success**. The plan uses the
  job-level form everywhere for that reason, and Phase 4 verifies the docs-only-PR
  path explicitly. With no bypass actor, getting this wrong locks the repo.
- **Required checks are matched by name string.** The plan reads the names off a
  real run before writing the ruleset rather than inferring them from job ids.
- **`astro sync` opens a remote Cloudflare proxy session** authenticating from the
  environment (`ci.yml:10-15`) — the pipeline's one external dependency. A token or
  network failure now blocks merges, not just deploys. Recovery is editing the
  ruleset in the UI; `ruleset.json` makes re-enabling it one command.
- **The trimmed `supabase start -x` is a reasoned claim, not a measurement.** pgTAP
  touches only the database and the `avatars` bucket row comes from a migration, so
  all thirteen containers should be excludable. Phase 3 proves it, with an explicit
  instruction to fall back rather than weaken an assertion.
- **A PR-per-change workflow is new here** — the last five commits went straight to
  `master`. That friction is what "enforced" costs.

## Success Criteria (Summary)

- A pull request that breaks types, formatting, tests, the build, or the policy
  suite **cannot be merged** — and that includes yours.
- A change touching no migration still merges without waiting on Docker.
- Every gate `test-plan.md` §5 describes as required actually exists and runs, and
  §6.7 tells the next contributor how to add a fifth without rediscovering the
  Pending-check deadlock.
