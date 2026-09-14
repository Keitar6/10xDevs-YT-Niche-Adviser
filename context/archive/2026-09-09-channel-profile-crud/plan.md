# Channel Profile CRUD Implementation Plan

## Overview

Add a channel profile create/edit **dialog**, opened from a "Profile" link in the (previously unused) `Topbar.astro` on `/dashboard`, backed by a single upserting API route and the `channel_profiles` table from `channel-profile-data-model`. This is roadmap item **S-01**, the first user-facing slice in Stream B, and it unlocks **S-02** (the north-star analyze-and-rank slice).

**Revision note:** this plan originally specified a dedicated `/profile` page. Mid-Phase-1 implementation, the user reconsidered after seeing the page in practice and asked for a dialog opened from the dashboard's nav strip instead, with the save flow closing/updating in place rather than reloading the page. This revision reflects that decision — see "Key Discoveries" for the mechanics.

## Current State Analysis

- `channel_profiles` exists (migration `20260909213911_create_channel_profiles.sql`) with per-owner RLS, a `unique` constraint on `user_id` (one profile per user), and `user_id default auth.uid()`. `src/types.ts` exports `ChannelProfile` aliased from the generated `Database` type; `src/lib/supabase.ts`'s client is already typed.
- No profile-related route or component exists yet.
- `src/components/Topbar.astro` exists (a nav strip with "Dashboard"/"Sign out" links) but was never rendered by any page — a leftover from the starter scaffold.
- `src/pages/dashboard.astro` shows the user's email and a sign-out form — nothing profile-related, and doesn't render `Topbar`.
- Existing auth forms (`SignInForm.tsx`, `SignUpForm.tsx`) establish most conventions this plan follows: client-side validation via React state + the shared `FormField` component (per-field `error` prop), a `ServerError` component for top-level messages, `SubmitButton` for the pending-state button. Their plain `<form method="POST" action="...">` submission style does _not_ carry over here — see Key Discoveries.
- `zod` (`^4.4.3`) is already a dependency, per CLAUDE.md's "API routes: validate input with zod" convention — not yet used anywhere in this codebase (first usage).
- No test runner exists (same as the prior two changes) — verification is manual.
- No dialog/modal component existed before this phase; `npx shadcn@latest add dialog` was run to add `src/components/ui/dialog.tsx` (Radix-based). The generated file imported `cn` from a new `cn` npm package instead of this project's existing `@/lib/utils` helper — fixed to match CLAUDE.md's documented convention, and the redundant `cn` package dependency was removed.

## Desired End State

A logged-in user on `/dashboard` clicks "Profile" (or "Set up profile" if they have none yet) in the top nav strip, a dialog opens with their existing profile pre-filled (or empty, 3 rows, for a first-time user), they edit niche/sub-niche/competitor IDs (addable rows, 3–5 — see Key Discoveries) and save — the dialog shows a "Profile saved" confirmation and stays open, no page reload, and the nav label updates from "Set up profile" to "Profile" in place if this was the first save.

**Verification:** manually create a profile via the dialog, confirm it persists (reopen the dialog, still pre-filled) and the trigger label updates, edit it and confirm the change sticks, and exercise the validation failure paths (fewer than 3 competitor IDs, a duplicate ID) to confirm they're rejected with a visible message inside the dialog rather than silently accepted, crashing, or navigating away.

### Key Discoveries:

