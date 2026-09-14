# Scoring Oracle and Spec Conformance Implementation Plan

## Overview

Test-plan §3 Phase 3 (roadmap F-05) exists to prove two things: that
`outlier_score` means what the PRD says it means, and that the assertions
already guarding it are *capable of failing for the right reason*.

`/10x-research` found the second claim mostly true and the first claim false.
The suite is hand-derived with no snapshots and 25 of 32 behaviour-changing
mutations go red — but the project's single most explicitly protected decision
(the 2026-09-11 średnia→mediana correction) survives in both tests named for
it, because both median fixtures are degenerate. And FR-008's "mediana
wyświetleń kanału **z okna czasowego**" has no implementation: there is no
per-video window filter anywhere, and the denominator that actually ships is
"the first ≤20 long-form survivors of ≤100 candidates, in uploads-playlist
order".

This plan repairs the oracle, makes the denominator testable by extracting it
from the fetch layer, fixes five reachable defects rather than freezing them
under new tests, and corrects the PRD so the specification describes the
product that exists.

## Current State Analysis

**The pure module is well-factored and under-asserted.** `scoring.ts` has
exactly one commit in its history and zero diff since — nothing was silently
tuned. Every rule the PRD names lives there *except* the two that decide the
denominator. 51 `expect(…)` calls across 20 tests: 33 derived, 11 structural,
3 self-referential, 1 tautological, 3 derived-but-non-discriminating.

**The selection layer has no seam and no coverage.** `collectCandidateIds` and
`collectChannelSample` are module-private, inlined behind two awaits.
`youtube.test.ts` is an error-classification suite in which every fixture is
`daysBefore(30)`, one video per channel, `"PT10M"`, and no `nextPageToken` — so
the window edge, `MAX_PAGES`, the 20-cap and the Shorts drop have never
executed under test. `stubHealthyChain` cannot express a multi-page chain.

**Four reachable defects sit in that layer and one downstream of it**:

- `collectChannelSample` iterates the `candidates` **array**, not the `byId`
  map, so an id returned on both pages is pushed twice — double-counted in the
  median and in `sample_size`. Contrast `youtube.ts:483`, which does dedupe
  channel ids via `new Set`.
- The walk `break`s on the first item it can prove is older than the cutoff.
  A non-monotonic uploads playlist therefore truncates the sample early and
  every newer item behind that one item is lost.
- The cutoff guard is `!Number.isNaN(publishedMs) && publishedMs < cutoff`, so
  an item with an absent or unparseable timestamp falls through to `ids.push`
  and an arbitrarily old video enters the sample and moves the median.
- A video with `view_count: 0` on a channel with a positive median scores
  exactly `0`. It is rankable, it renders, and it is unsaveable: both
  `z.number().gt(0)` (`content-opportunity.ts:30`) and
  `check (outlier_score > 0)` (migration line 25) reject it, so Save returns a
  400 for an item the ranking just displayed.
- `analyze.ts` constructs two independent `new Date()` values per request —
  one implicitly inside `fetchCompetitorVideos` (`:158` never passes the seam)
  and one at `:189` for scoring — even though the seam is documented at
  `youtube.ts:476` as existing so the cutoff is testable.

**Two constants contradict their own research**, and both were examined and
settled during planning rather than left open (see Key Decisions in
`plan-brief.md`).

## Desired End State

- Mutating `median` to the arithmetic mean fails a test **named for the median
  rule**, not incidentally via a sort fixture.
- No assertion in `scoring.test.ts` compares a function to itself, writes the
  formula under test into its own expectation, or re-asserts a branch condition
  onto the output.
- Every field of a scored `ScoredOpportunity` is asserted on at least one
  fixture, so none can be nulled or zeroed with the suite green.
- The rules that decide FR-008's denominator — staleness, dedupe, the 20-cap,
  the Shorts drop — are pure functions with direct unit tests, and one
  multi-page test proves `youtube.ts` is wired to them.
- A duplicate playlist id, an old item in the middle of an uploads playlist,
  and an unreadable timestamp each provably fail to move the median.
- A 0-view video does not appear in a ranking it cannot be saved from.
- `prd.md` FR-008 and the Business Logic paragraph describe the bounds that
  exist; the user-visible window clause is gone and logged as a post-MVP
  roadmap item.
- `test-plan.md` §6.5 is written, §6.1's standing caveat is lifted, and the
  mutation ledger plus its by-hand recipe are recorded so "the suite can fail
  for the right reason" stays re-verifiable.

