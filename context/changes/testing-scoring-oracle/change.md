---
change_id: testing-scoring-oracle
title: Testing scoring oracle
status: implementing
created: 2026-09-14
updated: 2026-09-14
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

- 2026-09-14 — `/10x-research` complete → `research.md`. Headline: the PRD's
  "median over the time window" is not what runs (`MAX_WINDOW_DAYS` is a paging
  stop, not a filter; the real denominator is the newest ≤20 long-form videos).
  Existing suite is hand-derived and survives 25/32 mutations, but the recorded
  mean→median regression is caught only by accident — both median fixtures are
  degenerate (mean == median). Three assertions flagged for repair before §6.5
  can be written.
- 2026-09-14 — `/10x-plan` complete → `plan.md` + `plan-brief.md`. Ten decisions
  taken; the two that reach outside the test suite: FR-008's "okno czasowe" is
  declared to be the 20-video cap (PRD corrected, not the code), and the
  user-visible-window clause at `prd.md:148-149` is struck and re-logged as a
  post-MVP roadmap item. Five defects fixed rather than pinned; `SHORTS_MAX_SECONDS`
  and `MIN_SAMPLE_SIZE` values pinned with their exposure recorded.
- 2026-09-14 — Phase 1 landed (`f8c3494`). Mutation ledger re-run by script
  (apply one mutation to `scoring.ts`, run `scoring.test.ts`, revert; harness
  was throwaway, the recipe is what Phase 4 §6.5 records). **13/13 RED** against
  the repaired suite: M1 (median even branch → lower middle), M2 (median →
  arithmetic mean), M4 (lexicographic sort), M20a (`outlier_score` rounded to
  2 dp), M20b (`limit` falsy-defaults to 5), M21–M25 (emitted `title`,
  `channel_title`, `view_count`, `channel_median`, `sample_size` nulled/zeroed),
  M35 (`outlier_score` floored at 1), M36 (empty sample reported as
  `zero_median`), M39 (NaN `published_at` admitted to the ranking). The headline
  result: with M2 applied, `describe("median")` alone goes red on **both** tests
  named for the rule — the near-miss research recorded is closed.
- 2026-09-14 — Phase 3 extraction ledger. Each fix reverted in turn against the
  new suite: **D1** early break restored → red (mid-list survivor test);
  **D2** unreadable/absent timestamp admitted → red (both timestamp tests);
  **D3** dedupe removed → red (cross-page duplicate, first-occurrence order);
  **D4** cap `>=` → `>` → red. A deliberate no-op control stayed green, so the
  harness is discriminating rather than failing everything. Wiring: **pager
  stops after page one** → red, **`selectChannelSample` bypassed** → red.
  Ordering held — extraction landed behaviour-preserving and green before any
  fix was applied.
