---
change_id: testing-scoring-oracle
title: Testing scoring oracle
status: planned
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
