<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Analyze and Rank Opportunities

- **Plan**: `context/changes/analyze-and-rank-opportunities/plan.md`
- **Scope**: Phases 1–5 of 5 (full plan)
- **Date**: 2026-09-13
- **Verdict**: NEEDS ATTENTION (triaged 2026-09-13 — 5 fixed, 1 accepted)
- **Findings**: 0 critical, 3 warnings, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Automated verification

| Command                                | Result                                                                                                                                                |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                             | PASS — 5 files, 67 tests, 186ms                                                                                                                       |
| `npm run build`                        | PASS — astro build, 14.6s, no errors                                                                                                                  |
| `npm run lint` (this slice's 17 files) | PASS — 0 errors, 0 warnings                                                                                                                           |
| `npm run lint` (full repo)             | FAIL — 54 prettier errors in `src/components/profile/AvatarField.tsx`, introduced by `6d5417f` (not this slice). See the note under Success Criteria. |
| `grep -r "search.list\|/search?" src/` | PASS — no matches                                                                                                                                     |

## Notes on plan adherence

No undocumented drift. Every deviation from the plan text is recorded in `change.md`
and coherently implemented end to end:

- `competitors jsonb` migration (plan said "No schema changes") — documented; backfills
  before dropping the old column; all four `channel_profiles` RLS policies untouched.
- Handles/URLs accepted and resolved at save time rather than rejected — documented;
  wired through form, API, resolution, storage, and display.
- Anthropic error-chain order `RateLimitError → APIConnectionError → APIError` — this
  _corrects_ a bug in the plan, which listed an order that left the
  `APIConnectionError` branch unreachable (`APIConnectionError extends APIError`).
- `youtube-ids.ts` / `channel-profile.ts` — justified consequences of the two
  deviations above, not independent scope creep.
- A fourth empty-ranking case (all videos inside `MIN_RANKABLE_AGE_DAYS`) — an
  addition that closes a hole the plan's three enumerated cases left open.

Contract checks verified as MATCH: no `search.list`; Shorts filtered before the
median; zero-median guard returns skipped rather than Infinity/NaN; paging bounded
on duration-independent signals only with no `videos.list` inside the loop;
`z.coerce.number()` on `viewCount` and absent-key modelling for unrequested parts;
rate limiter keyed on user id after the auth check at 5/60; `import { env } from
"cloudflare:workers"`; all eight ordered failure exits present, with skipped
channels named by title rather than raw ID.

## Findings

### F1 — No timeout on the YouTube fetch calls

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/youtube.ts:69-74
- **Detail**: `getJson` calls `fetch(url)` with no `signal` / `AbortSignal.timeout(...)`.
  Per analyze run this is 1 channels.list + up to 2 playlistItems pages + N videos.list
  batches, fanned across up to 5 competitors. A hanging YouTube response has nothing
  bounding it. The sibling module `justify.ts:108` sets an explicit `timeout: 20_000`
  with a comment tying it to the p95 budget, so the intent is already established in
  this slice — it just was not applied to the YouTube path.
- **Fix**: Pass `AbortSignal.timeout(...)` to the `fetch(url)` call in `getJson` and map
  an abort onto the existing `YouTubeError({ kind: "transport" })`.
  - Strength: Mirrors the reasoning already written down in `justify.ts`; the error
    vocabulary to surface it already exists.
  - Tradeoff: One more tunable constant.
  - Confidence: HIGH — single call site, existing error type.
  - Blind spot: The right timeout value is unmeasured; YouTube's own latency was ~1.6s
    for a 5-competitor run, so anything in the 10–20s range is generous.
- **Decision**: FIXED via Fix — `AbortSignal.timeout(10_000)` added to `getJson`; abort mapped onto `YouTubeError({ kind: "transport" })` with a distinct message.

### F2 — One flaky competitor fails the whole analyze batch

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/youtube.ts:463
- **Detail**: `fetchCompetitorVideos` uses `Promise.all(...)`, so a throw on any single
  competitor's `collectChannelSample` rejects the batch. `src/pages/api/analyze.ts:94-104`
  catches it and returns one `jsonError`, discarding every competitor that succeeded.
  The route already has a `SkippedChannel` / `unresolved` vocabulary built precisely to
  report partial results, and the plan's Desired End State promises that competitors
  which fail are "named explicitly rather than silently dropped" — a whole-batch failure
  does the opposite.
- **Fix A ⭐ Recommended**: Switch to `Promise.allSettled` and fold per-competitor
  rejections into the existing `unresolved` / skip reporting.
  - Strength: Delivers the partial-result behaviour the Desired End State already
    promises, reusing types that exist; one user's dead competitor stops nuking the run.
  - Tradeoff: Slightly more branching where results are assembled.
  - Confidence: HIGH — the reporting structures are already in place.
  - Blind spot: Quota-exceeded should still fail the whole run loudly rather than being
    reported as four skipped channels; the fold needs to special-case `kind: "quota"`.
- **Fix B**: Leave as-is and accept whole-batch failure.
  - Strength: Zero change; failures are at least loud and readable.
  - Tradeoff: Contradicts the slice's own stated resilience goal.
  - Confidence: MEDIUM — acceptable at MVP scale with 3–5 curated competitors.
  - Blind spot: Unknown how often a single competitor transiently fails in practice.
- **Decision**: FIXED via Fix A — `Promise.allSettled` in `fetchCompetitorVideos`; per-competitor failures fold into `unresolved`, while `quota` and `auth` stay fatal.

### F3 — Triggered NDJSON-streaming follow-up is tracked only in change.md

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/analyze-and-rank-opportunities/change.md (5.12 section)
- **Detail**: The plan set an explicit escalation line — "Escalate to streamed NDJSON
  only if measured p95 exceeds ~10s." Phase 5 measured p95 at **~11.2s** at the
  contracted 5-competitor cap (11.20 / 11.17 / 10.63 / 10.95s), and `change.md` correctly
  records the follow-up as "_triggered_, not hypothetical", with the LLM call isolated as
  ~85% of latency (1.62s with `ANTHROPIC_API_KEY` unset). But this exists nowhere else:
  no roadmap Parked entry, no backlog row, no follow-ups file. Archiving makes
  `change.md` read-only by convention, so a triggered, measured, well-diagnosed follow-up
  goes dormant at exactly the moment it stops being visible.
- **Fix**: Record it before archiving — add it to `context/foundation/roadmap.md`'s
  `## Parked` section (or open a backlog item) naming the measurement, the ~10s line, and
  the Anthropic call as the lever.
  - Strength: Costs one line and preserves the single most actionable measurement the
    slice produced.
  - Tradeoff: None material.
  - Confidence: HIGH — the diagnosis is already written; it only needs relocating.
  - Blind spot: Whether the team wants it as a roadmap slice or a plain backlog note.
- **Decision**: FIXED via Fix — parked in `context/foundation/roadmap.md` `## Parked` with the measurement, the ~10s line, and the Anthropic call named as the lever.

### F4 — Three manual criteria cannot be closed from a coding session

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: plan.md Progress rows 3.6, 3.8, 5.13
- **Detail**: Three rows remain `- [ ]`, and `change.md` is explicit and honest about why:
  3.6 (call ordering inside the paging loop) is not observable from outside the process
  and was demonstrated by a Phase 3 scratch harness; 3.8 (quota per run) needs the Google
  Cloud console; 5.13 (CPU time per invocation) needs Workers Logs after a smoke deploy.
  This is not rubber-stamping — the remaining rows are the ones that were _not_ ticked.
  5.13 is the one that matters: a 10ms CPU overrun on the free plan surfaces as an
  intermittent Error 1102 with no clean error, and the prescribed escalation is the
  $5/mo Workers Paid plan.
- **Fix**: Read CPU time from Workers Logs for one 5-competitor run against the deployed
  Worker and record it; confirm quota in the Google Cloud console. Both are user-side
  reads, not code changes.
- **Decision**: ACCEPTED — archived with 3.6 / 3.8 / 5.13 open; rationale already recorded in change.md. 5.13 (CPU time from Workers Logs) remains the one worth closing after a deploy.

### F5 — Same whole-batch failure shape in handle resolution

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/youtube.ts:189-198
- **Detail**: `resolveChannelRefs` uses the same `Promise.all` shape as F2 for per-handle
  lookups. Lower severity because it runs only at profile-save time (rare) rather than on
  the analyze path, but one unresolvable handle fails the whole save.
- **Fix**: Apply the same `Promise.allSettled` treatment as F2 if F2 is taken.
- **Decision**: FIXED — same `Promise.allSettled` treatment applied to `resolveChannelRefs`; quota/auth stay fatal.

### F6 — Raw Supabase error messages returned to the client

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/analyze.ts:83-85, src/pages/api/profile.ts:110-111
- **Detail**: Both routes pass raw Supabase `error.message` into `jsonError`, so a
  Postgres/PostgREST string naming a column, constraint, or table can reach the browser.
  This is a pre-existing pattern that predates this slice — `analyze.ts` followed
  `profile.ts` — so it is not a regression introduced here, but it is now in two places
  and will be copied a third time.
- **Fix**: Log the raw message and return a generic one; worth a follow-up, not blocking.
- **Decision**: FIXED — both routes now log the raw PostgREST message via `console.error` (Workers Logs) and return a generic message. Uses a commented `eslint-disable-next-line no-console`, the first in the repo, because no logger exists yet.

## Note — repo lint is red on master (not this slice)

`npm run lint` fails at HEAD with 54 `prettier/prettier` errors, all in
`src/components/profile/AvatarField.tsx`, introduced by `6d5417f "fix: profile dialog
buttons order change"` — an ad-hoc commit that appears to have bypassed the
husky/lint-staged pre-commit hook. Every file belonging to this slice is lint-clean.

This matters beyond this review: CI runs lint on every push to `master`, so CI is red
now, and `channel-profile-avatar` (S-05) carries a pending Progress row 5.1 "CI is green
on push to `master`" that cannot be true until this is fixed. It is auto-fixable with
`npm run lint:fix`.

## Triage outcome — 2026-09-13

| Finding                            | Decision                  |
| ---------------------------------- | ------------------------- |
| F1 — no fetch timeout              | FIXED                     |
| F2 — whole-batch analyze failure   | FIXED (Fix A)             |
| F3 — untracked NDJSON follow-up    | FIXED (parked on roadmap) |
| F4 — unverifiable manual criteria  | ACCEPTED                  |
| F5 — whole-batch handle resolution | FIXED                     |
| F6 — raw DB errors to client       | FIXED                     |

Post-triage verification: `npm run lint` 0 errors, `npm test` 67/67 passing,
`npm run build` complete. The pre-existing `AvatarField.tsx` formatting break that
made lint red on `master` was fixed separately in `1f36f54`.

Note on F6: the fix introduces the repo's first `console.error` and its first
inline `eslint-disable-next-line no-console`. This was a deliberate trade — the
alternative was discarding the DB error entirely, which would have made the leak
fix a diagnostics regression. `observability` is already enabled on the Worker, so
the message lands in Workers Logs. A real logger remains the proper follow-up.