- **Addendum (disclosed 2026-09-12, via impl-review F5):** the implementation also added a global rule to `src/styles/global.css` — `button:not(:disabled), [role="button"]:not(:disabled) { cursor: pointer; }` — which was not in Changes Required. Tailwind's Preflight resets `cursor` on buttons, and this phase introduced the project's first dialog trigger/close/remove buttons. Kept deliberately; recorded here so it reads as disclosed scope rather than undocumented drift.
- **SUPERSEDED 2026-09-11:** the min-3/no-max rule below is retired. The user has capped competitors at **5, enforced in the profile** ("that's our source of truth for analysis"), which restores conformance with PRD FR-003 ("3-5"). See decision D1 in `context/changes/analyze-and-rank-opportunities/research.md`. **Implemented 2026-09-12** (impl-review F1, verified in browser): `.max(5)` on the zod schema in `src/pages/api/profile.ts`, the mirrored bound in `ChannelProfileForm.tsx` `validate()`, `addCompetitorRow()` capped at 5 with the "Add competitor" button disabled at the cap, and the label now reading "(3–5)".
- **Deliberate PRD deviation, by explicit user direction:** the PRD/roadmap describe competitor IDs as a "3–5" range. This plan implements a **minimum of 3 with no upper cap** instead, per the user's explicit choice during planning. `channel_profiles.competitor_channel_ids` already has no DB-level bound (a decision made in `channel-profile-data-model` for a different reason — deferring the count check to this slice) — that column needs no migration change; only this slice's own app-level validation reflects the min-3/no-max rule.
- **Dialog save must not navigate**, so the form can't use the plain `<form method="POST" action="...">` pattern every other form in this codebase uses. First attempt used a React 19 _function_ form action (`<form action={asyncFn}>`); this turned out to be actively broken inside Radix's `Dialog` — Radix's dismissable-layer "click outside" detection and React 19's form-action transition batching interact badly, causing the dialog to close (and abort the in-flight `fetch`) on submit, which also meant nothing ever saved. Fixed by reverting to a plain `onSubmit` handler with `e.preventDefault()` — no form `action` prop at all, so Radix's outside-click logic has nothing to misinterpret. Since that drops `SubmitButton`'s automatic `useFormStatus()`-based pending tracking (which only tracks actual form actions, not manual `onSubmit`/`fetch`), `SubmitButton` gained an optional `pending` prop that overrides `useFormStatus()` when provided, and the form tracks its own `saving` state explicitly. `/api/profile` still returns JSON (`{ profile }` or `{ error }`) instead of redirecting, since the standalone page that consumed the old redirect-based contract no longer exists.
- **The request body is JSON, not `FormData`.** Original design kept `FormData` (matching the server's original `context.request.formData()` + `getAll("competitorChannelIds")` parsing) even after switching to `fetch`. In practice, a browser extension observed in testing (a wallet-style extension injecting a webpack-bundled content script into the page) clobbered the global `FormData` constructor, breaking `.set()` at runtime with no code-level bug on our side. Since this is a `fetch` call, not a native form submission, there was never a real reason to use `FormData` — switched both the client (`JSON.stringify({ niche, subNiche, competitorChannelIds })`) and the server (`context.request.json()`) to plain JSON, sidestepping that whole class of interference and simplifying the contract besides. Dynamic add/remove rows still work the same way; `competitorChannelIds` is now just a plain string array in the request body instead of repeated same-named form fields.
- Because `user_id` is `unique` with a `default auth.uid()`, "create" and "edit" are the same underlying operation: an upsert on the `user_id` conflict target. The API route doesn't need to know or care which case it is.
- `Topbar.astro` now does its own `channel_profiles` lookup (mirroring the pattern originally planned for the profile page/dashboard) so it's self-contained and reusable on any future page without each call site needing to remember to pass profile data down.

## What We're NOT Doing

- No competitor-ID format validation (e.g. YouTube's `UC...` shape) — consistent with `channel-profile-data-model`'s decision to skip this at the DB layer; this slice mirrors that at the app layer too.
- No re-verification of RLS isolation via a two-user curl test — `channel-profile-data-model` already proved that at the database level. This slice's own manual verification is a single-user UI walkthrough only.
- No profile deletion — FR-005 is nice-to-have and out of scope per the PRD's Non-Goals.
- No forced redirect for users without a profile yet — `/dashboard` stays the default landing post-login; the nav trigger label reflects whether a profile exists.
- No standalone `/profile` route — superseded by the dialog (see Revision note above).
- No changes to `SignInForm.tsx` / `SignUpForm.tsx` or the auth API routes.

## Implementation Approach

One new API route (`POST /api/profile`, zod-validated, upserting on the `user_id` conflict target, JSON responses) and a `ProfileDialog` React island (shadcn `Dialog` + the `ChannelProfileForm`) rendered from `Topbar.astro`, which itself gets wired into `/dashboard`. The form submits via a plain `onSubmit` handler calling `fetch` (see Key Discoveries for why a React 19 function form action doesn't work here), so saving never navigates away from the dashboard.

## Phase 1: Channel profile CRUD

### Overview

Add the upserting API route, the dialog + form, wire the dialog into `Topbar.astro`, and render `Topbar` on `/dashboard`.

### Changes Required:

#### 1. Profile upsert API route

**File**: `src/pages/api/profile.ts`

**Intent**: A `POST` route that validates the submitted profile with zod and upserts it for the current user — serving both the create and edit cases identically.

**Contract**: Reads `niche`, `subNiche` (optional), and `competitorChannelIds` (array) from `context.request.json()` (see Key Discoveries — JSON, not `FormData`). Validates with a zod schema: `niche` non-empty trimmed string; `sub_niche` trimmed/nullable string, empty or absent → `null`; `competitor_channel_ids` an array of non-empty trimmed strings with `.min(3)` and a `.refine` rejecting duplicates (case-sensitive exact match). Requires `context.locals.user` — returns a `401` JSON error (`{ error }`) if absent (this route isn't behind `PROTECTED_ROUTES`, since it's an API route hit only from the dialog on the already-protected `/dashboard`). On validation failure, `400` JSON `{ error: <first zod issue message> }`. On success, upserts via the typed Supabase client (`.upsert({ user_id: context.locals.user.id, ...parsed }, { onConflict: "user_id" }).select().single()`) and returns `200` JSON `{ profile: <the upserted row> }`. On a Supabase error, `400` JSON `{ error: <error.message> }`.

#### 2. Channel profile form

**File**: `src/components/profile/ChannelProfileForm.tsx`

**Intent**: A React component (no longer a standalone page's island, now rendered inside the dialog) with client-side validation, reusing `FormField`/`SubmitButton`/`ServerError`, and a dynamic, freely-growable list of competitor-ID rows.

**Contract**: Props: `profile: ChannelProfile | null` (for pre-fill) and `onSaved: (profile: ChannelProfile) => void` (replaces the original `serverError` prop — there's no more redirect-carried query param to read it from). Local state: `niche`, `subNiche`, `competitorIds: string[]` (initialized from `profile?.competitor_channel_ids ?? ["", "", ""]`), plus `serverError`, `saved`, and `saving` (all local, set from the fetch lifecycle instead of a query param). Renders one `FormField` per `competitorIds` entry (each `name="competitorChannelIds"`, `id` suffixed by index), a remove control once there are more than 3 rows, and an "Add competitor" button that disables at 5 rows. Submits via a plain `<form onSubmit={handleSubmit} noValidate>` — **not** a React 19 function `action` (see Key Discoveries: that combination breaks inside Radix's `Dialog`). `handleSubmit` calls `e.preventDefault()`, runs the same client-side validation as before, then on success sets `saving`, `fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ niche, subNiche, competitorChannelIds: competitorIds }) })`, and either calls `onSaved(json.profile)` and sets `saved` (shows an inline "Profile saved" message) or sets `serverError` from the JSON error — `saving` resets in a `finally`. Passes `saving` to `SubmitButton`'s new `pending` override prop (see Change 2a below) since `useFormStatus()` doesn't track manual `onSubmit` submissions.

#### 2a. SubmitButton pending override

**File**: `src/components/auth/SubmitButton.tsx`

**Intent**: `useFormStatus()` only reports pending state for actual form actions (a URL string or a function passed to `action`), not for a manual `onSubmit` + `fetch` flow — needed so `ChannelProfileForm`'s "Saving..." state still shows.

**Contract**: Add an optional `pending?: boolean` prop; when provided it overrides the `useFormStatus()`-derived value (`pendingProp ?? formPending`). Existing callers (`SignInForm`, `SignUpForm`) omit it and keep relying on `useFormStatus()` unchanged.

#### 3. Profile dialog

**File**: `src/components/profile/ProfileDialog.tsx`

**Intent**: Own the dialog open/close state and the current profile's client-side state (so the trigger label and pre-fill update immediately after a save, with no page reload), wrapping `ChannelProfileForm` in the shadcn `Dialog`.

**Contract**: Props: `initialProfile: ChannelProfile | null` (server-fetched by `Topbar.astro`). Local state: `open` (boolean) and `profile` (initialized from `initialProfile`, updated via the form's `onSaved`). Renders a `DialogTrigger asChild` button labeled `profile ? "Profile" : "Set up profile"`, and a `DialogContent` containing `<ChannelProfileForm profile={profile} onSaved={(p) => setProfile(p)} />`.

#### 4. Wire the dialog into Topbar

**File**: `src/components/Topbar.astro`

**Intent**: Give every page that renders `Topbar` (currently just `/dashboard`) a profile-management entry point next to the existing "Dashboard"/"Sign out" links.

**Contract**: Add a server-side query for the current user's `channel_profiles` row (same shape as the query originally planned for the dashboard page), and render `<ProfileDialog initialProfile={profile} client:load />` between the existing "Dashboard" link and the sign-out form.

#### 5. Render Topbar on the dashboard

**File**: `src/pages/dashboard.astro`

**Intent**: Topbar was never rendered anywhere — this phase is what actually wires it in, which is also what makes the profile dialog reachable.

**Contract**: Add `<Topbar />` above the existing welcome card. Since `Topbar` now owns the sign-out form too, remove `dashboard.astro`'s own duplicate sign-out form (previously the only one).

#### 6. Add shadcn Dialog

**File**: `src/components/ui/dialog.tsx` (generated)

**Intent**: This project has no dialog/modal primitive yet; `ProfileDialog` needs one.

**Contract**: `npx shadcn@latest add dialog`, then fix its `cn` import to `@/lib/utils` (see Key Discoveries) and remove the now-unnecessary `cn` package dependency it added.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- Opening the dialog for the first time (no profile yet) shows the "Set up profile" trigger and an empty form with 3 competitor-ID rows
- Submitting with niche + 3 valid competitor IDs succeeds, shows "Profile saved" inline, dialog stays open, and the trigger label updates to "Profile" without a page reload
- Closing and reopening the dialog shows the just-saved data pre-filled
- Adding more than 3 competitor-ID rows, filling them, and saving succeeds (no upper-cap rejection)
- Editing the niche and re-saving persists the change and is reflected on reopen
- Submitting with only 2 competitor IDs is rejected with a visible error inside the dialog, profile unchanged, dialog stays open
- Submitting with a duplicate competitor ID (same string twice) is rejected with a visible error inside the dialog
- Removing a row down to exactly 3 and re-adding works without layout/state glitches (sanity check on the dynamic list)
- Closing the dialog (X button or clicking outside) and reopening it shows the current saved state, not a stale one

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None — no test runner exists in this repo (same as the two prior changes).

### Integration Tests:

- None automated. Covered by the manual verification above.

### Manual Testing Steps:

1. Run `npm run dev`, sign in, visit `/dashboard` — confirm the nav strip shows "Dashboard", "Set up profile", "Sign out".
2. Click "Set up profile" — confirm a dialog opens with an empty form, 3 rows.
3. Fill niche + 3 competitor IDs, save — confirm "Profile saved" shows inline, dialog stays open, and (after closing) the trigger now reads "Profile".
4. Reopen the dialog — confirm the saved data pre-fills.
5. Add 2 more rows (5 total), fill them, save — confirm it succeeds, and that "Add competitor" is disabled at 5.
6. Change the niche, save again — confirm the new value persists on reopen.
7. Remove rows down to 2, attempt to save — confirm a visible validation error inside the dialog and no partial save.
8. Restore to 3+ valid rows but duplicate one ID, attempt to save — confirm a visible validation error.

## Performance Considerations

None — single-row reads/writes scoped to one user, no new data-fetching patterns.

## Migration Notes

No schema changes — reuses `channel_profiles` as-is from `channel-profile-data-model`.

## References

- Roadmap item: `context/foundation/roadmap.md` — S-01
- PRD requirements: `context/foundation/prd.md` — FR-003, FR-004, US-01
- Prior change (table + RLS): `context/changes/channel-profile-data-model/plan.md`
- Form conventions to follow: `src/components/auth/SignUpForm.tsx`, `src/components/auth/FormField.tsx`
- shadcn Dialog: `src/components/ui/dialog.tsx` (installed via `npx shadcn@latest add dialog` during this phase)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Channel profile CRUD

#### Automated

- [x] 1.1 Lint passes: `npm run lint` — 3df99f1
- [x] 1.2 Build passes: `npm run build` — 3df99f1

#### Manual

- [x] 1.3 Opening the dialog with no profile yet shows "Set up profile" trigger and an empty form with 3 rows — 3df99f1
- [x] 1.4 Creating a profile succeeds, shows "Profile saved" inline, dialog stays open, trigger updates to "Profile" — no page reload — 3df99f1
- [x] 1.5 Reopening the dialog shows the just-saved data pre-filled — 3df99f1
- [x] 1.6 Adding more than 3 competitor-ID rows and saving succeeds (no upper cap) — 3df99f1
- [x] 1.7 Editing the niche and re-saving persists the change on reopen — 3df99f1
- [x] 1.8 Submitting with fewer than 3 competitor IDs is rejected with a visible error inside the dialog — 3df99f1
- [x] 1.9 Submitting a duplicate competitor ID is rejected with a visible error — 3df99f1
- [x] 1.10 Closing and reopening the dialog reflects current saved state, not stale data — 3df99f1
