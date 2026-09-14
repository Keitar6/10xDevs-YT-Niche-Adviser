# Landing and Auth Shell (S-04) — Plan Brief

> Full plan: `context/changes/landing-and-auth-shell/plan.md`
> Research: `context/changes/landing-and-auth-shell/research.md`

## What & Why

The app still introduces itself as "10x Astro Starter" — a visitor on `/` learns nothing about competitor curation or opportunity ranking (FR-013). Separately, auth is the last part of the app that navigates away: sign-in and sign-up are standalone routes built on native form POSTs whose errors travel back as `?error=` in the URL, while the rest of the app moved to in-page dialogs during S-01 (FR-014). Both requirements land in the same two files, which is why the roadmap keeps them in one slice.

## Starting Point

Four visible starter strings live in `Welcome.astro` plus the default title in `Layout.astro:11`; the `<head>` has no description and no social tags at all. All four auth API routes answer with `302` + `?error=`, read once at SSR by the auth pages. `Topbar.astro` is imported per-page rather than living in the layout, and each page separately owns its `bg-cosmic` ground. There is no return-path plumbing anywhere — `middleware.ts:20` forgets where the user was headed, and the OAuth `origin` param exists only to pick an error page.

## Desired End State

A visitor on `/` reads what the product does — curate 3–5 competitors, get a ranked list of content opportunities scored against each channel's own median. Clicking Sign in anywhere opens a dialog on the current page; email/password sign-in and sign-up both complete without navigating, and sign-up swaps to a "check your email" state in place. A signed-out user sent to `/dashboard` is returned there after signing in. `Layout.astro` owns the cosmic ground and the top bar, so there is exactly one shell definition.

## Key Decisions Made

| Decision                      | Choice                                                  | Why (1 sentence)                                                                                                                | Source   |
| ----------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Fate of `/auth/*` routes      | Redirect shims to `/?auth=signin\|signup`               | Bookmarks and the middleware guard keep working while only one auth idiom survives.                                             | Plan     |
| Auth API response shape       | JSON via `jsonError`, zod-validated                     | A dialog has no SSR read point for `?error=`; mirrors the proven `/api/profile` contract and fixes a CLAUDE.md violation.       | Plan     |
| Sign-out                      | Stays a bare form POST                                  | A one-click action that already works, needs no JS, and has no error state worth a dialog — FR-014 knowingly left partly unmet. | Plan     |
| Post-signup                   | In-dialog "check your email" state                      | Keeps the whole flow on the current page; `confirm-email.astro` becomes dead code and is deleted.                               | Plan     |
| Shell centralization          | `Layout` owns ground + topbar + slot                    | One shell definition; no page can forget the ground or the auth entry point.                                                    | Plan     |
| Metadata scope                | Description + `og:*` + `twitter:*` + OG image           | The head is empty today, so sharing a link currently previews as nothing.                                                       | Plan     |
| Copy language                 | English                                                 | The codebase is uniformly English; the lone Polish outlier in `config-status.ts` gets translated.                               | Plan     |
| Starter cleanup               | README, `template.png`, `LibBadge`, `config-status` URL | The `config-status` link is user-visible at runtime, so it is a real bug rather than cosmetics.                                 | Plan     |
| Shell re-render after sign-in | Full navigation (`next` or reload)                      | `Topbar` reads `Astro.locals.user` server-side; anything cleverer duplicates auth state on the client.                          | Research |
| OAuth `origin` replacement    | Validated `next` relative path                          | The param only ever routed errors; a return path closes the gap the research found missing everywhere.                          | Research |
| Google `access_denied` gap    | Closed here                                             | S-04 rewrites exactly that error surface, so closing F-01's skipped finding F1 is cheap now and awkward later.                  | Research |

## Scope

**In scope:** landing copy + feature cards; document/social metadata + OG image; JSON auth contract with zod; `next` return-path plumbing across middleware, OAuth start, and callback; the auth dialog with Google, mode switching, and in-dialog confirmation; shell centralization into `Layout`; auth routes demoted to shims; starter residue cleanup.

**Out of scope:** sign-out in a dialog; any restyling of the cosmic theme; an i18n layer; component or route tests; `PUBLIC_SITE_URL`; any data-layer, migration, or new-secret work; a shared form hook.

## Architecture / Approach

Mechanically this is a migration of the page-level auth idiom (native POST → redirect → `?error=`) onto the dialog-level idiom already proven by the profile feature (fetch → JSON → `jsonError` → React state). Three cross-cutting mechanisms are introduced in Phase 1 and consumed by the rest: `?auth=signin|signup` opens the dialog on load, `?auth_error=<msg>` is the replacement read point for the removed `?error=` channel (and is how OAuth failures — which cannot stay in a dialog — surface in one), and `next=<relative path>` is the validated return path. Astro CTAs reach the React dialog through one delegated `[data-auth-open]` click listener, avoiding duplicated dialog state.

## Phases at a Glance

| Phase                   | What it delivers                                                                               | Key risk                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1. JSON auth contract   | Routes + forms flip to fetch/JSON atomically; `next` plumbing; `access_denied` fixed           | Auth regression — the whole slice's risk is concentrated here       |
| 2. Auth dialog          | `AuthDialog` mounted in `Topbar`; Google TSX button; URL-param + `data-auth-open` entry points | Radix/React-19 form-action trap; dialog aborting an in-flight fetch |
| 3. Centralize the shell | `Layout` owns ground + topbar; auth pages become shims; dead files deleted                     | Gradient seam or double top bar; deletes the fallback pages         |
| 4. Content + cleanup    | Landing copy, metadata, OG image, starter residue removed                                      | None behavioral — OG image is the only produced asset               |

**Prerequisites:** none technical. Roadmap sequences S-04 after S-03 by scope decision, not dependency.
**Estimated effort:** ~3-4 sessions, one per phase; Phase 1 is the longest, Phase 4 the shortest.

## Open Risks & Assumptions

- `next` is an open-redirect surface threaded through Supabase's OAuth `redirectTo`; it must be validated at **every** read point, not just where it is set. This is the one security control in the slice and the only thing getting a unit test.
- Phase 1 changes routes and forms together on purpose — splitting them would leave auth broken between phases.
- The OG image is produced by capturing the new hero at 1200×630 rather than hand-authoring an asset; if that capture is impractical the social card ships bare until one is supplied.
- FR-014 is deliberately only partly met (sign-out). This must be recorded in `change.md` as a deviation so `/10x-impl-review` does not flag it as drift.

## Success Criteria (Summary)

- A visitor who has never seen the product can read `/` and say what it does; sharing the link produces a real social card.
- Sign in, sign up, sign out, Google sign-in, Google denial, and a protected-route bounce all complete from `/` with no dead end and no page-level auth form left in the codebase.
- `npm run lint`, `npm run build`, and `npm run test` pass, and `grep -ri "10x astro starter" src public README.md` returns nothing.
