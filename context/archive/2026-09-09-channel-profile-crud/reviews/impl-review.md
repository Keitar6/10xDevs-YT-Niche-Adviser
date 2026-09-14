<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Channel Profile CRUD Implementation Plan

- **Plan**: context/changes/channel-profile-crud/plan.md
- **Scope**: Phase 1 of 1 (full plan)
- **Date**: 2026-09-11
- **Verdict**: NEEDS ATTENTION → **RESOLVED 2026-09-12** (all 8 findings fixed during triage)
- **Findings**: 0 critical, 4 warnings, 4 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

**Automated verification re-run:** `npm run lint` PASS, `npm run build` PASS (`Server built in 11.19s`). Remaining build warnings (sitemap `site` config, a CSS minify notice) are pre-existing and unrelated to this diff.

**Plan adherence baseline:** all six planned changes (API route, form, `SubmitButton` override, dialog, Topbar wiring, dashboard render) verified MATCH against their contracts, with correct line-level evidence. All four "What We're NOT Doing" guardrails held: no `/profile` route, no ID-format validation, no deletion, no auth-component changes (`SignInForm.tsx`/`SignUpForm.tsx` untouched in both commits).

## Findings

### F1 — Max-5 competitor cap (decision D1) is not implemented

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/pages/api/profile.ts:13-16, src/components/profile/ChannelProfileForm.tsx:34,78-80,113
- **Detail**: The plan's own "SUPERSEDED 2026-09-11" note retires the min-3/no-max rule in favour of a hard cap of 5 enforced in the profile (decision D1 in `analyze-and-rank-opportunities/research.md:242-260`), restoring PRD FR-003 conformance ("3–5 ID konkurentów"). None of it is in the code: `profile.ts:15` has only `.min(3)`, `validate()` at `ChannelProfileForm.tsx:34` checks only `< 3`, `addCompetitorRow()` at `:78-80` appends unconditionally, and the label at `:113` still reads "(min. 3)". This is also the unbounded-input issue in its own right — there is no app-level or DB-level bound on `competitor_channel_ids` (migration `20260909213911_create_channel_profiles.sql:6` is a plain `text[]`), so a caller can persist an arbitrarily large array that is then re-read on every Topbar render. D1 records this as the cheapest single lever on S-02's quota, latency, and CPU cost at once, and is the stated reason S-01 is still `in-progress`.
- **Fix A ⭐ Recommended**: Implement the cap now across the four call sites — `.max(5, ...)` on the zod array schema, mirror it in `validate()`, disable the "Add competitor" button at 5 rows rather than erroring on submit, and update the label to "(3–5)".
  - Strength: Closes S-01 against PRD FR-003, and lets `/api/analyze` trust the profile as its source of truth instead of re-deriving a subset — exactly the rationale D1 records. Fixes the unbounded-array exposure in the same edit. All four sites are enumerated with line numbers.
  - Tradeoff: Re-opens a change already marked `implemented`, and needs a fresh manual pass on the add/remove row flow.
  - Confidence: HIGH — the cap is a settled user decision, the sites are identified, and no existing row can exceed 5 (single user, form is the only writer).
  - Blind spot: Q10 (channel-ID format validation) lands in these same three files and is still open — deciding it first would avoid touching them twice.
- **Fix B**: Leave S-01 as-is and fold the cap into the S-02 plan.
  - Strength: Avoids reopening a closed slice; keeps the cap next to the analysis code whose budget depends on it.
  - Tradeoff: Contradicts D1's explicit "enforced in the profile, not in the analysis path" ruling, and leaves S-01 knowingly non-conformant with FR-003 while the roadmap still calls it the prerequisite for S-02.
  - Confidence: MEDIUM — workable, but it re-opens a fork the user already resolved.
  - Blind spot: Whether S-02 planning would actually catch it, or inherit an unbounded profile.
- **Decision**: FIXED via Fix A (verified in browser 2026-09-12) — `.max(5)` on the zod schema, mirrored bound in `validate()`, `addCompetitorRow()` capped at 5, Add button disabled at 5, label now "(3–5)". Lint + build pass.

