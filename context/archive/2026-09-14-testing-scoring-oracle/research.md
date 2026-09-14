---
date: 2026-09-14T09:20:22+02:00
researcher: Mateusz
git_commit: ad3dc41f5cff8ed6d40432d2a9ddab2fcf36b2de
branch: master
repository: YT-Niche-Adviser
topic: "Scoring oracle and spec conformance (test-plan §3 Phase 3, Risk #5)"
tags: [research, codebase, scoring, oracle, mutation-testing, spec-conformance, youtube]
status: complete
last_updated: 2026-09-14
last_updated_by: Mateusz
---

# Research: Scoring oracle and spec conformance

**Date**: 2026-09-14T09:20:22+02:00
**Researcher**: Mateusz
**Git Commit**: `ad3dc41f5cff8ed6d40432d2a9ddab2fcf36b2de`
**Branch**: `master`
**Repository**: YT-Niche-Adviser

## Research Question

Test-plan §3 Phase 3 — _"Prove the number means what the PRD says it means, and that
the existing suite is able to fail for the right reason"_ (Risk #5). Scope agreed at
the start of this research: include the upstream shaping in `youtube.ts` that decides
which videos reach the median, and produce a **full conformance ledger** tracing every
rule and constant to a PRD line, a recorded decision, or an undocumented invention.

## Summary

Three findings, in descending order of consequence.