Verification: `npm test` green; `npm run lint` clean; the mutation re-run in
Phase 1 and Phase 3 reproduces the recorded ledger.

### Key Discoveries:

- `scoring.test.ts:48,52` — `median([1,2,3]) === 2` and `median([1,2,3,4]) ===
  2.5` are **also the mean** of those sets. `expect(median([1,2,3,100])).toBe(2.5)`
  (mean 26.5) kills mutations M1, M2 and M4 in a single assertion.
- `scoring.test.ts:269` — `expect(rankOpportunities(r,5)).toEqual(rankOpportunities(r,5))`
  cannot fail short of introducing `Math.random()`. Line 274 (`reversed` vs
  `results`) is also self-referential but earns its place: it detects a
  non-total comparator, which no value assertion would.
- `youtube.ts:386-403` — the only use of `MAX_WINDOW_DAYS`, as a paging stop
  with prefix-take semantics.
- `youtube.ts:461-467` — the 20-cap loop, iterating `candidates` without a Set.
- `scoring.ts:194-199` — the NaN-withholding comment; documented, untested.
- `vitest.config.ts` `include` is one glob over `src/**/*.test.{ts,tsx}`, so a
  new test file beside the module is picked up with no config change.
- `justification-merge.ts` (Phase 1) is the precedent for extracting logic out
  of an untestable caller into a pure sibling module.
- `playlistItemsSchema` (`youtube.ts:259-271`) already models exactly the two
  fields the selector needs: `contentDetails.{videoId, videoPublishedAt}` and
  `snippet.{publishedAt, resourceId.videoId}`.

## What We're NOT Doing

- **No window UI, API parameter, or column.** The PRD clause claiming the
  window is a user-visible input is struck and logged as a post-MVP roadmap
  item; nothing is built for it here.
- **No change to `SHORTS_MAX_SECONDS`.** 300 is pinned as-is and its known
  exposure (a channel whose normal format is 3–5 minutes has its whole
  catalogue classified as Shorts) is recorded, not fixed.
- **No change to `MIN_SAMPLE_SIZE`'s value.** Fixtures are *sized* from the
  constant so the number stays tunable.
- **No mutation-testing dependency.** No Stryker, no new devDependency; the
  ledger and the by-hand recipe are the deliverable.
- **No mocking library.** §6.2's `vi.stubGlobal` pattern stands.
- **No `SkippedChannel` de-duplication.** The structural duplicate of the
  `kind: "skipped"` arm at `types.ts:34-41` is recorded as a known gap; merging
  the types is a refactor with no test in this risk.
- **No route-level tests for `/api/analyze`.** Phase 1 settled that boundary:
  extract the logic, test the service.
- **No mean alongside the median.** `prd.md:108` marks it explicitly post-MVP.
- **No retry, backoff, or quota accounting.**
- **No e2e.** §5 and §7 keep it out.

## Implementation Approach

Four phases, ordered so that nothing that changes behaviour lands before the
suite is capable of noticing.

Phase 1 is pure test work: repair the four defective assertions and close the
survivors inside `scoring.ts`. It must end green with zero production diff, so
that every later phase has a discriminating baseline underneath it.

Phase 2 makes the two small behaviour corrections in the pure module and the
route, test-first.

Phase 3 is the structural one: extract the selection step into a pure sibling
module, fix the three defects inside it, and wire `youtube.ts` to it. The
extraction is what makes the FR-008 denominator testable at all — research's
alternative (multi-page fixtures through three awaits) buys the same signal at
several times the cost and leaves the rules in the layer where nothing else
lives.

Phase 4 reconciles the documents to the product.

## Critical Implementation Details

**Removing the early break changes the paging cost.** Today the walk can stop
after one page when it meets an out-of-window item; with the staleness check
demoted to a per-item filter, paging is bounded only by `MAX_PAGES` and the
absence of `nextPageToken`, so a channel that previously cost one
`playlistItems` call may now cost two. That is +1 unit per channel, ~+5 per
5-competitor run, against a 10,000/day project budget — a deliberate trade,
recorded here so it is not rediscovered as a regression.

