<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Save and View Opportunities

- **Plan**: `context/changes/save-and-view-opportunities/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-13
- **Verdict**: REVISE → **SOUND** after fixes
- **Findings**: 0 critical, 7 warnings, 2 observations — all 9 fixed in the plan

## Verdicts

| Dimension             | Verdict (at review) | After fixes |
| --------------------- | ------------------- | ----------- |
| End-State Alignment   | WARNING             | PASS        |
| Lean Execution        | PASS                | PASS        |
| Architectural Fitness | WARNING             | PASS        |
| Blind Spots           | WARNING             | PASS        |
| Plan Completeness     | WARNING             | PASS        |

## Grounding

14/14 paths ✓, 11/11 symbols ✓, brief↔plan ✓, Progress 7/1 · 12/1 · 5/8 rows ✓ (phase names match, no stray checkboxes outside `## Progress`).

Codebase verification confirmed two claims the plan depends on: `PostgrestError.code` is declared non-optional `string` in `@supabase/postgrest-js` 2.112.4, so `error.code === "23505"` type-checks without a cast; and adding an export to `src/types.ts` is purely additive across its five importers.

## Findings

### F1 — DELETE verification criteria cannot pass as written

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 Success Criteria (plan.md:328, 332, 333)
- **Detail**: The plan carried S-02's CSRF lesson forward for POST only. Astro's origin check is method-agnostic — `SAFE_METHODS` is `["GET","HEAD","OPTIONS"]` — so DELETE goes through it. A bare `curl -X DELETE` returns 403 plain text, not the 401 JSON envelope the criterion asserted. `security` is unset in `astro.config.mjs`, so `checkOrigin` defaults on.
- **Fix**: Every DELETE verification command sends `-H "Origin: http://localhost:4321"`, and the criterion names the 403-vs-401 distinction so a 403 reads as a missing header rather than a broken route. Also added as a "Critical Implementation Details" subsection.
- **Decision**: FIXED

### F2 — `[id].ts` would be the repo's first dynamic route; the cited precedent didn't cover it

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Phase 2 §2 (plan.md:301-305)
- **Detail**: The plan justified `api/opportunities/[id].ts` by citing `api/avatar.ts` + `api/avatar/generate.ts` — a static-vs-static pair, where `generate` is a literal segment. No dynamic route segment exists anywhere under `src/pages/` today (13 files, all static), so `[id]` would be an unexercised capability of the Cloudflare adapter. No collision mechanism was found (`trailingSlash` and `build.format` both unset), so it would likely work — it is simply unproven here. A stronger precedent existed and the plan missed it: `src/pages/api/avatar.ts:24` exports POST and `:67` exports DELETE from one file.
- **Fix A ⭐ Recommended**: One `src/pages/api/opportunities.ts` exporting POST and DELETE, with DELETE taking `?id=<uuid>`.
  - Strength: Mirrors `avatar.ts` exactly; no new routing capability, no DELETE body, one fewer file to verify.
  - Tradeoff: Less conventional REST; id in a query param rather than the path.
  - Confidence: HIGH — the two-method-one-file shape is already shipped and exercised (`AvatarField.tsx:120`).
  - Blind spot: None significant.
- **Fix B**: Keep `[id].ts`, correcting the justification.
  - Strength: Conventional REST; scales to FR-012's future status PATCH.
  - Tradeoff: First dynamic route in the repo, unverified on this adapter.
  - Confidence: MEDIUM.
- **Decision**: FIXED via Fix A

### F3 — Saved list was unbounded in the query, the render, and the island props

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 §4 (plan.md:221-225), Performance Considerations (491-499)
- **Detail**: `loadSavedOpportunities` had no `.limit()`, pagination is explicitly out of scope, and nothing else capped the set. Every `/dashboard` load selected, rendered, and serialized every row into the island's props inside the HTML. Saving is one-click and idempotent, so the set only grows. The Performance section called this "trivial" and cited the Worker's 10ms CPU budget without bounding the input to it.
- **Fix**: `.limit(SAVED_LIST_LIMIT)` (200, exported from `content-opportunity.ts`); a caller receiving exactly that many rows knows the list is truncated, and the panel shows "Showing your 200 most recent saves" as a fourth state. Performance section now states the cap is what makes the claim hold.
  - Strength: Bounds query, payload and render in one line; keeps pagination genuinely out of scope rather than merely unmentioned.
  - Tradeoff: A user past the cap cannot reach older saves until pagination ships.
  - Confidence: HIGH.
  - Blind spot: No usage data on how many opportunities a real user saves.
