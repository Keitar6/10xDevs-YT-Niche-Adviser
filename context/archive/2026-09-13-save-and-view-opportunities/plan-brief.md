# Save and View Opportunities — Plan Brief

> Full plan: `context/changes/save-and-view-opportunities/plan.md`
> Plan review: `context/changes/save-and-view-opportunities/reviews/plan-review.md` (9 findings, all fixed)

## What & Why

S-02 ends the moment a ranked list renders: the user reads five scored opportunities and
then has nowhere to put the one they picked. This slice makes a chosen opportunity durable
and browsable — FR-010 and FR-011, the last must-have pair in milestone M-1. It closes the
product's core loop from "here is a ranked opportunity" to "I kept that one."

## Starting Point

`/api/analyze` already returns everything a saved row needs, in the casing a row would use —
S-02 shaped it that way on purpose (`src/types.ts:18`, `src/lib/services/scoring.ts:10-12`
both name `content_opportunities` explicitly). What is missing is the table, the routes that
write it, and any surface that lists it. The per-owner RLS pattern this slice copies is
already proven twice, on `channel_profiles` and on the avatar storage bucket.

## Desired End State

A signed-in user runs an analysis, clicks Save on a ranked row, and sees it appear in a
"Saved opportunities" panel on the same screen without losing the ranking they are reading.
The saved row keeps the exact score, view count and justification that were on screen when
they saved, labelled with the date. Reloading `/dashboard` server-renders the same rows. A
row can be removed. No other user can read, modify or delete those rows.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Snapshot vs. reference | Full snapshot, frozen at save | S-02 measured the score drifting on zero new views, so a reference would silently change the number the user decided on. |
| Duplicate saves | One row per video, idempotent on `(user_id, video_id)` | The saved list is a list of topics, not a log; it also makes the already-saved badge trivially correct. |
| `status` field | Column with a CHECK and a `'new'` default, no UI | Satisfies FR-010's letter while leaving parked FR-012 a pure UI change with no migration. |
| Browse surface | Panel on `/dashboard` | Save and browse on one screen keeps the loop visible; reuses the 23-line dashboard rather than adding a route. |
| Shared state | One parent island owns both panels | A save updates the badge and the list in the same render; a reload would destroy the ~11s analysis result. |
| Remove | Yes, from the saved list only | A one-click idempotent save with no undo is a trap, and the DELETE policy ships in the migration regardless. |
| Save button | Pending, then confirmed — not optimistic | The UI never shows a row as saved until the server says it is. |
| Staleness | Each row labelled `Saved <date>` | Makes explicit that the numbers are as of the save, which is the only real objection to the snapshot model. |
| Isolation proof | Scripted two-account `curl` protocol | Exercises the real policies against the real database with no new test infrastructure, matching how F-02's and S-05's policies were confirmed. |
| Remove endpoint shape | `DELETE /api/opportunities?id=<uuid>`, same file as POST | Mirrors `avatar.ts` (POST + DELETE in one file) and avoids introducing the repo's first dynamic route on an adapter that has surprised this project before. |
| Saved list bound | Capped at 200 rows with a visible note | Saving only ever adds, and every row is selected, rendered and serialized into the island's props on each dashboard load. |

## Scope

**In scope:** `content_opportunities` table with four granular per-owner RLS policies;
`POST /api/opportunities` (idempotent) and `DELETE /api/opportunities?id=<uuid>`; a Save control
on each ranked row; a saved panel with snapshot dates, remove, and explained empty states;
SSR first paint from the database.

**Out of scope:** FR-012 status transitions (parked, GitHub #18); refreshing or re-scoring
saved rows; a `GET /api/opportunities` route (SSR plus shared state makes it unnecessary);
pagination, search, filtering or sort controls; saving from anywhere but the ranking;
export or any cross-user visibility; restyling the dashboard.

## Architecture / Approach

```
dashboard.astro ──SSR──> loadSavedOpportunities()  ──> content_opportunities (RLS)
       │
       └─> <DashboardPanels>            owns saved[] + pending sets
              ├─> <AnalyzePanel>   ──> POST /api/analyze   (unchanged)
              │      └─> <OpportunityList>  Save control per row ──> POST    /api/opportunities
              └─> <SavedOpportunitiesPanel> Remove per row       ──> DELETE  /api/opportunities?id=
```

One parent island holds the saved set so the ranking's badges and the saved list never
disagree; `dashboard.astro` still server-renders the first paint. Routes follow the house
pattern exactly: own `locals.user` check, zod at the boundary, `jsonError` envelope,
explicit `user_id` filter alongside RLS.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data model + RLS | Migration, regenerated types, client-safe/server-only service pair, schema unit tests | A wrong policy is the PRD's hardest guardrail — mitigated by copying the twice-proven `channel_profiles` shape and asserting four policies exist |
| 2. Save & remove API | One route file with POST + DELETE, idempotent save, scripted two-account isolation protocol | The `23505` re-select path is the one non-obvious branch; Supabase's `ignoreDuplicates` upsert does not work here |
| 3. Dashboard composition | Parent island, Save control, saved panel, SSR wiring | `AnalyzePanel` stops being self-contained; formatters must move to `src/lib/format.ts` before they get copied |

**Prerequisites:** S-02 shipped (it is `in-progress` on the roadmap with Phase 5 landed;
`/api/analyze` returns the DTOs this slice persists). Local Supabase running via Docker.
No new secrets, no new bindings, no new external integrations.
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- **The client supplies the score it saves.** The server cannot re-derive it without
  re-running the analysis, so the payload is trusted after zod bounds-checking. Accepted:
  the data is per-user private, so a forged score misleads only its author — no trust
  boundary is crossed. The bounds exist to keep garbage out of the table and out of
  `Intl.NumberFormat`, not to prevent forgery.
- **Snapshots go stale by design.** A row saved six weeks ago shows six-week-old numbers.
  Mitigated by the `Saved <date>` label rather than by a refresh path.
- **The 200-row cap is a ceiling, not pagination.** A user past it cannot reach older saves
  until pagination ships; the panel says so rather than hiding it.
- **No regression guard on RLS.** The isolation protocol is scripted but not part of CI,
  so a future migration that weakens a policy would not be caught automatically.
- **S-02 has open verification rows** (3.6, 3.8, 5.13 — quota per run and Worker CPU time
  need the Google Cloud console and Workers Logs). None of them block this slice.

## Success Criteria (Summary)

- A user can save an opportunity from the ranking and still see the ranking, then find that
  opportunity again after a reload with the score they originally saw.
- An opportunity saved twice stays one row, and a saved one can be removed.
- A second account's saved panel is empty, and its delete of another user's row id returns
  404 — the isolation guardrail, proven against the real policies.
