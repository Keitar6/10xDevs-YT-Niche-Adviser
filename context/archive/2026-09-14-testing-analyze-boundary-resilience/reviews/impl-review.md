<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Analyze-pipeline Boundary Resilience

- **Plan**: context/changes/testing-analyze-boundary-resilience/plan.md
- **Scope**: Full plan — Phases 1–4 of 4 (all Progress items `[x]`)
- **Date**: 2026-09-14
- **Verdict**: NEEDS ATTENTION (all 7 findings fixed during triage — see Decisions)
- **Findings**: 0 critical, 2 warnings, 5 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Automated verification (re-run during this review)

| Check             | Result                                                                        |
| ----------------- | ----------------------------------------------------------------------------- |
| `npm test`        | PASS — 8 files, 110 tests                                                     |
| `npm run lint`    | PASS — clean                                                                  |
| `npx astro check` | PASS — 0 errors, 0 warnings (4 hints, all pre-existing in `eslint.config.js`) |
| `npm run build`   | PASS — server built in 13.06s                                                 |

Manual items 1.5, 2.6, 2.7, 3.6, 4.5–4.8 are all `[x]`. Item 1.5 carries written
evidence in `change.md:24-29` (the truncated/wrong-key cases were observed failing
with the old message before the G5 branch landed). The remaining seven are
browser/live-key checks with no artifact in the diff. The user re-confirmed all
seven by hand on 2026-09-14, after this review's fixes landed; the confirmation is
recorded in `change.md` under `## Notes`.

## Guardrails

All nine "What We're NOT Doing" boundaries hold. Verified individually:
`vitest.config.ts` and `package.json` are byte-unchanged on the branch (no config
widening, no mocking library); `resolveChannelRefs` and `src/pages/api/profile.ts`
are untouched; there is no `stop_reason === "max_tokens"` guard; the presence rule
tests `trim().length > 0` only, with no length floor; `maxRetries: 0` is intact at
`justify.ts:108`; no route-level test, no UI look-and-feel test, no e2e file.

## Findings

### F1 — The transport notice claims a ranking that is not there

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/analyze/AnalyzePanel.tsx:159-164
- **Detail**: The new `transport`/`malformed` notice is gated only on
  `failedToLoad.length > 0`, never on whether a ranking exists. When every
  competitor transport-fails, `fetched.channels.length === 0`, `analyze.ts:177`
  returns `emptyResult`, and the panel renders the warning
  _"…so the ranking below covers the remaining competitors"_ immediately above the
  empty-state notice carrying `empty_reason` = _"None of your 3 competitor channels
  could be analysed. Their data could not be loaded this run: …"_. Two adjacent,
  contradicting notices, and the warning's claim is false — there is no ranking and
  no remaining competitor. The same contradiction appears whenever
  `opportunities.length === 0` for any reason (all-skipped at `analyze.ts:204`,
  all-too-recent at `analyze.ts:215`) while a transport failure is also present.
  This is the confidently-wrong-empty-state class that G2 exists to remove, so it
  lands inside the change's own stated purpose. The route gets this right —
  `describeUnresolved` (`analyze.ts:60-72`) only emits its sentences under the
  `channels.length === 0` branch; only the UI is ungated.
- **Fix**: Gate the notice on `failedToLoad.length > 0 && result.opportunities.length > 0`.
  - Strength: Every empty-opportunities path already sets `empty_reason`
    (`analyze.ts:183`, `:209`, `:220`), and all three name the failed competitors,
    so suppressing the notice loses no information — it removes a duplicate that
    happens to be wrong. One boolean, one file.
  - Tradeoff: The partial case keeps the current wording, which is accurate there;
    splitting the copy into two sentences would read better but is a larger edit
    for no correctness gain.
  - Confidence: HIGH — traced all three empty-ranking exits in `analyze.ts` and
    confirmed each sets `empty_reason` covering the failed ids.
  - Blind spot: Not exercised by any test — §7 of the test plan rules out UI tests,
    so this stays a hand-checked path either way. The user confirmed the
    all-competitors-fail case by hand on 2026-09-14, after the fix landed.
