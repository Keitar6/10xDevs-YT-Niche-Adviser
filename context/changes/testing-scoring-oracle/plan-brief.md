# Scoring Oracle and Spec Conformance — Plan Brief

> Full plan: `context/changes/testing-scoring-oracle/plan.md`
> Research: `context/changes/testing-scoring-oracle/research.md`

## What & Why

Test-plan §3 Phase 3 (roadmap F-05) must prove that `outlier_score` means what
the PRD says, and that the existing assertions can fail for the right reason.
Research found the suite genuinely hand-derived — 25 of 32 mutations go red,
no snapshots anywhere — but the project's single most explicitly protected
decision, the 2026-09-11 średnia→mediana correction, survives in **both tests
named for it**, because both median fixtures are degenerate (`median([1,2,3])`
and `median([1,2,3,4])` are also the *mean*). And FR-008's "mediana z okna
czasowego" has no implementation at all: there is no per-video window filter,
and the denominator that ships is "the first ≤20 long-form survivors of ≤100
candidates, in playlist order".

## Starting Point

`scoring.ts` has one commit in its whole history and zero diff since — nothing
was silently tuned. Every rule the PRD names lives in that pure module *except*
the two that decide the denominator, which sit in module-private async code in
`youtube.ts` with no seam. `youtube.test.ts` is an error-classification suite
where every fixture is one video, `"PT10M"`, `daysBefore(30)` and no
`nextPageToken`, so the window edge, `MAX_PAGES`, the 20-cap and the Shorts
drop have never executed under test.

## Desired End State

Mutating `median` to the mean fails a test named for the median rule. No
assertion compares a function to itself or writes the formula under test into
its own expectation. The selection rules are pure functions with direct tests,
and a duplicate playlist id, an old item mid-playlist, and an unreadable
timestamp each provably fail to move the median. A 0-view video no longer
appears in a ranking it cannot be saved from. The PRD describes the bounds that
exist, and `test-plan.md` §6.5 tells the next contributor how to keep it that
way.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| FR-008's "okno czasowe" | The 20-video cap is the window; correct the PRD | The count bound is what binds for any regular uploader, and the S-02 research favoured count-over-date windows at 20–50 | Plan |
| Window as a user input | Struck from the PRD, logged as a post-MVP roadmap item | No form field, API param, type or column implements it; the PRD should not describe a control that does not exist | Plan |
| `MIN_SAMPLE_SIZE = 5` | Pin the rule, not the number | Fixtures sized from the constant keep the value tunable against its own 10–20 research recommendation | Plan |
| `SHORTS_MAX_SECONDS = 300` | Pin as-is, record the exposure | Keeps the phase a testing phase; the 3–5 minute misclassification risk is documented rather than fixed | Plan |
| Upstream reach | Extract the selection step into a pure module | Cheapest layer for the rules that decide the number, and puts them where every other guarantee already lives | Plan |
| Selection defects | Fix all three (dedupe, mid-list truncation, unreadable timestamp) | A test written today would pin them permanently — the fix-don't-pin principle Phase 1 established | Plan |
| `MAX_WINDOW_DAYS` after the fixes | A per-item staleness filter | The only reading under which "no early break" and "skip unreadable timestamps" are both coherent; `MAX_PAGES` alone bounds paging | Plan |
| Zero-score videos | Withheld from the ranking | Removes a user-visible inconsistency at source: the item rendered, then 400'd on Save | Plan |
| Mutation evidence | Ledger + by-hand recipe in §6.5 | No new dependency; cost×signal consistent, and §3 Phase 4 owns gate decisions | Plan |
| Score precision | Assert exact division, keep the raw float | Pins the contract that presentation, not computation, decides precision — where `format.ts` already lives | Plan |

## Scope

**In scope:** repaired assertions in `scoring.test.ts` plus the 12 mutation
survivors; zero-view withholding and a single request clock; a new pure
`video-selection.ts` with its suite and the three defect fixes; one two-page
wiring test in `youtube.test.ts`; PRD FR-008 + Business Logic corrections and
the struck window clause; a new roadmap item; `test-plan.md` §6.5, the §6.1
caveat and a §6.6 phase note.

**Out of scope:** any window UI, API parameter or column; changing
`SHORTS_MAX_SECONDS` or `MIN_SAMPLE_SIZE`'s value; a mutation-testing
dependency; a mocking library; `SkippedChannel` de-duplication; route-level
tests for `/api/analyze`; returning the mean alongside the median; retry or
backoff; e2e.

## Architecture / Approach

The rules that decide FR-008's denominator move out of the fetch layer into a
pure sibling module — the same move `justification-merge.ts` made in Phase 1,
for the same reason. `youtube.ts` keeps the paging and the HTTP; selection
becomes two synchronous functions over data: playlist items → ordered,
deduplicated, in-window ids; ids + the `videos.list` map → capped long-form
sample. Everything that decides a number is then testable without a faked
transport, and one integration test proves the wiring.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Repair the oracle | Non-degenerate fixtures, full payload coverage, survivors closed — zero production diff | A repaired assertion that is merely differently non-discriminating |
| 2. Zero-view + single clock | 0-view videos withheld; one `now` per request; the empty-reason branch corrected | The empty-state sentence becoming confidently wrong for the new cause |
| 3. Extract + test selection | `video-selection.ts`, its suite, the three fixes, the two-page wiring test | Conflating the behaviour-preserving extraction with the behaviour-changing fixes |
| 4. Reconcile the documents | Corrected FR-008, struck window clause, new roadmap item, §6.5 written, §6.1 caveat lifted | PRD wording drifting from what Phase 3 actually computes |

**Prerequisites:** none — `research.md` is complete and Phases 1 and 2 of the
test rollout have landed. Local `npm test` only; no Docker, no database.
**Estimated effort:** ~2–3 sessions across four phases; Phase 3 is the bulk.

## Open Risks & Assumptions

- Removing the early break raises worst-case quota from ~15 to ~20 units per
  5-competitor run (10,000/day budget). Assumed free; recorded so it is not
  rediscovered as a regression.
- `SHORTS_MAX_SECONDS = 300` is pinned above YouTube's own 3-minute Shorts
  ceiling, so a channel whose normal format is 3–5 minutes still has its whole
  catalogue excluded. Known and accepted for now.
- `MIN_SAMPLE_SIZE = 5` remains half its own research's recommended floor; a
  5-video median stays statistically thin.
- `sample_size` conflates "this channel has N long-form videos" with "the cap
  left N", and is shown to the user in skip messages. Documented, not fixed.
- Editing the PRD from a testing phase assumes the FR-008 correction is
  yours to make; it is written as a dated `Poprawka` for exactly that reason.

## Success Criteria (Summary)

- A contributor who simplifies `median` to a mean cannot ship it green.
- The number the ranking divides by is produced by code with direct tests, and
  no duplicate, stale or unreadable record can move it unnoticed.
- Nothing appears in a ranking that the user cannot then save.
