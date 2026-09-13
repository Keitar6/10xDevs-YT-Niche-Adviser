---
change_id: landing-and-auth-shell
title: Landing and auth shell
status: implementing
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