- **Decision**: FIXED — gated the notice on `result.opportunities.length > 0` (AnalyzePanel.tsx:163), with the reason recorded in the comment above it.

### F2 — The fallback-branch test never reaches the branch it names

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/justify.test.ts:250-258
- **Detail**: `it("degrades rather than throwing when the failure is not one the SDK models")`
  stubs `fetch` to reject with the bare string `"not even an error object"`. The SDK
  wraps that into an `APIConnectionError`, so the assertion lands on
  `justify.ts:143` — the branch already covered by the test at `:234` — not on the
  generic fallback at `justify.ts:159`. Confirmed by mutation: changing
  `"Justifications could not be generated."` to a sentinel string leaves all 13
  tests in the file passing. The test is also the one vacuous assertion in the three
  new suites (`expect(result.ok).toBe(false)` where every sibling pins the full
  object). This is an extra case not in the plan's enumerated list, and the plan's
  §"Critical Implementation Details" makes catch-branch ordering the load-bearing
  detail of Phase 1 — so the one branch with no coverage is the one the ordering
  argument ends at.
- **Fix**: Assert the concrete message and rename the test to the branch it actually
  covers; then either cover the true fallback by throwing from inside the `try`
  before the SDK call, or drop the case and record at `justify.ts:159` that the
  branch is an unreachable defensive floor.
  - Strength: Restores the file's own standard (`toEqual` on the full result) and
    stops the suite claiming coverage it does not have — which matters more here
    than usual, since pinning the SDK's error taxonomy is this file's stated value.
  - Tradeoff: Reaching the real fallback needs a throw from inside the `try` that is
    not an `AnthropicError`, which is slightly contrived; the honest alternative is
    to admit the branch is unreachable.
  - Confidence: HIGH — mutation-verified in this worktree; the sentinel survived all
    13 tests.
  - Blind spot: Have not checked whether any non-`AnthropicError` throw is genuinely
    reachable between `justify.ts:108` and the `parse()` call.
- **Decision**: FIXED — split into two tests: the bare-string rejection now pins the APIConnectionError message under an accurate name, and a new case reaches the real fallback via a malformed row (`buildPrompt` runs inside the try). Mutation-verified: the sentinel now fails exactly one test.

### F3 — test-plan.md §4 and roadmap.md left contradicting what shipped

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Detail**: Phase 4 updated §6.2, §6.6 and the §3 status row exactly as specified,
  but three forward-references elsewhere in the same documents now state the
  opposite of what landed. `test-plan.md:103` still says _"§3 Phase 1 widens it"_
  about `vitest.config.ts`'s `include` — the plan explicitly ruled that out and the
  file is unchanged. `test-plan.md:104` still lists boundary faking as
  _"none yet — see §3 Phase 1 … Phase 1 chooses between the runner's built-in fetch
  stubbing and a dedicated interceptor"_ — that choice was made and is documented in
  §6.2. `test-plan.md:128` repeats the include-widening claim. Separately,
  `roadmap.md:53` and `:108` mark F-04 `in-progress` while `test-plan.md:83` marks
  the same phase `complete`.
- **Location**: context/foundation/test-plan.md:103
- **Fix**: Correct the three §4/§5 rows to record that the include stayed scoped and
  that `vi.stubGlobal` is the chosen mechanism (citing §6.2), and reconcile the
  roadmap F-04 status with §3 — noting the roadmap has no `complete` value in its
  vocabulary yet, so `/10x-archive` may be the right place to flip it.
- **Decision**: FIXED — corrected test-plan.md:103, :104 and :128. roadmap.md F-04 deliberately left to /10x-archive, since the roadmap vocabulary has no `complete` value yet.