**1. The PRD's "median over the time window" is not what the code computes.** FR-008
defines `outlier_score = views / median of the channel's views from the time window`.
There is **no per-video window filter anywhere in the codebase**. `MAX_WINDOW_DAYS`
(180) is used exactly once, as a _paging stop condition_ — the walk accepts uploads
until it meets the first one it can prove is older than the cutoff, then breaks. What
the median is actually computed over is: _the first ≤20 long-form survivors, in
uploads-playlist order, drawn from at most 100 candidate IDs (2 pages × 50)_. For a
channel uploading weekly the 20-video cap binds long before 180 days, so the PRD's
single "okno czasowe" maps onto two different constants with different semantics. This
is a genuine spec divergence, not a naming quibble — and the PRD goes further: it lists
the time window as a **user-visible input** ("Wejścia (widziane przez użytkownika): …
oraz okno czasowe, z którego brane są filmy", `prd.md:148-149`). No window field exists
in the form, the API, `src/types.ts`, or any migration.

**2. The existing suite is genuinely hand-derived — but the project's single most
explicitly protected regression is caught only by accident.** The good news first: there
are no snapshot assertions, the expected values are hand-computed with counterfactuals
written into the comments, and **25 of 32 behaviour-changing mutations go red**. §6.1's
standing caveat can be lifted. The bad news: mutating `median()` to return the
**arithmetic mean** — the exact regression the recorded 2026-09-11 średnia→mediana
correction forbids — is _not_ caught by either test named for the median rule. Both
fixtures are degenerate: `median([1,2,3]) === 2` and `median([1,2,3,4]) === 2.5` are
**also the mean** of those sets. M2 goes red only via the lexicographic-sort test and
two unrelated `scoreChannel` fixtures. A contributor simplifying `median` to a mean and
refreshing the now-"obsolete" sort fixture would ship the regression green.

**3. The scoring constants are stable but largely unauthored.** `scoring.ts` has
**exactly one commit in its entire history** and zero diff since — nothing was silently
tuned, which removes a whole class of suspicion. But of the nine rules audited, only one
(`limit = 5`) traces cleanly to a PRD line. `SHORTS_MAX_SECONDS = 300` sits _above both_
figures its own research offered (60s, 180s), and `MIN_SAMPLE_SIZE = 5` was set at
**half** the research's recommended 10–20 floor without the divergence being noted
anywhere.

## Detailed Findings

### 1. Spec-conformance ledger

| Rule / constant                                                    | Value | Provenance                                                                                                                                                                                                                                                                           | Verdict                                                                                                                                                                                                        |
| ------------------------------------------------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rankOpportunities(…, limit)`                                      | 5     | `prd.md:109` FR-009 "top 5"; restated `prd.md:74,146`                                                                                                                                                                                                                                | **PRD-mandated**                                                                                                                                                                                               |
| Shorts exclusion (the rule)                                        | —     | `prd.md:104` FR-007 "wykluczając Shorts"; `prd.md:181` Non-Goal                                                                                                                                                                                                                      | **PRD-mandated**                                                                                                                                                                                               |
| `SHORTS_MAX_SECONDS` (the value)                                   | 300   | Research left it **unresolved** (`yt-library-research.md:233`, Q4 — the only Q in that file never annotated `RESOLVED`; offered ≤60s historical, ≤180s newer). First literal at `plan.md:171`. `plan-brief.md:29` attributes it to "User's call" with no quote, no date, no D-number | **Undocumented** — and `plan-brief.md:75` flags the exposure itself: a channel whose normal format is 3–5 min videos has its _entire catalogue_ classified as Shorts                                           |
| Deterministic ordering (the property)                              | —     | `prd.md:131-134` NFR "tę samą kolejność rankingu"; `prd.md:78` sorted desc                                                                                                                                                                                                           | **PRD-mandated**                                                                                                                                                                                               |
| Tie-break keys (score desc → `published_at` desc → `video_id` asc) | —     | `plan.md:177`. The `localeCompare` avoidance appears in **no** document                                                                                                                                                                                                              | **Decision-recorded** (plan); any deterministic pair would satisfy the NFR                                                                                                                                     |
| `MIN_SAMPLE_SIZE`                                                  | 5     | Need raised `yt-api-docs.md:82` + `research.md:284`; answered `plan-brief.md:32`                                                                                                                                                                                                     | **Decision-recorded, contradicts its own research** — `yt-library-research.md:208` recommends "~10-20 comparable videos … below that the median itself is volatile". Plan set 5. Divergence never acknowledged |
| `MIN_RANKABLE_AGE_DAYS`                                            | 7     | **Absent from the PRD entirely.** From `yt-library-research.md:207` (launch-week spikes read as 4x, settle to ~1.2x by day ten; range 7–14). Adopted `plan-brief.md:31`; withhold-but-still-count split specified `plan.md:70`                                                       | **Decision-recorded** (plan only, no user decision). Bottom of the research range, no stated reason                                                                                                            |
| `TARGET_LONGFORM_PER_CHANNEL`                                      | 20    | `plan-brief.md:26`; semantics pinned `plan.md:74` ("a cap on the sample, not a paging stop"). Research favoured count-over-date windows at 20–50 (`yt-library-research.md:232`)                                                                                                      | **Decision-recorded** (plan). Bottom of range, no rationale for 20 over 50                                                                                                                                     |
| `MAX_WINDOW_DAYS`                                                  | 180   | PRD never quantifies "okno czasowe"; `roadmap.md:318` logs it as an **open Unknown, Owner: user**, deferred to `/10x-plan`. The S-02 `Rozstrzygnięcia` block closes only D1 and D2 — **the window was never closed**                                                                 | **Undocumented (value).** Delegation documented, number is not. Nothing anywhere derives 180                                                                                                                   |
| `MAX_PAGES`                                                        | 2     | `reviews/plan-review.md:60-76` finding F3 → "FIXED via Fix A". Exists to protect the quota budget                                                                                                                                                                                    | **Decision-recorded (review-driven)** — strongest provenance in the file                                                                                                                                       |
| `zero_median` skip                                                 | —     | `reviews/plan-review.md:48-58` finding F2 (CRITICAL): without it every score is `Infinity`/`NaN`, breaking the ordering NFR. Anchors to `prd.md:131-132` + guardrail `prd.md:63-64`                                                                                                  | **Decision-recorded**, defensive, PRD-anchored                                                                                                                                                                 |
| `insufficient_sample` skip                                         | —     | Behaviour (explain, don't silently drop) from guardrail `prd.md:63-64`; threshold is the `MIN_SAMPLE_SIZE` row above                                                                                                                                                                 | **Decision-recorded** + PRD-anchored behaviour                                                                                                                                                                 |
| `median([]) → 0`                                                   | —     | `plan.md:175` left it explicitly open: "Returns `0` (or throws, documented either way)"                                                                                                                                                                                              | Implementer's pick within a sanctioned range                                                                                                                                                                   |

**Git-drift check: none.** `git log --all --oneline -- 'src/lib/services/scoring*'` returns a
single commit, `bba4bd7` (2026-09-12); `git diff bba4bd7 HEAD -- src/lib/services/scoring.ts`
is empty. Every constant was born at its current value.

**One unimplemented piece of D2**, recorded for completeness rather than as a defect:
`research.md:282` says _"Compute both, score on the median … The scoring helper should
return mean and median from the same sorted array."_ `scoreChannel` returns
`channel_median` only. PRD line 108 marks the mean as explicitly post-MVP.

### 2. The window — what FR-008 says vs. what runs

The whole mechanism, [`youtube.ts:386-403`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/ad3dc41f5cff8ed6d40432d2a9ddab2fcf36b2de/src/lib/services/youtube.ts#L386-L403):

```ts
if (!Number.isNaN(publishedMs) && publishedMs < cutoff) {
  reachedWindowEdge = true;
  break;
}
ids.push(videoId);
```

Prefix-take semantics, with four consequences that are all reachable:

1. **An unparseable or absent `publishedAt` is KEPT** (`youtube.ts:396`). The guard is
   `!Number.isNaN(…) && …`, so a NaN timestamp falls through to `ids.push`. An
   arbitrarily old video with no readable playlist timestamp enters the sample and moves
   the median.
2. **The window is checked against a different field than the one that ships.** The check
   reads `contentDetails.videoPublishedAt ?? snippet.publishedAt` from `playlistItems`
   (`youtube.ts:391`); `ScorableVideo.published_at` is taken from `videos.list`'s
   `snippet.publishedAt` (`youtube.ts:444`). Two endpoints, two fields, nothing
   reconciles them.
3. **A non-monotonic playlist truncates the sample early** — one old item near the front
   ends the walk and every newer item behind it is lost.
4. **Two independent clocks per request.** `fetchCompetitorVideos` takes an injectable
   `now` (`youtube.ts:478-482`, documented at `:476` as existing _"so the
   `MAX_WINDOW_DAYS` cutoff is testable"_) — but the production caller never uses the
   seam (`analyze.ts:158`), so the default `new Date()` fires, and `analyze.ts:189`
   constructs a _second, different_ `new Date()` for scoring.

**The cap** ([`youtube.ts:461-467`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/ad3dc41f5cff8ed6d40432d2a9ddab2fcf36b2de/src/lib/services/youtube.ts#L461-L467))
takes the first 20 long-form survivors in playlist order; Shorts and missing records skip
without consuming a slot. It iterates the `candidates` **array**, not the `byId` map's
keys — so a video ID appearing twice across the two pages is pushed twice, double-counting
it in the median and inflating `sample_size`. Contrast `youtube.ts:483`, which _does_
dedupe channel IDs via `new Set`.

### 3. Where each guarantee actually lives

| Guarantee                                      | Decided in                                                                                                      |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Shorts exclusion before the baseline           | pure (`scoring.ts:163`); **also** a pre-filter at `youtube.ts:465`, so the pure filter is a no-op in production |
| Sample floor, zero-median guard, skip messages | pure (`scoring.ts:166-192`) — the user-facing sentence originates in the pure function                          |
| 7-day withholding                              | pure (`scoring.ts:194-199`)                                                                                     |
| Deterministic ordering + tie-breaks            | pure (`scoring.ts:229-234`)                                                                                     |
| Top-5 limit                                    | caller literal `analyze.ts:35,215` **and** a pure default `scoring.ts:223` — redundantly encoded twice          |
| "Never empty without a reason"                 | caller (`analyze.ts:44-47,179-224`) + UI (`AnalyzePanel.tsx:190-193`)                                           |
| Score precision on the wire                    | nothing rounds — the raw float survives to JSON                                                                 |
| Score precision on screen                      | UI only (`format.ts:5-16`, 2 dp via `Intl.NumberFormat`)                                                        |

The PRD guardrail holds: an Analyze click ends in one of four visible states — ranking,
ranking + warnings, explained-empty notice, or error — never bare emptiness. All four
empty paths funnel through `emptyResult` (`analyze.ts:45-47`) and every one sets
`empty_reason`.

### 4. Oracle audit — per-assertion verdict

51 `expect(…)` calls across 20 tests. **33 derived, 11 structural, 3 self-referential,
1 tautological, 3 derived-but-non-discriminating.** No snapshots anywhere — the §2
anti-pattern is genuinely avoided.

The four that need repair before this file is copied as a template:

- **`scoring.test.ts:269`** — `expect(rankOpportunities(r,5)).toEqual(rankOpportunities(r,5))`.
  A pure self-comparison that cannot fail for any mutation short of introducing
  `Math.random()`. It is dead weight dressed as the repeatability NFR, and leaving it in
  place teaches exactly the habit §6.1 exists to prevent.
- **`scoring.test.ts:191`** — `toBeCloseTo(400 / 300)` writes the formula under test into
  the expectation and tolerates ±0.005. It is the **only** non-integer score assertion in
  the suite, so score precision is effectively unasserted (confirmed: rounding
  `outlier_score` to 2 dp leaves the suite green).
- **`scoring.test.ts:52`** — `median([1,2,3,4]) === 2.5` is degenerate: 2.5 is
  simultaneously the median _and_ the mean. So is line 48 (`[1,2,3] → 2`).
- **`scoring.test.ts:121`** — `sample_size < MIN_SAMPLE_SIZE` re-asserts the branch
  condition the implementation used to arrive there. Tautological but harmless.

Line 274 (`reversed` vs `results`) is self-referential yet earns its place: it detects a
non-total comparator, which no value assertion would.

Best-in-file: lines 147 and 187 (`channel_median === 30` / `=== 300`), both hand-computed
with the counterfactual written into the comment.

### 5. Mutation survival — 41 mutations, run for real

Empirically executed against `scoring.ts` and reverted; baseline 20/20 green.
**25 of 32 behaviour-changing mutations go RED. 12 survive.**

**The headline survivor is not in the list of survivors — it is a near-miss.** M2
(`median` → arithmetic mean) _does_ go red, but only via `scoring.test.ts:61` (the
lexicographic-sort fixture) and two `scoreChannel` fixtures. **Neither test named for the
median rule catches it.** One fixture change closes this permanently:
`expect(median([1, 2, 3, 100])).toBe(2.5)` — mean 26.5 — kills M1, M2 and M4 in a single
assertion.

The 12 survivors cluster in four areas:

| Survivor                | What it proves is untested                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M21–M25                 | **The entire emitted `ScoredOpportunity` payload.** `title`, `channel_title`, `view_count`, `channel_median`, `sample_size` can each be nulled/zeroed on a _scored_ opportunity with the suite green. No assertion inspects a scored opportunity beyond `video_id` and `outlier_score`. These fields cross the wire and become `content_opportunities` rows — the widest uncovered surface in the module |
| M34                     | **Even-count median through the real `scoreChannel` path.** All five `scoreChannel` fixtures use exactly 5 long-form videos; the even branch is never reached except via the degenerate direct test                                                                                                                                                                                                      |
| M35, M37                | **Sub-median scores and absurd inputs.** Every scored fixture yields 1, 3, 9 or 4/3 — all ≥ 1. No fixture has a video below its channel median, or a negative view count                                                                                                                                                                                                                                 |
| M38, M39, M40, M36, M20 | Single-rankable-video channel; unparseable `published_at` (documented at `scoring.ts:197-199`, untested); empty-sample channel reporting the wrong skip reason; `limit = 0`; score precision                                                                                                                                                                                                             |

### 6. Upstream coverage: `youtube.test.ts` is an error-classification suite

It pins error _classification_ well (quota vs auth vs transport vs malformed, and the
fatal/local split). It covers **none** of the selection pipeline: no window cutoff test
(every fixture is hard-coded to `daysBefore(30)`), no pagination at all (no fixture ever
emits `nextPageToken`, so `MAX_PAGES` never runs more than one iteration), no 20-cap test
(every stub returns exactly one video per channel), no Shorts test (fixture duration is
always `"PT10M"`), no dropped-video test, no `channel_title` fallback test.

**There is no seam.** `collectCandidateIds` (the window) and `collectChannelSample` (the
cap) are module-private and inlined in `async` functions behind two awaits. The constants
are static named imports read directly at the use sites — overriding them requires
`vi.mock("./scoring")`, which would also stub `isShort` and `parseIsoDuration`. Testing
the window today means building multi-page `playlistItems` fixtures with `nextPageToken`
chaining plus matching `videos.list` batches; the existing `stubHealthyChain` helper
cannot express it.

### 7. A save-boundary asymmetry worth one test

A video with `view_count: 0` on a channel with a positive median scores **exactly 0**. It
is rankable, it renders, and it is **unsaveable**: both `z.number().gt(0)`
(`content-opportunity.ts:30`) and `check (outlier_score > 0)` (migration line 25) reject
it, so clicking Save returns a 400 for an item the ranking just displayed. The pure module
has no lower bound; the save boundary has two. Nothing rounds between `scoreChannel` and
the wire — `outlier_score` is stored as `double precision`, so no precision is lost at
rest.

Related, from the same trace: `SkippedChannel` (`types.ts:34-41`) is a structural
duplicate of the `kind: "skipped"` arm of `ChannelScoreResult`, copied field-by-field at
`analyze.ts:194-200`. A field added to the skipped arm would silently not reach the wire.

## Code References

- [`src/lib/services/scoring.ts:110-116`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/ad3dc41f5cff8ed6d40432d2a9ddab2fcf36b2de/src/lib/services/scoring.ts#L110-L116) — `median`; the even-count branch at `:115` is the one no `scoreChannel` test reaches
- [`src/lib/services/scoring.ts:162-211`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/ad3dc41f5cff8ed6d40432d2a9ddab2fcf36b2de/src/lib/services/scoring.ts#L162-L211) — `scoreChannel`; order of operations, both skip guards, the NaN-withholding comment at `:197-199`
- [`src/lib/services/scoring.ts:223-236`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/ad3dc41f5cff8ed6d40432d2a9ddab2fcf36b2de/src/lib/services/scoring.ts#L223-L236) — `rankOpportunities`; tie-break chain and `limit = 5` default
- [`src/lib/services/youtube.ts:371-409`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/ad3dc41f5cff8ed6d40432d2a9ddab2fcf36b2de/src/lib/services/youtube.ts#L371-L409) — `collectCandidateIds`; the only use of `MAX_WINDOW_DAYS`, as a paging stop
- [`src/lib/services/youtube.ts:454-470`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/ad3dc41f5cff8ed6d40432d2a9ddab2fcf36b2de/src/lib/services/youtube.ts#L454-L470) — `collectChannelSample`; the 20-cap loop that iterates `candidates` without deduping
- [`src/lib/services/youtube.ts:437`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/ad3dc41f5cff8ed6d40432d2a9ddab2fcf36b2de/src/lib/services/youtube.ts#L437) — the drop-don't-zero guard; defeated by `viewCount: null` and `""`, which coerce to `0` and are kept
- [`src/pages/api/analyze.ts:158`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/ad3dc41f5cff8ed6d40432d2a9ddab2fcf36b2de/src/pages/api/analyze.ts#L158) and [`:189`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/ad3dc41f5cff8ed6d40432d2a9ddab2fcf36b2de/src/pages/api/analyze.ts#L189) — the two independent clocks
- [`src/lib/services/scoring.test.ts:52`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/ad3dc41f5cff8ed6d40432d2a9ddab2fcf36b2de/src/lib/services/scoring.test.ts#L52), [`:191`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/ad3dc41f5cff8ed6d40432d2a9ddab2fcf36b2de/src/lib/services/scoring.test.ts#L191), [`:269`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/ad3dc41f5cff8ed6d40432d2a9ddab2fcf36b2de/src/lib/services/scoring.test.ts#L269) — the three assertions to repair
- [`supabase/migrations/20260913160933_create_content_opportunities.sql:25`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/ad3dc41f5cff8ed6d40432d2a9ddab2fcf36b2de/supabase/migrations/20260913160933_create_content_opportunities.sql#L25) — `check (outlier_score > 0)`, the save-boundary floor the pure module lacks

## Architecture Insights

- **The pure/impure split is well drawn but the guarantees are unevenly placed.** Every
  rule the PRD names lives in the pure module except the two that matter most for FR-007
  and FR-008 — the window and the sample cap — which live in the untestable fetch layer.
  Phase 3 at the unit layer can prove the _formula_ but not the _domain the formula runs
  over_; proving the latter needs either an extraction or the multi-page fixture work
  described in §6.
- **`sample_size` is a lossy signal.** Because the 20-cap and the 100-candidate bound
  apply upstream, `scoreChannel` cannot distinguish "this channel has 3 long-form videos"
  from "the cap left 3". The number the user is shown in a skip message conflates them.
- **Defensive constants have better provenance than product constants.** The two rules
  with the cleanest paper trail (`MAX_PAGES`, the `zero_median` guard) both came from the
  plan review, not from product decisions. The rules that shape the _number the product
  exists to compute_ were adopted unilaterally at plan time, two of them below the range
  their own research recommended.
- **`isShort` runs twice** (`youtube.ts:465`, `scoring.ts:163`). The second is a no-op in
  production and exists to keep `scoreChannel` total for hand-built samples — worth
  knowing before anyone "simplifies" it away and silently moves Shorts exclusion out of
  the pure module's contract.

## Historical Context (from prior changes)

- `context/archive/2026-09-10-analyze-and-rank-opportunities/research.md:264-268` — **D2**,
  the mean→median decision, quoting the user: _"for an analysis lets go with median"_.
  Its tail at `:282` also asked for both statistics to be returned; only the median ships.
- `context/archive/2026-09-10-analyze-and-rank-opportunities/reviews/plan-review.md:48-58`
  — **F2 (CRITICAL)**, the origin of the `zero_median` guard; `:60-76` — **F3**, the origin
  of `MAX_PAGES = 2`.
- `context/archive/2026-09-10-analyze-and-rank-opportunities/yt-library-research.md:207-208`
  — the 7-day recency rule and the _10–20_ minimum-sample recommendation that the plan
  reduced to 5; `:232-233` — the time-window and Shorts-threshold questions, both left
  open, the latter never resolved.
- `context/foundation/roadmap.md:318` — the window length logged as an open Unknown owned
  by the user; the S-02 `Rozstrzygnięcia` block closes D1 and D2 but never the window.
- `context/archive/2026-09-14-testing-analyze-boundary-resilience/` — Phase 1 read
  `scoring.ts` and borrowed its fixture style, but changed no scoring behaviour and
  recorded no decision about any constant.

## Related Research

- `context/foundation/test-plan.md` §2 Risk #5 and §3 Phase 3 — the brief this discharges;
  §6.5 is the `TBD` this research is meant to let someone fill in.
- `context/archive/2026-09-14-testing-analyze-boundary-resilience/research.md` — the
  neighbouring boundary-resilience phase, whose §6.2 transport-faking pattern is what the
  `youtube.ts` window tests would have to extend.

## Open Questions

1. **Is the 180-day paging stop the intended "okno czasowe", or is the 20-video cap?**
   The PRD has one window; the code has two constants. Until this is settled, no assertion
   can legitimately claim to pin FR-008's denominator.
2. **Should the time window be a user input?** `prd.md:148-149` says it is one. It is not
   implemented anywhere. Either the PRD line is stale or there is missing must-have scope
   — and that is a product call, not a testing one.
3. **Is `MIN_SAMPLE_SIZE = 5` defensible against its own research?** `yt-library-research.md:208`
   says a median below ~10 samples is volatile. Pinning 5 with a test makes it permanent.
4. **Is `SHORTS_MAX_SECONDS = 300` correct?** `plan-brief.md:75` predicts it misclassifies
   every 3–5 minute channel entirely. A test written today would pin the aggressive value.
5. **Do duplicate video IDs actually occur across pages in practice?** The double-count is
   real in the code; its likelihood depends on YouTube's paging stability under concurrent
   uploads. Cheap to make impossible regardless (dedupe the candidates).
6. **Does the zero-score/unsaveable asymmetry need fixing or just documenting?** A ranked
   item that 400s on save is a user-visible inconsistency, but a zero-view video is a
   degenerate opportunity anyway.
