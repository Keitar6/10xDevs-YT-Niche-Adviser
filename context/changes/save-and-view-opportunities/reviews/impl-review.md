<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Save and View Opportunities Implementation Plan

- **Plan**: context/changes/save-and-view-opportunities/plan.md
- **Scope**: Full plan (Phase 1–3 of 3)
- **Date**: 2026-09-13
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Client-side saved list can exceed the 200-row cap in a long-lived tab

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/dashboard/DashboardPanels.tsx:60-66
- **Detail**: `onSave`'s merge unconditionally does `return [row, ...prev]` when the saved row is new, with no check against `SAVED_LIST_LIMIT` (200). The server enforces the cap only on the SSR read (`content-opportunity-server.ts:36`). `SavedOpportunitiesPanel.tsx` relies on `opportunities.length === SAVED_LIST_LIMIT` to show the "showing your 200 most recent" footer — that invariant only holds right after SSR load, not after enough client-side saves accumulate past it in a session that never reloads. Low real-world likelihood (one analysis run surfaces at most 5 opportunities), but the invariant is not actually enforced client-side.
- **Fix**: Cap the prepend branch: `return [row, ...prev].slice(0, SAVED_LIST_LIMIT);`
- **Decision**: FIXED

### F2 — 23505 handler assumes the only unique constraint is (user_id, video_id)

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/opportunities.ts:50-61
- **Detail**: On a Postgres `23505` the code re-selects by `(user_id, video_id)`, assuming that's the constraint that fired. Correct today — it's the table's only unique constraint — but would silently misattribute if a future migration adds another one.
- **Fix**: Add a one-line comment noting the assumption, so a future added constraint is caught in review rather than silently.
- **Decision**: FIXED

### F3 — view_count has no upper bound in the zod schema

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/content-opportunity.ts:29
- **Detail**: `view_count: z.number().int().nonnegative()` has no upper bound. The Postgres column is `bigint`, but JS `number` loses integer precision above `2^53`. Not exploitable in practice — real YouTube view counts never approach that — so this is informational only.
- **Fix**: Optional — add `.max(Number.MAX_SAFE_INTEGER)` for documentation value; not required.
- **Decision**: SKIPPED