- **Decision**: FIXED

### F4 — `db reset` destroys the accounts Phases 2 and 3 depend on

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 criterion (plan.md:251), Migration Notes (503)
- **Detail**: S-02 recorded this verbatim — "Local DB was reset to apply the migration, so local auth users and profiles are gone — sign up again before manual testing" (`analyze-and-rank-opportunities/change.md:84-85`). The plan mandated `db reset` twice with no warning, then Phase 2's isolation protocol and every Phase 3 manual row assume working accounts with saved profiles. No seed file, no `db:reset` script. `supabase migration up` appears nowhere in this repo — unproven here, so switching commands was not a safe fix.
- **Fix**: Keep `db reset` (the established ritual across three prior plans) and add the consequence to Migration Notes: re-run `npm run db:types`, sign up a fresh test account, and save a 3–5 competitor profile before starting Phase 2.
- **Decision**: FIXED

### F5 — Phase 1's RLS check counted policies instead of reading them

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 criterion (plan.md:257)
- **Detail**: The criterion asserted `pg_policies` lists exactly four policies. Four policies written `using (true)` would pass it. This gates the PRD's hardest guardrail, and Phase 1's Overview claims the phase "ends with a table that cannot leak" — a claim the criterion did not support. The real proof lived in Phase 2's protocol, one gate too late.
- **Fix**: Assert the expressions — each of the four rows in `pg_policies` carries `auth.uid() = user_id` in its `qual` and/or `with_check`.
- **Decision**: FIXED

### F6 — `removingIds` required by the panel but absent from the parent's state

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 §2 vs §4 (plan.md:373-376 vs 411)
- **Detail**: `SavedOpportunitiesPanel` props required `removingIds: Set<string>`, and the panel's mid-removal state depended on it, but `DashboardPanels`' state contract declared only the saved rows and a set of `video_id`s with a save in flight. The two contracts in the same phase disagreed.
- **Fix**: Added `removingIds: Set<string>` to the parent's declared state, with a note that the two sets are keyed differently on purpose — saves by `video_id` (the only identifier the ranking has for a row that does not exist yet), removals by row `id`.
- **Decision**: FIXED

### F7 — Idempotent re-save could prepend a duplicate row

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 §2 (plan.md:378-380) vs Phase 2 §1 step 5 (293-294)
- **Detail**: The route returns the _existing_ row on a repeat save; the client prepended the returned row unconditionally. Within one tab the saved badge makes a repeat save unclickable, but the shared-state design is per-tab: a second tab, or an SSR list loaded before another tab saved, produces a prepend of a row already in the array — a duplicate `id`, a React key collision, and a visibly doubled row.
- **Fix**: Merge by `id` — replace in place when present, otherwise prepend.
- **Decision**: FIXED

### F8 — End State promised "modify" protection that nothing verified

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Desired End State (plan.md:67-68), Phase 2 criterion (334)
- **Detail**: "No other user can read, modify or delete those rows." The isolation protocol tested read and delete only. The UPDATE policy ships but no route uses it and no criterion exercised it, so "modify" rested on the policy's existence alone.
- **Fix**: The isolation protocol is now five assertions, adding a cross-user PATCH via PostgREST expected to affect zero rows. The end-state "Verified by" sentence names update and delete explicitly.
- **Decision**: FIXED

### F9 — Two verification claims weaker than they read

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §3 (plan.md:211-212), Phase 3 criterion (447)
- **Detail**: (a) `OPPORTUNITY_STATUSES` was described as "single-sourced so the CHECK constraint and the type cannot drift" — a TypeScript constant cannot constrain a SQL CHECK, and nothing enforces agreement between the two files; the claim was false as written. (b) `grep -rl "Intl.NumberFormat" src/` missed `Intl.DateTimeFormat`, which `formatDate` uses (today at `OpportunityList.tsx:16`), and would pass vacuously if the formatters were deleted rather than moved.
- **Fix**: (a) Reworded to "mirrors the SQL CHECK by convention only", requiring a cross-reference comment in each file. (b) Criterion now greps `Intl\.` and additionally asserts `src/lib/format.ts` exports all three helpers.
- **Decision**: FIXED
