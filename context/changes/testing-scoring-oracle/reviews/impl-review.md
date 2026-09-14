<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Scoring Oracle and Spec Conformance

- **Plan**: `context/changes/testing-scoring-oracle/plan.md`
- **Scope**: Full plan — Phases 1–4 of 4
- **Date**: 2026-09-14
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 6 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | WARNING |

## Success criteria re-run

| Criterion                        | Result                                                       |
| -------------------------------- | ------------------------------------------------------------ |
| 1.1 / 2.1 / 3.1 `npm test`       | PASS — 162 passed                                            |
| 1.2 / 2.2 / 3.2 `npm run lint`   | PASS — clean                                                 |
| 1.3 Phase 1 zero production diff | PASS — `f8c3494` touches only `scoring.test.ts` under `src/` |
| 2.3 Zero-view baseline test      | PASS                                                         |
| 3.3 `npm run build`              | PASS                                                         |
| 3.4 Two `playlistItems` calls    | PASS                                                         |
| 4.1 Prettier on changed docs     | PASS                                                         |
| 4.2 §6.5 no `TBD`                | PASS — only the §6 intro's generic sentence remains          |
| 4.3 Struck window clause         | PASS — 0 occurrences                                         |

## Checked and dismissed

**Roadmap F-05 still reads `in-progress`.** Flagged during review as a possible missed
step (Phase 4 item 3, "flip F-05's Status per the `/10x-implement` convention"). Verified
against `.claude/skills/10x-archive/SKILL.md:15`: `/10x-archive` owns the flip to `done`.
`in-progress` is correct for an unarchived change. Not a finding.

## Findings

### F1 — Empty-ranking message names two withholding reasons; there are three

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/analyze.ts:223-233
- **Detail**: `scoreChannel` withholds a video from `rankable` for **three** reasons:
  too young (`scoring.ts:205`), an unparseable `published_at` (same line — `Date.parse`
  yields NaN and fails the comparison), and `view_count <= 0` (`scoring.ts:211`).
  `ChannelScoreResult` records none of them. The `empty_reason` names only two, and the
  comment above it asserts "`scoreChannel` withholds for two reasons". A channel whose
  timestamps are all unreadable therefore receives a sentence in which **both stated
  reasons are false** — the confidently-wrong emptiness the route header (`:6-8`) and
  `prd.md`'s guardrail forbid. This is the exact failure mode Phase 2 item 2 existed to
  prevent; it was fixed for the reason the phase added and missed for the one already
  there.
- **Fix A ⭐ Recommended**: Add the third clause to the sentence and correct the comment.
  - Strength: One-line change, no type or signature churn, closes the false-statement case immediately.
  - Tradeoff: The sentence gets longer and still cannot say which reason actually applied.
  - Confidence: HIGH — mirrors what Phase 2 already did for the zero-view cause.
  - Blind spot: Does not help the non-empty case (see F9).
- **Fix B**: Return a withheld-count-by-reason on the `scored` variant and let the route name what applied.
  - Strength: Removes the guesswork entirely; the route states a fact rather than a disjunction.
  - Tradeoff: Widens `ChannelScoreResult`, touches the scoring contract and its tests — beyond what this change scoped.
  - Confidence: MEDIUM — clean design, but it reopens a type the plan deliberately left alone.
  - Blind spot: `SkippedChannel`'s field-by-field copy at `analyze.ts:200-206` would need the same treatment.
- **Decision**: FIXED via Fix B — `scoreChannel` returns `withheld: {tooYoung, unreadableDate, unusableViews}`; `describeWithheld` in `analyze.ts` names only non-zero causes. 3 new tests, 3 mutations verified red.