### F4 — Two minor location/import drifts from the plan's contract

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Detail**: Both are departures from the letter of the plan that are arguably
  better than what it specified. (a) Phase 2 said `UnresolvedCompetitor` would be
  "exported as a named interface alongside `SkippedChannel`" in `types.ts`; it is
  instead declared at `youtube.ts:326-333` and re-exported at `types.ts:11`, which
  is what `types.ts:3-4`'s own stated convention asks for. (b) Phase 3 said the
  merge helper would use "relative imports only"; `justification-merge.ts:16` uses
  `import type { AnalyzeOpportunity } from "@/types"`. It resolves under Vitest only
  because the import is type-only and erased — `vitest.config.ts` defines no alias.
  The same type-only-alias pattern already exists in a tested module
  (`content-opportunity.ts:2`), so it is house style, but this is the only file
  under `src/lib/` importing from `@/types`, inverting the
  `types.ts → services` direction.
- **Location**: src/types.ts:11
- **Fix**: Leave both as-is and add a one-line comment at `justification-merge.ts:16`
  noting the import is deliberately type-only (a value import via `@/` would fail to
  resolve in Vitest).
- **Decision**: FIXED — added the type-only-import rationale at justification-merge.ts:16. Both structures left as they are; each matches the repo's own convention better than the plan's wording did.

### F5 — "Same handling" comment claims a parity the code does not have

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/analyze.ts:96
- **Detail**: The new top-level catch comments _"Same handling as the profile read
  failure below"_, but the profile branch logs `error.message` only
  (`analyze.ts:143`) while the new one logs the whole `error`. Logging the full
  object is the better choice for an unknown throw — you want the stack — so the
  code is right and the comment is wrong. Everything else does mirror the existing
  branch exactly, including the `eslint-disable-next-line no-console -- deliberate:
no logger exists yet` form the plan called for.
- **Fix**: Amend the comment to say it mirrors the shape but logs the full error
  deliberately, since the throw is unknown here.
- **Decision**: FIXED — analyze.ts:93-96 now states the deliberate difference (full error vs `error.message`) instead of claiming parity.

### F6 — `resolved` doc comment is now provably wrong

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/types.ts:51
- **Detail**: `/** Of those, the ones 'channels.list' returned a usable channel for. */`
  describes `resolved`, but `analyze.ts:168` sets it to `fetched.channels.length`,
  which excludes channels that resolved from `channels.list` and _then_ transport-
  failed. Pre-existing wording, but the new reason codes make the gap observable: a
  channel can now be absent from `resolved` **and** carry `reason: "transport"` in
  `unresolved`, which the doc implies is impossible. `AnalyzePanel.tsx:145` renders
  "Resolved X of Y" straight off this field.
- **Fix**: Reword to "…returned a usable channel for **and** whose uploads were
  fetched successfully."
- **Decision**: FIXED — types.ts:51-56 reworded to say the count also requires a successful uploads fetch, and names the `transport` overlap.

### F7 — Error-path tests skip the type assertion; one arm uncovered

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/youtube.test.ts:166
- **Detail**: Only the first classification test (`:154`) asserts
  `expect(error).toBeInstanceOf(YouTubeError)`; the rest read
  `(error as YouTubeError).failure.kind` directly, so if the function ever resolved
  instead of rejecting they would fail with an opaque
  `TypeError: Cannot read properties of undefined` rather than a readable diff.
  Diagnostics, not correctness — they do still fail. Separately, the
  non-`YouTubeError` arm of the reason mapping (`youtube.ts:538`) has no test; it is
  likely unreachable, since everything inside the fan-out funnels through `getJson`.
- **Fix**: Hoist the `toBeInstanceOf` check into a shared `expectYouTubeError()`
  helper, and comment `youtube.ts:538`'s fallback as a deliberate unreachable floor.
- **Decision**: FIXED — added `expectYouTubeError()` (youtube.test.ts:142-152), replacing 11 bare casts and 2 duplicated assertion pairs; youtube.ts:537-539 now records the non-`YouTubeError` arm as an uncovered defensive floor.
