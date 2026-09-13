---
change_id: landing-and-auth-shell
title: Landing and auth shell
status: impl_reviewed
created: 2026-09-13
updated: 2026-09-13
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

### Deviation: FR-014 partially met (decided during `/10x-plan`, 2026-09-13)

Sign-out **stays** the bare `form method="POST"` at `Topbar.astro:30-34` rather than moving into a
dialog. FR-014 names `wylogowuje`, so the requirement is knowingly left partly unmet: it is a
one-click action that already works, needs no JS, and has no error state worth a dialog.

Recorded here so `/10x-impl-review` reads it as an accepted decision, not as drift from the plan.

### Deviations during `/10x-implement` (2026-09-13)

Recorded so `/10x-impl-review` reads these as decisions, not drift.

1. **`onSuccess` could not be a prop from Astro (P1).** The plan had `/auth/{signin,signup}.astro`
   "pass an `onSuccess` that navigates", but Astro serializes island props as JSON — a function
   cannot cross the boundary. Chosen (user-approved): make `onSuccess` optional with a navigating
   fallback for P1, then make it required again in P3 once the pages became shims and the dialog
   was the only caller.
2. **`safe-next.ts` exports two functions, not one.** `authErrorUrl(next, message)` joined
   `safeNextPath` rather than being copy-pasted into both `google.ts` and `callback.ts`. Same
   module concern (building the return URL); unit-tested alongside its sibling.
3. **The auth shims are `.ts` endpoints, not `.astro` pages (P3).** A top-level `return` in Astro
   frontmatter crashes ESLint (`@typescript-eslint/no-misused-promises`: "Expected node to have a
   parent"). `src/pages/auth/{signin,signup}.ts` exporting `GET` redirects identically and lints.
4. **`GoogleSignInButton.astro` switched `origin` → `next` in P1**, not P2. Once `google.ts` stopped
   reading `origin`, leaving the hidden input in place would have posted a field nothing consumed.
   The file was deleted in P3 as planned.
5. **`config-status.ts` needed no translation.** The plan called `:15-17` "the only Polish copy in
   the codebase"; the message was already English. Only the `docsUrl` — which pointed a live,
   user-visible banner at `przeprogramowani/10x-astro-starter` — was repointed.
6. **`public/og.png` was generated, not screenshotted.** The plan said to capture the hero at
   1200×630 against the dev server; no headless browser is installed. Built instead from an SVG
   rendered through `sharp` (already a dependency), reusing the real `bg-cosmic` gradient, orb, and
   glass-card values. Generator script was temporary and is not committed.
7. **One `eslint-disable` in `AuthDialog.tsx`.** `react-hooks/set-state-in-effect` forbids the
   one-shot sync that reads and strips `?auth=` / `?auth_error=` / `?next=` at mount. State was
   collapsed into a single object so exactly one call needed the exception; the justification sits
   above the effect. This is the repo's first `eslint-disable`.
8. **Topbar keeps a "Sign up" entry point.** The plan replaced both anonymous links with the dialog
   alone, which would have dropped the sign-up affordance. It is now a `data-auth-open="signup"`
   button picked up by the delegated listener the plan itself designed — no extra state.
9. **`Layout.astro` also emits `<link rel="canonical">` and `og:site_name`.** Not named in the
   Phase 4 metadata contract, which listed `description`, `og:title`, `og:description`, `og:type`,
   `og:image`, `og:url`, and `twitter:card` + `twitter:*`. Accepted as a natural extension of the
   same metadata task, flagged by `/10x-impl-review` (F1, 2026-09-13).

### Follow-up after first manual look (2026-09-13)

9. **Hero CTAs were dead for signed-in visitors — bug introduced by this slice.** `AuthDialog` owns
   the `[data-auth-open]` listener and renders only in the anonymous branch of `Topbar.astro`, so
   signed in, nothing listened and both hero buttons did nothing. Phase 4 had assumed `/` only ever
   has anonymous visitors. Fixed by branching the hero on state (user's call): signed out keeps
   Get started / Sign in; signed in without a profile gets "Set up your channel profile"
   (`data-profile-open`, a new delegated listener on `ProfileDialog` mirroring the auth one) plus
   "Go to dashboard"; signed in with a profile gets "Go to dashboard" alone. A *failed* profile
   read is deliberately not treated as "no profile" — those users are sent to the dashboard rather
   than told to create one they may already have.
   - **`loadChannelProfile` lives in a new `channel-profile-server.ts`.** Putting it beside
     `parseChannelProfile` broke the client build: `channel-profile.ts` is imported by
     `ChannelProfileForm.tsx`, so `createClient` pulled `astro:env/server` into the browser bundle.
     `Topbar.astro` now shares the loader, so the query is written once.
   - **Cost accepted:** `/` runs that profile query twice for a signed-in user (Topbar + Welcome).
     Both are indexed single-row reads; resolving the profile onto `Astro.locals` in middleware
     would fix it but adds a query to every route including `/api/*`.
   - **Creating a profile reloads the page once, on dialog close.** The hero is server-rendered, so
     React state cannot update it. Reloading on close rather than on save keeps the in-dialog
     success banner visible; `if (!profile)` reads the pre-save value, so edits do not reload.