### F2 — Save failures are silent: no catch around fetch/res.json()

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/profile/ChannelProfileForm.tsx:53-70
- **Detail**: `handleSubmit` wraps the fetch in `try { ... } finally { setSaving(false) }` with **no `catch`**. A network failure (offline, worker down) or a non-JSON response makes `fetch` or `res.json()` throw; `saving` resets via the `finally`, but `serverError` is never set. The button returns to "Save profile" with no message and nothing persisted — the user cannot distinguish a failed save from a successful one. This is the exact failure mode the plan's own success criteria demand be visible ("rejected with a visible message inside the dialog rather than silently accepted"), and it is what swallows F3's 500. The plan's Contract itself specified only try/finally, so this is a plan-level gap, not just an implementation slip.
- **Fix**: Add a `catch` that sets `serverError` to a readable connection-failure message, keeping the existing `finally`.
- **Decision**: FIXED — added a `catch` setting `serverError` to a readable connection-failure message, keeping the existing `finally`.

### F3 — Malformed request body throws an unhandled 500

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/profile.ts:31
- **Detail**: `await context.request.json()` is unguarded. An empty or malformed body throws a `SyntaxError` that escapes the handler as a generic 500 with an HTML body — inconsistent with every other exit in this file, which returns `{ error }` JSON via the `jsonError` helper. That non-JSON response is precisely what makes `res.json()` throw on the client (F2), so the two compound into a silent failure.
- **Fix**: Wrap the `request.json()` call in try/catch and return `jsonError("Invalid JSON body", 400)` on parse failure.
- **Decision**: FIXED — `request.json()` wrapped in try/catch returning `jsonError("Invalid JSON body", 400)`. Note the 401 auth gate precedes the parse, so the guard is only reachable when signed in (correct ordering).

### F4 — Topbar discards the profile query error, which can mask an existing profile

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/Topbar.astro:8-11
- **Detail**: The query destructures only `{ data: profile }`, discarding `error`. `.maybeSingle()` is the correct choice and handles the genuine zero-row case cleanly, but on a transient failure `profile` is `null` and the UI renders "Set up profile" for a user who _has_ one. Because the dialog then opens empty and the save path is an upsert on the `user_id` conflict target (`profile.ts:51-55`), a user who fills it in from that state overwrites their real profile with no warning — a data-loss path, not just a mislabelled trigger. Low probability, but the failure is silent in both directions.
- **Fix A ⭐ Recommended**: Capture `error` and distinguish it from the no-profile case — log it and render the trigger in a neutral/error state rather than "Set up profile", so a failed read can never be mistaken for an empty profile.
  - Strength: Removes the clobber path at its source; keeps the genuine first-time-user case unchanged.
  - Tradeoff: Adds a third trigger state to reason about in a nav strip that currently has two.
  - Confidence: HIGH — the null-vs-error ambiguity is visible in four lines of code.
  - Blind spot: Haven't verified how an error state should read in the UI copy; the project's language choice is itself unsettled (S-02 research notes English UI vs. Polish docs).
- **Fix B**: Just `console.error(error)` and leave the rendering as-is.
  - Strength: One line; makes failures diagnosable without redesigning the trigger.
  - Tradeoff: The overwrite path remains — it only becomes visible in logs after the fact.
  - Confidence: MEDIUM — improves observability, doesn't fix the data risk.
  - Blind spot: No logger exists in this project (Observability is `absent` per the roadmap baseline), so a bare `console.error` in a Worker may go unseen.
- **Decision**: FIXED via Fix A — `Topbar.astro` captures `error` and passes `loadFailed` to `ProfileDialog`, which renders a non-interactive "Profile unavailable" instead of "Set up profile" when the read failed and no profile is known. Closes the upsert-clobber path. The accompanying `console.error` was dropped: it would have been the codebase's only `console` call and its only lint warning (`no-console: "warn"`), and per the finding's own blind spot a bare console call in a Worker may go unseen anyway.