**`MIN_SAMPLE_SIZE` fixtures are sized from the constant, but assertions stay
on the outcome.** `sample(videosOfLength(MIN_SAMPLE_SIZE - 1))` asserting
`kind === "skipped"` still discriminates: it catches `<` flipped to `<=`, and
it catches Shorts exclusion moving after the count. What must not reappear is
`scoring.test.ts:121`'s shape — asserting `result.sample_size < MIN_SAMPLE_SIZE`
re-states the branch condition the implementation used to get there and cannot
fail.

**Ordering inside Phase 3.** Extract and wire with behaviour unchanged first,
confirm `npm test` still green, and only then apply the three fixes with their
tests. Doing both in one step makes a broken extraction indistinguishable from
an intended behaviour change.

## Phase 1: Repair the oracle

### Overview

Make `scoring.test.ts` capable of failing for the right reason. Four
assertions repaired, and the mutation survivors that live inside `scoring.ts`
closed. No production file is touched in this phase.

### Changes Required:

#### 1. The four defective assertions

**File**: `src/lib/services/scoring.test.ts`

**Intent**: Remove the assertions that cannot discriminate, and replace the
degenerate median fixtures with ones whose expected value is the median and
*not* the mean — so the średnia→mediana correction is defended by the tests
named for it rather than by an unrelated sort fixture.

