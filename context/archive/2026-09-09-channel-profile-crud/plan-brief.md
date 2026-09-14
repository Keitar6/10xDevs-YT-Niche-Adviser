# Channel Profile CRUD — Plan Brief

> Full plan: `context/changes/channel-profile-crud/plan.md`

## What & Why

Add a channel profile create/edit **dialog** (niche, sub-niche, competitor channel IDs), satisfying FR-003 (create) and FR-004 (edit). This is roadmap Slice **S-01** — the first user-facing capability in the project, and it unlocks S-02, the north-star analyze-and-rank slice.

**Revision:** originally planned as a standalone `/profile` page; mid-implementation the user asked for a dialog opened from the dashboard's nav strip instead, saving without a page reload. See the full plan's "Revision note" and updated Key Decisions below.

## Starting Point

`channel_profiles` already exists with per-owner RLS and a `unique` constraint on `user_id` (from `channel-profile-data-model`). No profile UI exists yet; `Topbar.astro` (a "Dashboard"/"Sign out" nav strip) exists but was never rendered anywhere.

## Desired End State

A logged-in user on `/dashboard` clicks "Profile" (or "Set up profile") in the nav strip, a dialog opens pre-filled (or empty, 3 rows) — edits niche/sub-niche/competitor IDs (addable, 3–5) and saves in place, no page reload, trigger label updates immediately.

## Key Decisions Made

| Decision                    | Choice                                                                                | Why (1 sentence)                                                                                                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI shape                    | Dialog, not a page                                                                    | User's call after seeing the page in practice — felt like it should be a lightweight dialog, not full navigation                                                                                                  |
| Trigger location            | Wire up the existing unused `Topbar.astro` on `/dashboard`                            | Reuses a component that already existed but was never rendered                                                                                                                                                    |
| Save behavior               | Client-side `fetch` via a plain `onSubmit` handler, dialog stays open (no navigation) | Feels like a real modal; first fetch-based form in this codebase. A React 19 function form action was tried first and is broken inside Radix's `Dialog` — `SubmitButton` gained a `pending` override prop instead |
| Standalone `/profile` route | Removed                                                                               | Dialog is now the only way in, per user's explicit choice                                                                                                                                                         |
| Competitor ID input         | Dynamic add/remove rows, **3–5**                                                      | Originally shipped min-3/no-max by user direction; superseded 2026-09-11 by decision D1 (cap of 5 enforced in the profile), restoring PRD FR-003                                                                  |
| ID format validation        | None — just non-empty trimmed strings                                                 | Mirrors F-02's DB-level decision not to bake in a possibly-wrong YouTube ID format assumption                                                                                                                     |
| Duplicate competitor IDs    | Rejected with a validation error                                                      | A duplicate is almost certainly a mistake; silently deduping could leave a user under the 3-minimum without telling them                                                                                          |
| RLS re-verification         | Single-user UI walkthrough only                                                       | F-02 already proved isolation at the DB level; this slice's own risk is scoping its queries correctly, not RLS itself                                                                                             |
| Create vs. edit             | Same upsert operation, same form                                                      | `user_id` is `unique` with `default auth.uid()` — the two cases are the same DB operation                                                                                                                         |

## Scope

**In scope:** `/api/profile` upsert route (zod-validated, JSON responses), `ChannelProfileForm` (fetch-based, plain `onSubmit`), `ProfileDialog` (shadcn Dialog), `Topbar.astro` wired into `/dashboard`, shadcn `dialog` component added.

**Out of scope:** profile deletion (FR-005, nice-to-have), competitor ID format validation, two-user RLS re-testing, forced redirect, any auth component changes, a standalone `/profile` route.

## Architecture / Approach

One upserting API route (conflict target: `user_id`) now returns JSON instead of redirecting. The form submits through a plain `<form onSubmit={handleSubmit} noValidate>` handler that calls `e.preventDefault()` then `fetch`. A React 19 function form action (`<form action={asyncFn}>`) was the original design but is actively broken inside Radix's `Dialog` (its dismissable-layer outside-click detection and React's form-action transition batching interact badly, closing the dialog and aborting the in-flight request); since `useFormStatus()` does not track manual `onSubmit` flows, `SubmitButton` gained an optional `pending` override prop and the form tracks its own `saving` state. `Topbar.astro` queries the profile server-side and passes it into `ProfileDialog`, which owns open/close and current-profile state client-side.

## Phases at a Glance

| Phase                   | What it delivers                                                         | Key risk                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| 1. Channel profile CRUD | Upsert API route (JSON), dynamic-row form, profile dialog, Topbar wiring | First fetch-based form + first dialog in this codebase — worth careful manual verification of the non-navigating save flow |

**Prerequisites:** `channel-profile-data-model` implemented (it is — `channel_profiles` exists with RLS).
**Estimated effort:** ~1 session, single phase.

## Open Risks & Assumptions

- ~~Deliberately diverges from the PRD/roadmap's literal "3–5" competitor range (min-3/no-max instead).~~ **Resolved 2026-09-12:** decision D1 retired that deviation; the 3–5 bound is now enforced on both client and server, so this slice conforms to PRD FR-003.
- `zod` is a dependency but unused elsewhere in this codebase — this is its first real usage here.

## Success Criteria (Summary)

- A user can create and later edit their channel profile via the dialog, with changes persisting and pre-filling correctly, no page reload on save.
- Fewer than 3 competitor IDs, or a duplicate ID, is rejected with a visible error inside the dialog rather than silently accepted.
- The dashboard's nav trigger correctly reflects profile existence, updating live after the first save.