### F5 — Unplanned global cursor rule in global.css

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/styles/global.css:124-127
- **Detail**: The commit adds a global `button:not(:disabled), [role="button"]:not(:disabled) { cursor: pointer; }` rule. Not listed in "Changes Required" or Key Discoveries. Plausibly motivated by this phase's new dialog trigger/close/remove buttons (Tailwind Preflight resets `cursor` on buttons), but it is application-wide, not scoped to the profile feature.
- **Fix**: Keep it and note it in the plan as a disclosed addendum, so the next review doesn't re-flag it as undisclosed drift.
- **Decision**: FIXED — kept the rule and disclosed it as a dated addendum in `plan.md` Key Discoveries.

### F6 — Dynamic competitor rows keyed by array index

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/profile/ChannelProfileForm.tsx:117
- **Detail**: `key={index}` on a list whose rows can be removed from the middle. Values are fully controlled from state so the rendered text stays correct, but React reconciles the wrong DOM nodes on removal, which can move focus or transient uncontrolled DOM state to the wrong input. Manual step 1.10 passed, so no visible glitch was observed — this is a latent fragility, not a current defect.
- **Fix**: Key rows by a stable per-row id generated when the row is added, instead of by index.
- **Decision**: FIXED — competitor rows now carry a stable generated `id` (`CompetitorRow { id, value }`); `key={row.id}`, and update/remove address rows by id instead of index.

### F7 — plan-brief.md still describes the abandoned function-form-action approach

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/channel-profile-crud/plan-brief.md:34,40
- **Detail**: The brief's Key Decisions table and Architecture section both state the form "kept `SubmitButton`'s pending-state working via a React 19 function form action instead of `onSubmit`" — the exact opposite of what shipped. `plan.md` documents at length that this combination was actively broken inside Radix's Dialog and was reverted to a plain `onSubmit` handler with an explicit `pending` prop. The brief is the short-form doc future readers and agents are most likely to skim, and it currently teaches the pattern that failed.
- **Fix**: Update the two statements in `plan-brief.md` to match `plan.md`'s Key Discoveries (plain `onSubmit` + `e.preventDefault()`, `SubmitButton` `pending` override).
- **Decision**: FIXED — corrected three stale statements in `plan-brief.md` (Key Decisions row, In-scope line, Architecture paragraph), not the two originally identified. Also synced the "no cap" claims in `plan.md` and `plan-brief.md` that F1 had made wrong; Progress checkboxes left untouched as a historical record.

### F8 — API-route boundary conventions unenforced (prerender flag, PROTECTED_ROUTES)

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/profile.ts:1, src/middleware.ts:4
- **Detail**: Two conventions gaps, neither introduced by this change and neither exploitable today. (a) CLAUDE.md states "API routes must export `const prerender = false`"; `profile.ts` omits it — as do `signin.ts`, `signup.ts`, `signout.ts`. With `output: "server"` (astro.config.mjs:11) routes are non-prerendered by default, so the rule is written-but-redundant across the whole API surface. (b) `/api/profile` is not in `PROTECTED_ROUTES` (`["/dashboard"]`), by deliberate plan decision — it is safe only because the route self-checks `context.locals.user` at `:27` and returns 401. Authz itself is sound: `user_id` comes from the server-derived session, the zod schema drops any client-supplied `user_id`, and RLS `with check (auth.uid() = user_id)` backs it at the database.
- **Fix**: Decide the rule once at the project level — either drop the redundant `prerender` line from CLAUDE.md or apply it uniformly, and document that every `/api/*` route must self-check `locals.user`.
- **Decision**: FIXED via "Update CLAUDE.md" — the redundant `prerender = false` rule is replaced with a note that `output: "server"` makes it unnecessary, plus an explicit rule that every `/api/*` route touching user data must self-check `context.locals.user` and 401, since `PROTECTED_ROUTES` covers only page requests.