**Contract**: Line 52's even-count case becomes `expect(median([1, 2, 3,
100])).toBe(2.5)`; the odd-count case at line 48 gains an equivalent
non-degenerate set. Line 269's self-comparison is deleted (line 274's
input-order check stays — it detects a non-total comparator). Line 191's
`toBeCloseTo(400 / 300)` is replaced by a fixture whose expected score is an
exact decimal written as a literal, never as an expression over the fixture's
own inputs. Line 121's `toBeLessThan(MIN_SAMPLE_SIZE)` is dropped; the
`sample_size` value assertion beside it already carries the signal.

#### 2. Full payload coverage on a scored opportunity

**File**: `src/lib/services/scoring.test.ts`

**Intent**: No assertion currently inspects a scored opportunity beyond
`video_id` and `outlier_score`, so `title`, `channel_title`, `view_count`,
`channel_median` and `sample_size` can each be nulled or zeroed with the suite
green — and these fields cross the wire and become `content_opportunities`
rows. Assert the whole object once.

**Contract**: One `toEqual` over a complete `ScoredOpportunity` on a fixture
whose every field is distinct from every other field's value (so a transposition
is caught), with the expected `outlier_score` and `channel_median` hand-computed
in a comment. Closes mutations M21–M25.

#### 3. The untested branches inside `scoring.ts`

**File**: `src/lib/services/scoring.test.ts`

**Intent**: Close the remaining survivors — each is a branch the PRD's rules
reach but no fixture does.

**Contract**: New cases for (a) an even-count sample through `scoreChannel`,
not just through `median` directly — all five existing `scoreChannel` fixtures
use exactly 5 videos, so `median`'s even branch is unreached from the real path
(M34); (b) a video *below* its channel median, giving a score under 1 — every
existing scored fixture yields 1, 3, 9 or 4/3 (M35); (c) a channel with exactly
one rankable video among a valid sample (M38); (d) an unparseable `published_at`
withheld from the ranking while remaining in the baseline, the behaviour
documented at `scoring.ts:197-199` (M39); (e) the empty-sample channel reporting
`insufficient_sample` with `sample_size: 0` (M40/M36); (f) `rankOpportunities(…,
0)` returning `[]` (M20). `MIN_SAMPLE_SIZE`-dependent fixtures are sized from
the imported constant per the Critical Implementation Details note.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Linting passes: `npm run lint`
- `git diff --stat src/ -- ':!*.test.ts'` is empty for this phase

#### Manual Verification:

- Re-run the mutation ledger by hand against `scoring.ts` and confirm M1, M2,
  M4, M20, M21–M25, M34, M35, M38, M39 now go red, and that M2 goes red via a
  test named for the median rule

**Implementation Note**: After completing this phase and all automated
verification passes, pause here for manual confirmation from the human that the
manual testing was successful before proceeding to the next phase.

---

## Phase 2: Zero-view videos and the single clock

### Overview

Two behaviour corrections, both small, both test-first: a video that cannot be
saved must not be ranked, and a request must have one clock.

### Changes Required:

#### 1. Withhold zero-view videos from the ranking

**File**: `src/lib/services/scoring.ts`

**Intent**: A 0-view video scores exactly 0, ranks, renders, and then 400s on
Save against both the zod floor and the CHECK constraint. Treat it as
unrankable the way a too-young video already is — it stays in the baseline, it
just does not reach the ranking.

**Contract**: The `rankable` loop in `scoreChannel` gains a second withholding
condition beside the `MIN_RANKABLE_AGE_DAYS` check. `sample_size` and
`channel_median` are unaffected — the video still counts toward the baseline.
Document the save-boundary reason in the comment, since the rule originates
outside this module (`content-opportunity.ts:30`, migration line 25).

#### 2. The empty-ranking explanation

**File**: `src/pages/api/analyze.ts`

**Intent**: `analyze.ts:219-222` attributes every empty-but-scored ranking to
recency ("Every video found is newer than N days"). With a second withholding
reason that sentence can now be confidently wrong, which is exactly what the
PRD guardrail forbids.

**Contract**: The `ranked.length === 0` branch distinguishes the two causes, or
states them together. `empty_reason` remains non-null on every path through
`emptyResult` — that invariant does not change.

#### 3. One clock per request

**File**: `src/pages/api/analyze.ts`

**Intent**: The route builds `new Date()` twice — once implicitly inside
`fetchCompetitorVideos` and once at `:189` — so the staleness cutoff and the
recency cutoff are evaluated against different instants. `youtube.ts:476`
documents the `now` seam as existing for exactly this.

**Contract**: `now` is constructed once, above the fetch, and passed to both
`fetchCompetitorVideos` and `scoreChannel`.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Linting passes: `npm run lint`
- A new test proves a 0-view video stays in the baseline (`channel_median` and
  `sample_size` unchanged) while being absent from `rankable`

#### Manual Verification:

- Run an analysis against a real profile and confirm the ranking and the
  empty-state message still read correctly

**Implementation Note**: After completing this phase and all automated
verification passes, pause here for manual confirmation from the human that the
manual testing was successful before proceeding to the next phase.

---

## Phase 3: Extract and test the selection step

### Overview

Move the rules that decide FR-008's denominator out of the untestable fetch
layer into a pure sibling module, then fix the three defects they contain.
Extract and wire first with behaviour unchanged; fix second.

### Changes Required:

#### 1. The new pure module

**File**: `src/lib/services/video-selection.ts`

**Intent**: Hold the two selection decisions as pure, synchronous functions so
the window, the cap, the dedupe and the Shorts drop are unit-testable without
a faked transport. Mirrors `justification-merge.ts`, extracted for the same
reason in Phase 1.

**Contract**: Two exports. The first takes the accumulated playlist items
(narrowed to the two fields `playlistItemsSchema` already models — a video id
and an optional published timestamp) plus `now`, and returns an ordered,
deduplicated list of in-window video ids. The second takes those ids plus the
`Map<string, ScorableVideo>` from `videos.list` and returns the capped
long-form sample. Constants stay in `scoring.ts` and are imported; the module
owns no numbers of its own.

#### 2. Rewire the fetch layer

**File**: `src/lib/services/youtube.ts`

**Intent**: `collectCandidateIds` becomes a pager — `MAX_PAGES`, `nextPageToken`,
accumulate raw items — and delegates every selection decision. `collectChannelSample`
delegates the cap and the Shorts drop.

**Contract**: `fetchCompetitorVideos`'s signature and the `ChannelSample` it
produces are unchanged; this step is behaviour-preserving and `npm test` must
stay green across it before the next step begins. The `MS_PER_DAY` constant and
the cutoff arithmetic move with the logic.

#### 3. The three fixes

**File**: `src/lib/services/video-selection.ts`

**Intent**: Apply the three fixes chosen over pinning: dedupe candidate ids,
stop truncating on a non-monotonic playlist, and stop admitting items whose
timestamp cannot be read.

**Contract**: Candidate selection becomes a filter rather than a prefix-take —
an item older than the cutoff is skipped and the scan continues; an item whose
timestamp is absent or unparseable is skipped, because in-window membership
cannot be established for it; a video id already collected is skipped. First
occurrence wins, so playlist order (newest first) is preserved and the cap
still keeps the newest. `MAX_WINDOW_DAYS` is now a per-item staleness bound,
not a paging stop — update its doc comment at `scoring.ts:39` and the
`collectCandidateIds` header comment, both of which currently state the
opposite.

#### 4. The selection suite

**File**: `src/lib/services/video-selection.test.ts`

**Intent**: Prove each selection rule directly, including the three
just-fixed defects, with expected values derived by hand.

**Contract**: Cases for the staleness boundary (an item exactly at the cutoff,
one either side); an out-of-window item *in the middle* of the list, with items
behind it surviving; an absent and an unparseable timestamp, both excluded; a
video id repeated across the page boundary appearing once; the 20-cap keeping
the newest 20 in playlist order; Shorts and ids missing from the map skipping
without consuming a cap slot; a cap fixture sized from
`TARGET_LONGFORM_PER_CHANNEL` rather than the literal 20.

#### 5. One wiring test through the real chain

**File**: `src/lib/services/youtube.test.ts`

**Intent**: The unit suite proves the rules; one integration test proves
`youtube.ts` actually calls them. Today no fixture in this file ever emits a
`nextPageToken`, so `MAX_PAGES` has never run more than one iteration.

**Contract**: Extend the fixture helpers to express a two-page `playlistItems`
chain with matching `videos.list` batches, then assert that the resulting
`ChannelSample` reflects paging plus dedupe plus the cap. Follow §6.2: a fresh
`Response` per call, `vi.unstubAllGlobals()` in `afterEach`, fake the transport
and never the parsing.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Linting passes: `npm run lint`
- `npm run build` succeeds
- The wiring test observes two `playlistItems` calls for a channel whose first
  page carries a `nextPageToken`

#### Manual Verification:

- Run a real analysis and confirm sample sizes and medians are plausible for
  the configured competitors
- Re-run the mutation ledger against the extracted module and record the result

**Implementation Note**: After completing this phase and all automated
verification passes, pause here for manual confirmation from the human that the
manual testing was successful before proceeding to the next phase.

---

## Phase 4: Reconcile the documents

### Overview

Make the specification describe the product. Everything here is prose; no code
changes.

### Changes Required:

#### 1. FR-008 and the Business Logic paragraph

**File**: `context/foundation/prd.md`

**Intent**: "Mediana wyświetleń kanału z okna czasowego" names one window; the
product has two bounds with different semantics. State both, so a future test
can pin a denominator that exists.

**Contract**: FR-008 and the Business Logic paragraph describe the baseline as
the channel's most recent long-form uploads up to a fixed count, bounded by a
staleness limit — naming `TARGET_LONGFORM_PER_CHANNEL` as the binding one for
any regularly-uploading channel. Add a dated `Poprawka` note in the same style
as the 2026-09-11 średnia→mediana entry, citing this change. The mediana
decision itself is untouched.

#### 2. The user-visible window clause

**File**: `context/foundation/prd.md`

**Intent**: `prd.md:148-149` lists the time window among the user's inputs. No
form field, API parameter, type or column implements it. Strike it rather than
leave the PRD describing a control that does not exist.

**Contract**: Remove the window from the "Wejścia (widziane przez
użytkownika)" sentence; the competitor list remains. Cross-reference the new
roadmap item so the intention is not lost.

#### 3. The post-MVP roadmap item

**File**: `context/foundation/roadmap.md`

**Intent**: Preserve the struck intention as a candidate slice rather than
deleting it.

**Contract**: A new item with its own Change ID for a user-selectable analysis
window, status `ready` or backlog per the file's own conventions, citing the
struck PRD clause as its origin. Also flip F-05's Status per the `/10x-implement`
convention when that phase lands.

#### 4. Cookbook §6.5 and the §6.1 caveat

**File**: `context/foundation/test-plan.md`

**Intent**: §6.5 is the `TBD` this phase exists to fill, and §6.1's standing
caveat ("the existing assertions have not been audited") is exactly what this
phase discharges.

**Contract**: §6.5 gives the derivation pattern — expected values computed from
the PRD formula by hand with the counterfactual in the comment, the median edge
cases that decide correctness (even count, single video, zero median,
non-degenerate fixtures), the named anti-patterns (snapshots, self-comparison,
formula-in-expectation, branch-condition-as-assertion), and the mutation ledger
with its by-hand recipe. §6.1's caveat bullet is replaced by a pointer to §6.5.
§6.6 gains a Phase 3 note recording the two pinned-with-known-exposure
constants (`SHORTS_MAX_SECONDS = 300`, `MIN_SAMPLE_SIZE = 5`), the quota trade
from removing the early break, and the `SkippedChannel` duplication left
standing. §3's Phase 3 row moves to `complete` with the change folder named.

### Success Criteria:

#### Automated Verification:

- Prettier passes on the changed markdown: `npm run format`
- `test-plan.md` contains no remaining `TBD` for §6.5
- `prd.md` no longer contains the struck window clause

#### Manual Verification:

- Read §6.5 as someone about to change the scoring rule and confirm it is
  sufficient on its own
- Confirm the PRD's FR-008 wording matches what Phase 3 actually computes

**Implementation Note**: This is the final phase; after it passes, the change is
ready for `/10x-impl-review` and `/10x-archive`.

---

## Testing Strategy

### Unit Tests:

- `scoring.test.ts` — the repaired oracle: non-degenerate median fixtures, full
  payload assertion, even-count median through `scoreChannel`, sub-median
  scores, single-rankable-video, unparseable timestamp withholding, `limit = 0`,
  zero-view withholding.
- `video-selection.test.ts` — staleness boundary either side and exactly at the
  cutoff, mid-list out-of-window item with survivors behind it, absent and
  unparseable timestamps, cross-page duplicate id, the cap, Shorts and missing
  records skipping without consuming a slot.

### Integration Tests:

- `youtube.test.ts` — one two-page chain proving `fetchCompetitorVideos` pages,
  delegates and produces a deduplicated, capped `ChannelSample`.

### Manual Testing Steps:

1. Run an analysis against the real profile; confirm the ranking renders and
   the scores are plausible for the competitors configured.
2. Confirm a competitor with fewer than `MIN_SAMPLE_SIZE` long-form uploads
   still produces a readable skip message naming the count.
3. Re-run the mutation ledger by hand after Phase 1 and after Phase 3, and
   record survivors in §6.5.

## Performance Considerations

Removing the early break raises the worst case from one `playlistItems` call
per channel to `MAX_PAGES` (2) — roughly +5 quota units on a 5-competitor run
against 10,000/day. The extraction adds one array pass and one `Set`; the
module stays synchronous and well inside the Worker's 10ms CPU budget, which
`scoring.ts`'s header comment already treats as a design constraint.

## Migration Notes

No schema change and no data migration. Withholding zero-view videos can only
shrink a ranking, never change a saved row: nothing already in
`content_opportunities` can have `outlier_score = 0`, because the CHECK
constraint has always forbidden it.

## References

- Research: `context/changes/testing-scoring-oracle/research.md`
- Risk and phase brief: `context/foundation/test-plan.md` §2 Risk #5, §3 Phase 3
- Roadmap element: `context/foundation/roadmap.md` F-05
- Extraction precedent: `src/lib/services/justification-merge.ts` and
  `context/archive/2026-09-14-testing-analyze-boundary-resilience/plan.md`
- Boundary-faking pattern: `context/foundation/test-plan.md` §6.2
- The mediana decision: `context/archive/2026-09-10-analyze-and-rank-opportunities/research.md:264-268`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Repair the oracle

#### Automated

- [x] 1.1 Unit tests pass: `npm test` — f8c3494
- [x] 1.2 Linting passes: `npm run lint` — f8c3494
- [x] 1.3 No production diff in this phase — f8c3494

#### Manual

- [x] 1.4 Mutation ledger re-run confirms M2 goes red via a median-named test — f8c3494

### Phase 2: Zero-view videos and the single clock

#### Automated

- [x] 2.1 Unit tests pass: `npm test` — a311db4
- [x] 2.2 Linting passes: `npm run lint` — a311db4
- [x] 2.3 Zero-view video stays in the baseline and out of `rankable` — a311db4

#### Manual

- [x] 2.4 Real analysis renders correctly, empty-state message reads correctly — a311db4

### Phase 3: Extract and test the selection step

#### Automated

- [x] 3.1 Unit tests pass: `npm test`
- [x] 3.2 Linting passes: `npm run lint`
- [x] 3.3 Build succeeds: `npm run build`
- [x] 3.4 Wiring test observes two `playlistItems` calls across a paged chain

#### Manual

- [ ] 3.5 Real analysis produces plausible sample sizes and medians
- [ ] 3.6 Mutation ledger re-run against the extracted module, result recorded

### Phase 4: Reconcile the documents

#### Automated

- [ ] 4.1 Prettier passes: `npm run format`
- [ ] 4.2 `test-plan.md` §6.5 no longer reads `TBD`
- [ ] 4.3 `prd.md` no longer contains the struck window clause

#### Manual

- [ ] 4.4 §6.5 is sufficient on its own for someone changing the scoring rule
- [ ] 4.5 FR-008's wording matches what Phase 3 computes