### F2 — Corrected FR-008 omits the third bound, and the requirement sentence itself is unedited

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence / Success Criteria
- **Location**: context/foundation/prd.md:114, :117
- **Detail**: Two gaps in the Phase 4 correction.
  (a) The `Poprawka` names exactly two bounds — `TARGET_LONGFORM_PER_CHANNEL` (20) and
  `MAX_WINDOW_DAYS` (180d). But `youtube.ts:368` caps the walk at `MAX_PAGES = 2` pages
  of 50, so only the first ≤100 playlist entries are ever examined. `grep -c MAX_PAGES
context/foundation/prd.md` returns **0**. That third bound binds in a real case: a
  Shorts-heavy channel with >100 uploads in the window can yield fewer than 20 long-form
  videos, or fall under `MIN_SAMPLE_SIZE` and be skipped, for a reason the PRD does not
  describe. The plan's own Overview named the shipped denominator as "the first ≤20
  long-form survivors of **≤100 candidates**", and `test-plan.md` repeats ≤100 — the
  number was known and dropped on the way into the PRD. The plan's contract asked for two
  bounds, so the implementation is faithful; the contract under-specified.
  (b) FR-008's headline sentence at `:114` still reads "mediana wyświetleń kanału **z
  okna czasowego**" — the exact phrase the plan calls unimplemented — corrected only by
  the `Poprawka` beneath it. The 2026-09-11 średnia→mediana precedent it claims to follow
  edited the headline sentence itself. FR-007 (`:112`) and its Socrates note (`:113`) also
  still say "z okna czasowego"; those were outside the contract, but the PRD now carries
  three uncorrected uses of the phrase this change exists to redefine.
  Manual row 4.5 was ticked on a verification that compared the PRD only against
  `video-selection.ts` and missed the bound living in `youtube.ts`.
- **Fix A ⭐ Recommended**: Extend the `Poprawka` to name the ≤100-candidate ceiling as a third bound, and edit FR-008's headline sentence to point at the baseline rather than "okno czasowe".
  - Strength: Makes the PRD describe all three bounds that exist, which is the Desired End State's actual wording; follows the 2026-09-11 precedent properly.
  - Tradeoff: Touches a requirement sentence, not just an annotation — a slightly bolder edit from a testing phase.
  - Confidence: HIGH — the numbers are verified in code and the precedent is in the same file.
  - Blind spot: FR-007's wording would still be stale unless included.
- **Fix B**: Leave the PRD; record the ≤100 bound in `test-plan.md` §6.6 only.
  - Strength: Keeps the PRD edit minimal and inside the contract as written.
  - Tradeoff: The spec still under-describes the denominator, which is the divergence this whole change exists to close.
  - Confidence: MEDIUM — defensible scope-wise, weak on intent.
  - Blind spot: A future FR-008 test could pin a denominator the PRD still does not describe.
- **Decision**: FIXED via Fix A — `Poprawka` gained the ≤100 `MAX_PAGES` bound (and now says _trzy_ ograniczenia); FR-008 and FR-007 headline sentences re-pointed at „próba bazowa". The remaining „z okna czasowego" at :116 is a historical Socrates record, left intact.

### F3 — Quota documentation is now wrong in two places

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/youtube.ts:234-241, src/lib/services/video-selection.ts:53-56
- **Detail**: Removing the early `break` raises the surviving-candidate count, not just the
  page count. `fetchVideoDetails` batches 50 ids per `videos.list` call, so a channel can
  now cost 2 `playlistItems` + 2 `videos` calls. `youtube.ts:234-241` still states "Three
  calls per competitor … ~15 units for a 5-competitor run"; `video-selection.ts:53-56`
  states the trade as "at most one extra `playlistItems` call per channel — ~+5 units".
  Both understate it: worst case is ~4 calls per competitor and ~21 units. This repo treats
  these comments as contracts, and the plan recorded the quota trade specifically so it
  would not be rediscovered as a regression.
- **Fix**: Correct both comments to the real worst case (2 `playlistItems` + 2 `videos` per channel, ~21 units per 5-competitor run).
- **Decision**: FIXED — both comments corrected to ~4 calls per competitor / ~21 units.

### F4 — `video-selection.ts` header claims it owns no constants, then declares one

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence / Pattern Consistency
- **Location**: src/lib/services/video-selection.ts:13-14, :18
- **Detail**: Phase 3 item 1's contract: "Constants stay in `scoring.ts` and are imported;
  the module owns no numbers of its own." The header comment repeats that claim verbatim,
  and `const MS_PER_DAY = 86_400_000;` sits four lines below it. Item 2 said `MS_PER_DAY`
  "moves with the logic", which was satisfied only in that `youtube.ts`'s copy was deleted —
  `scoring.ts:51` keeps its own (still needed at `:200`), so the value is now duplicated
  across `scoring.ts`, `video-selection.ts` and the pre-existing `justify.ts:63`. Net copy
  count is unchanged at 3, and the two contract sentences are in tension, so the code is
  defensible; the comment is simply false as written.
- **Fix**: Reword the header to say the module owns no _tuning_ constants — the product numbers stay in `scoring.ts` — leaving `MS_PER_DAY` as the unit conversion it is.
- **Decision**: FIXED — header now says the module owns no _tuning_ constants; `MS_PER_DAY` named as the unit conversion it is.

### F5 — Phase 3's mandated two-step ordering is not visible in git

- **Severity**: 💭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: commit 9a5d8ca
- **Detail**: "Critical Implementation Details / Ordering inside Phase 3" requires
  extract-and-wire behaviour-preserving, confirm green, _then_ fix. That is what happened
  in the working tree, but `9a5d8ca` is a single commit containing the extraction, all
  three fixes, both new test files and the wiring tests. The ordering is attested only in
  prose (`change.md`, `test-plan.md` §6.6). The stated purpose of the ordering — "makes a
  broken extraction indistinguishable from an intended behaviour change" — is exactly the
  property a reviewer cannot now verify from history. Two commits would have preserved it.
- **Fix**: None retroactively; note it for the next extraction-shaped phase.
- **Decision**: NOTED — recorded in `change.md` as a commit-granularity lesson for the next extraction-shaped phase. Nothing fixable retroactively.

### F6 — Manual row 3.5 ticked without observable evidence

- **Severity**: 💭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/testing-scoring-oracle/plan.md — Progress row 3.5
- **Detail**: "Real analysis produces plausible sample sizes and medians" is the one
  Progress row with no artifact anywhere in the diff, and it was ticked on "i'm pretty
  much done, you can tick them off" rather than on a reported observation. It is also the
  row most likely to surface a real regression, since Phase 3 changed which videos reach
  the median. 2.4 has the same shape but a firmer confirmation ("okay, complete").
- **Fix**: Either run the analysis and record one line of what was observed in `change.md`, or downgrade the row to explicitly deferred.
- **Decision**: PENDING — user to supply what the real analysis showed; one line to be written into `change.md`.

### F7 — `PlaylistCandidate` uses snake_case for a type that never crosses the wire

- **Severity**: 💭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/video-selection.ts:29-32
- **Detail**: `scoring.ts:10-12` states the rule: snake_case is for DTOs that cross the
  wire, "internal helpers follow the repo's camelCase." `PlaylistCandidate` is built at
  `youtube.ts:381-384` and consumed one function later — it never leaves the process. The
  camelCase siblings are `ChannelTarget` (`youtube.ts:328`), `ResolvedChannel` (`:123`) and
  `ChannelRef` (`youtube-ids.ts:27`). A rule the repo states rather than merely practises.
- **Fix**: Rename to `videoId` / `publishedAt`, updating the two construction sites and the test builder.
- **Decision**: FIXED (both) — `PlaylistCandidate` → `videoId`/`publishedAt`; `WithheldCounts` → `tooYoung`/`unreadableDate`/`unusableViews`.

### F8 — New test fixtures fork the file's module-scope builders

- **Severity**: 💭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/youtube.test.ts:364-378
- **Detail**: `entry()` and `record()` are near-duplicates of the module-scope
  `playlistItemsPayload` (`:44`) and `videosPayload` (`:52`), forked into the `describe`
  because the originals lacked the needed parameters. The file's convention is
  module-scope, parameter-driven builders. `record()` also hardcodes one test's data into
  a generic-looking builder: `duration: videoId === "short-1" ? "PT30S" : "PT10M"`.
- **Fix**: Parameterise the existing pair — `playlistItemsPayload(ids, days = 30)`, `videosPayload(ids, channelId, duration = "PT10M")` — and delete the fork.
- **Decision**: FIXED — `playlistItemsPayload(ids, daysAgo)` and `videosPayload(ids, channelId, durationFor)` parameterised; `playlistEntry` added; the forked `entry`/`record` and the hardcoded `"short-1"` are gone.

### F9 — Withheld videos are invisible whenever the ranking is non-empty

- **Severity**: 💭 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/analyze.ts:212-233, src/components/analyze/AnalyzePanel.tsx:170-176
- **Detail**: The withholding explanation fires only when the _entire_ ranking is empty.
  When `ranked.length > 0`, a channel that scored but contributed zero rankable rows is
  counted in `summary.scored` and never mentioned, and `sample_size` reaches the UI only
  for `skipped` channels. A user reading "median across 20 videos" cannot learn that some
  of those 20 were themselves ineligible. Narrower than the guardrail's literal wording,
  but the same spirit — and Phase 2 widened the withholding rule without widening the
  reporting.
- **Fix**: Out of scope here; worth a roadmap note alongside S-07.
- **Decision**: NOTED — recorded on roadmap S-07 as an adjacent gap; the per-channel counts now exist, so surfacing them is cheap.

### F10 — The zero-view guard is NaN-safe by luck of the schema, not by construction

- **Severity**: 💭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/scoring.ts:211, src/lib/services/youtube.ts:291
- **Detail**: Verified against the installed zod 4.4.3: `z.coerce.number()` rejects
  `"abc"` and `"Infinity"` at parse time, so NaN and ±Infinity cannot reach `scoreChannel`
  today, and `NaN <= 0` being `false` is therefore harmless. Negative _is_ representable
  (`"-5"` passes; the schema has no `.nonnegative()`), and `<= 0` correctly excludes it. But
  if `viewCount` ever gains `.catch(0)` or `.nullish()`, or a second producer builds a
  `ScorableVideo` by hand, a NaN would flow into `median` → the `(a,b) => a-b` comparator
  returns NaN → implementation-defined sort → `channelMedian` possibly NaN → `NaN <= 0` is
  false, so the zero-median guard passes too → every `outlier_score` is NaN and
  `rankOpportunities`' comparator becomes non-total, breaking the determinism NFR.
  Related and pre-existing: `viewCount: null` and `""` both coerce to `0` and pass the
  `=== undefined` check at `youtube.ts:437`, so they enter the sample as genuine zeros
  despite the docstring's claim that hidden counts are dropped.
- **Fix**: `if (!Number.isFinite(video.view_count) || video.view_count <= 0) continue;` plus `.int().nonnegative()` on the schema.
- **Decision**: FIXED, and the agent's proposed guard was insufficient — `!Number.isFinite(view_count)` in the rankable loop does not stop a NaN baseline making _every_ score NaN. Added `!Number.isFinite(channelMedian)` to the zero-median guard as well. Test written to a deterministic all-NaN sample after the 5-element version passed only by luck of V8's sort placement. Schema `.int().nonnegative()` deliberately NOT applied — see note below.

## Triage outcome

- **Fixed**: F1 (Fix B), F2 (Fix A), F3, F4, F7, F8, F10 — 7
- **Noted**: F5 (`change.md`), F9 (roadmap S-07) — 2
- **Pending**: F6 — 1

### Deliberate departure from a recommendation

F10's review recommendation included tightening `videoListSchema` to
`z.coerce.number().int().nonnegative()`. Not applied. `videoListSchema.safeParse`
runs over a whole 50-id batch, so one out-of-range `viewCount` would fail the
entire payload and discard the channel as `unresolved` — converting a per-record
oddity into a per-channel outage. That contradicts the drop-what-cannot-be-read
stance stated at `youtube.ts:416-420` and the graceful-degradation guarantee
Phase 1 of the test rollout established. The `scoring.ts` guards cover the same
risk without that cost. The underlying all-or-nothing batch parse is a
pre-existing issue worth its own change.

### Verification after triage

- `npm test` — 166 passed
- `npm run lint` — clean
- `npm run build` — succeeds
- New mutations checked red: `unreadableDate` miscounted as `tooYoung`;
  `unusableViews` not counted; NaN/age branch order swapped; `!Number.isFinite`
  dropped from the median guard.
- Pre-existing `tsc --noEmit` errors in `src/pages/api/routes.test.ts` (8 on
  clean HEAD) are unchanged and unrelated; the project's gates are lint + build.
