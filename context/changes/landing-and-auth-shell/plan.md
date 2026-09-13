# Landing and Auth Shell (S-04) — Implementation Plan

> Change ID: `landing-and-auth-shell` · PRD FR-013 + FR-014 · Roadmap S-04
> Research: `context/changes/landing-and-auth-shell/research.md`

## Overview

The app still introduces itself as "10x Astro Starter". `Welcome.astro:35` advertises a template, `Layout.astro:11` titles every page after it, and the three feature cards describe ESLint and "Astro 5" (the repo is on Astro 6) rather than the product. A visitor landing on `/` learns nothing about competitor curation or opportunity ranking — FR-013.

Separately, auth is the last part of the app that still navigates away. `ProfileDialog` established the in-page dialog pattern during S-01, but sign-in and sign-up remain standalone routes built on native form POSTs whose errors travel back as `?error=` in the URL. FR-014 asks for auth to happen in a dialog on the current page, consistent with that profile dialog.

The two requirements land in the same two files (`Topbar.astro`, `Welcome.astro`), which is why the roadmap keeps them in one slice. The outcome: a landing page that explains the product, and an auth dialog that never leaves the page — with the shell (cosmic ground + top bar) centralized in `Layout.astro` so there is one definition of it.

**Deferred by explicit decision:** sign-out stays the bare `form method="POST"` at `Topbar.astro:30-34`. FR-014 names `wylogowuje`, so the requirement is knowingly left partly unmet — a one-click action that already works, needs no JS, and has no error state worth a dialog. Record this in `change.md` as a deviation.

## Current State Analysis

- **Auth submission is native, not fetch.** `SignInForm.tsx:43` / `SignUpForm.tsx:66` are `<form method="POST" action="/api/auth/...">`; `onSubmit` only calls `preventDefault()` when client validation fails. Inside a Radix dialog a native submit navigates and destroys the dialog.
- **Error state lives in the URL.** Every failure in `signin.ts`, `signup.ts`, `google.ts`, `callback.ts` does `redirect(".../auth/X?error=" + encodeURIComponent(...))`, read once at SSR (`signin.astro:6`). A dialog on an arbitrary page has no such read point.
- **No zod on the auth routes.** `signin.ts:5-7` and `signup.ts:5-7` read `formData` and cast to `string`, violating the CLAUDE.md "validate input with zod" rule that `/api/profile` follows.
- **No return-path plumbing exists anywhere.** `callback.ts:26`, `signin.ts:19`, `signout.ts:9` all hardcode `/`; `middleware.ts:20` redirects to `/auth/signin` with no memory of the requested page.
- **The OAuth `origin` param is error-routing only.** `google.ts:4` / `callback.ts:4` allowlist `"signin" | "signup"` purely to pick an error page; `callback.ts:26` ignores it on success.
- **Google's own denial is swallowed.** `callback.ts:11-13` checks for `code` first, so `?error=access_denied&error_description=...` falls through to "Missing OAuth code" (F-01 impl-review finding **F1**, consciously skipped then).
- **`Topbar.astro` is not in `Layout.astro`.** It is imported by `Welcome.astro:2,28` and `dashboard.astro:3,11` only; the `/auth/*` pages render without it. Each page separately owns its `bg-cosmic` ground.
- **`<head>` is empty.** `Layout.astro:16-21` has charset, viewport, favicon, title — no description, no `og:*`, no `twitter:*`, no OG image in `public/`.

### Key Discoveries

- **The target pattern is already proven in-repo.** `ProfileDialog.tsx:24-30` (self-contained `useState`, `DialogTrigger asChild`, glass `DialogContent`) + `ChannelProfileForm.tsx:61-93` (preventDefault → fetch JSON → `catch` arm → inline banner, no auto-close).
- **Leaf components are already generic and already shared.** `FormField`, `SubmitButton`, `ServerError` live in `src/components/auth/` but are imported by the profile form too. `SubmitButton.tsx:14` (`pendingProp ?? formPending`) is already fetch-ready — the caller just passes `pending` explicitly, as `ChannelProfileForm.tsx:186` does.
- **`jsonError` already exists** (`src/lib/http.ts`) and is the contract `/api/profile` returns. The auth routes adopt it verbatim.
- **Radix + React 19 form actions are a known trap here** (S-01, `channel-profile-crud/plan.md:29-31`): never `<form action={fn}>` inside a dialog — the dismissable-layer outside-click detection aborts the in-flight action. Use `onSubmit` + `preventDefault` + `fetch`.
- **Send JSON, not `FormData`** (`channel-profile-crud/plan.md:32`): a browser extension was observed clobbering the global `FormData` constructor at runtime.
- **Binding S-01 review findings:** **F2** every fetch form needs a real `catch` setting a readable error; **F3** every route parsing a body must guard it and return `jsonError` rather than throwing an HTML 500 that makes `res.json()` blow up client-side; **F5** disclose unplanned global CSS edits; **F8** every `/api/*` route self-guards `locals.user`.
- **Test convention is pure-logic only** — `src/lib/services/youtube-ids.test.ts`, `scoring.test.ts` under vitest. No component or route tests exist; don't invent a harness.
- **Toast convention:** inline success banners, toasts reserved for async failures (`AnalyzePanel.tsx:63` is the only caller; `toast.success` is never used).

## Desired End State

A visitor on `/` reads what the product does — curate 3–5 competitors, get a ranked list of content opportunities with an outlier score and a one-line justification — on the existing cosmic theme. Sharing the link produces a real social card.

Clicking Sign in anywhere (top bar or hero CTA) opens a dialog on the current page. Email/password sign-in and sign-up both complete without navigating; sign-up swaps the dialog to a "check your email" state in place. Google remains a full-page redirect (unavoidable) but returns the user to where they started. A signed-out user sent to `/dashboard` is returned there after signing in, instead of being dropped on `/`.

`/auth/signin` and `/auth/signup` still resolve — as redirect shims to `/?auth=signin|signup`, which opens the dialog on load — so bookmarks and the middleware guard keep working. `Layout.astro` owns the cosmic ground and the top bar, so there is exactly one shell definition and one place the auth dialog is mounted.

**Verify:** sign in, sign up, sign out, Google sign-in, Google denial, and a protected-route bounce all complete from `/` without a dead end; `npm run lint`, `npm run build`, `npm run test` pass; `grep -ri "10x astro starter\|template.png" src public README.md` returns nothing.

## What We're NOT Doing

- **Not moving sign-out into a dialog.** Explicit decision; FR-014 stays partly unmet and is recorded as a deviation in `change.md`.
- **Not restyling the shell.** `bg-cosmic`, glass cards, and the blue→purple gradient stay exactly as they are (roadmap S-04 Rozstrzygnięcia, 2026-09-13). Copy and structure change; the design vocabulary does not.
- **Not adding an i18n layer.** All new copy is English, matching every existing string; the lone Polish outlier at `config-status.ts:15-17` gets translated as part of cleanup.
- **Not adding component or route tests.** The repo tests pure service logic only; the one new pure function gets a unit test and nothing else does.
- **Not introducing `PUBLIC_SITE_URL`.** `context.url.origin` stays the source of the OAuth `redirectTo`, per the deliberate F-01 decision (`context/archive/2026-09-08-google-oauth-login/plan.md:35,42`).
- **Not touching `/api/analyze`, `/api/profile`, or any data-layer code.** Zero migrations, zero new secrets, zero new integrations.
- **Not building a shared form hook.** `src/components/hooks/` stays empty; the two auth forms keep their own local validation, matching `ChannelProfileForm`.

## Implementation Approach

The slice is, mechanically, a migration of the page-level auth idiom (native POST → redirect → `?error=`) onto the dialog-level idiom already proven by the profile feature (fetch → JSON → `jsonError` → React state). It runs in four phases, each of which leaves the app fully working:

1. **Flip the protocol atomically.** Routes and forms change together, while the existing `/auth/*` pages stay as hosts. Nothing about the UI moves yet — only the mechanism. This is the phase that carries the auth-regression risk, and isolating it means the dialog work lands on a known-good JSON contract.
2. **Build the dialog** and mount it in the existing `Topbar`. Both surfaces (pages and dialog) work simultaneously, so the dialog can be exercised before anything is deleted.
3. **Centralize the shell** and demote the auth pages to redirect shims. This is the only irreversible-feeling step, and by now the dialog is already proven.
4. **Content and cleanup** — pure copy, metadata, and starter residue, with no behavioral risk.

Three cross-cutting mechanisms are introduced in Phase 1 and consumed by the rest:

- **`?auth=signin|signup`** on any page opens the dialog in that mode on load.
- **`?auth_error=<message>`** opens the dialog and shows the message — this is the replacement read point for the `?error=` channel being removed, and it is what makes Google OAuth failures (which cannot stay in a dialog) surface in one.
- **`next=<relative path>`** is the new return-path parameter, replacing the OAuth `origin` param's error-routing role and closing the gap where `middleware.ts:20` forgot where the user was headed.

## Critical Implementation Details

**`next` is an open-redirect surface.** It arrives from the query string, is threaded through Supabase's OAuth `redirectTo`, and comes back on `callback`. It must be validated at every read point, not just where it is set: accept only a value beginning with a single `/` that is not `//` or `/\` (protocol-relative and backslash-scheme forms both navigate off-origin in browsers), rejecting anything else to `/`. F-01 impl-review finding **F4** already noted that `redirectTo` reflects the incoming `Host` header on Workers; that is safe only because Google honors pre-registered URIs, and it is precisely why the app-side `next` must not become a second, unguarded redirect. Put this in one exported pure function and unit-test it — it is the only piece of this slice that is a security control rather than UI.

**Order of checks in `callback.ts` is currently wrong and must be inverted.** Google returns `?error=access_denied&error_description=...` with **no** `code`, so today's `if (!code)` at `:11` fires first and reports "Missing OAuth code" for what is actually a user declining consent. Read `error`/`error_description` *before* checking for `code`.

**Session refresh after in-dialog sign-in requires a navigation.** `Topbar` reads `Astro.locals.user` server-side, so the `Set-Cookie` from a fetch-based sign-in lands but nothing re-renders the shell. A full `window.location` navigation is the honest answer; anything cleverer duplicates auth state on the client. Navigate to the validated `next` when present, otherwise reload the current URL — which is what makes FR-014's "w obrębie bieżącej strony" true for the common case.

**Astro CTAs cannot call into a React island.** The hero buttons in `Welcome.astro` must open the dialog that lives in `Topbar`. Rather than duplicating dialog state or forcing a same-page navigation, the dialog island registers one delegated `click` listener on `document` matching `[data-auth-open]` and reads the mode from the attribute. Any Astro markup then opts in with `data-auth-open="signup"` and no inline script. Remove the listener on unmount.

**Strip the auth query params after consuming them.** Once `?auth=` / `?auth_error=` have opened the dialog, `history.replaceState` them away — otherwise a refresh or a back-navigation silently reopens the dialog, and the error message outlives the failure that caused it.

---

## Phase 1: JSON auth contract and return-path plumbing

### Overview

Convert the four auth API routes from `302 + ?error=` to JSON responses with zod-validated input, convert both forms from native POST to fetch, and introduce the validated `next` return path. The `/auth/*` pages remain the hosts, so at the end of this phase the app behaves as it does today — only the mechanism has changed.

### Changes Required

#### 1. Return-path guard

**File**: `src/lib/services/safe-next.ts` (new)

**Intent**: One exported pure function that turns an untrusted `next` query value into a safe same-origin relative path, so every read point shares a single guard rather than re-deriving one. This is the security control of the slice.

**Contract**: `safeNextPath(value: unknown, fallback = "/"): string`. Returns `value` only when it is a string starting with `/` and not starting with `//` or `/\`; returns `fallback` otherwise. Reject, do not sanitize — a value that fails is replaced wholesale.

#### 2. Sign-in and sign-up routes

**Files**: `src/pages/api/auth/signin.ts`, `src/pages/api/auth/signup.ts`

**Intent**: Answer with JSON instead of redirects so a dialog can read the outcome, and validate the body with zod as CLAUDE.md requires and `/api/profile` already does. This removes the `?error=` channel at its source.

**Contract**: `POST` accepts a JSON body `{ email: string, password: string }`, guarding `request.json()` in a try/catch that returns `jsonError("Invalid JSON body", 400)` per finding **F3**. Validation failures return `jsonError(firstIssueMessage, 400)`, mirroring `api/profile.ts:48-50`. Supabase errors return `jsonError(error.message, 400)`; an unconfigured client returns `jsonError("Supabase is not configured", 500)`. Success returns `200` with `{ ok: true }` from signin, and `{ ok: true, needsConfirmation: boolean }` from signup — `needsConfirmation` derived from whether Supabase returned a session (local dev auto-confirms), replacing the unconditional `redirect("/auth/confirm-email")` at `signup.ts:19`. Keep the sign-up password minimum aligned with `SignUpForm.tsx:8` (`MIN_PASSWORD_LENGTH = 6`) so client and server agree.

#### 3. Google OAuth start

**File**: `src/pages/api/auth/google.ts`

**Intent**: Replace the `origin` allowlist — which only ever picked an error page — with the `next` return path, so a redirect that leaves the app comes back where it started. Errors must now land on a page that can reopen the dialog.

**Contract**: Reads `next` from the posted form data through `safeNextPath`. `redirectTo` becomes `${context.url.origin}/api/auth/callback?next=${encodeURIComponent(next)}`; `queryParams: { prompt: "select_account" }` stays — it is load-bearing, without it Google's SSO cookie silently re-authenticates the same account after our sign-out (`context/archive/2026-09-08-google-oauth-login/change.md:15`). Failures redirect to `${next}?auth_error=<encoded message>` instead of `/auth/${origin}?error=`. Delete `ALLOWED_ORIGINS`.

#### 4. OAuth callback

**File**: `src/pages/api/auth/callback.ts`

**Intent**: Honor the return path on success, and surface Google's own denial — closing F-01 impl-review finding **F1**, which was skipped then and is cheap to close now that this exact surface is being rewritten.

**Contract**: Reads `next` via `safeNextPath`. **Check `error` / `error_description` from the query string before checking for `code`** — this ordering is the whole fix; the current `if (!code)` at `:11` intercepts denials and mislabels them. Map `access_denied` to a plain "Sign-in was cancelled" and fall back to `error_description` for anything else. All failure paths redirect to `${next}?auth_error=<encoded message>`. Success redirects to `next` rather than the hardcoded `/` at `:26`. Delete `ALLOWED_ORIGINS`.

#### 5. Middleware return path

**File**: `src/middleware.ts`

**Intent**: Remember where the user was headed when bouncing them to sign in — the gap the research flagged as absent everywhere in the codebase.

**Contract**: The `PROTECTED_ROUTES` guard at `:18-22` redirects to `/?auth=signin&next=<encoded pathname + search>` instead of `/auth/signin`. `PROTECTED_ROUTES` itself and the `locals.user` resolution are unchanged.

#### 6. Forms submit by fetch

**Files**: `src/components/auth/SignInForm.tsx`, `src/components/auth/SignUpForm.tsx`

**Intent**: Stop relying on native navigation so the same components work unchanged inside a dialog, mirroring the submit contract `ChannelProfileForm` already uses.

**Contract**: Drop `method`/`action` from the `<form>`; `onSubmit` always calls `preventDefault()`, runs the existing local `validate()`, then fetches its route with a JSON body and `Content-Type: application/json`. Follow `ChannelProfileForm.tsx:61-93` exactly, including the `catch` arm setting a readable connection error (finding **F2**) and the `finally` clearing the pending flag. Pass the pending flag explicitly to `SubmitButton`'s `pending` prop — it already wins over `useFormStatus` at `SubmitButton.tsx:14`. Replace the `serverError` prop with local error state seeded by an optional `initialError` prop. Add an `onSuccess` callback prop: `SignInForm` calls it on `{ ok: true }`; `SignUpForm` calls it with `needsConfirmation` so the caller can decide what to show. **Never use `<form action={fn}>`** — Radix + React 19 breaks it inside a dialog.

#### 7. Auth pages pass the new props

**Files**: `src/pages/auth/signin.astro`, `src/pages/auth/signup.astro`

**Intent**: Keep the existing pages working against the new fetch contract during this phase, so nothing is broken between phases. These pages are demoted to shims in Phase 3.

**Contract**: Read `auth_error` (not `error`) into `initialError`, and pass an `onSuccess` that navigates — preserving today's destinations (`/` for sign-in, the confirm-email message for sign-up) until the dialog takes over.

### Success Criteria

#### Automated Verification

- `safeNextPath` unit tests pass, covering `/dashboard`, `//evil.com`, `/\evil.com`, `https://evil.com`, `""`, and non-string input: `npm run test`
- Type checking and lint pass: `npm run lint`
- Production build succeeds: `npm run build`
- No auth route redirects with `?error=` any more: `grep -rn "error=" src/pages/api/auth/` returns only `auth_error=`
- No auth form declares a native action: `grep -n "method=\"POST\"" src/components/auth/` returns only `GoogleSignInButton.astro`

#### Manual Verification

- Sign in with valid credentials from `/auth/signin` — lands signed in, top bar shows the email
- Sign in with a wrong password — inline error appears, page does not navigate, URL stays clean
- Sign up with a new email — reaches the confirm-email message; sign up with an existing email shows an inline error
- Google sign-in completes and returns to the app signed in
- **Deny consent on Google's screen** — a readable "Sign-in was cancelled" appears, not "Missing OAuth code"
- Visit `/dashboard` signed out — bounced to `/?auth=signin&next=%2Fdashboard`
- Stop the dev server mid-submit — the connection error from the `catch` arm renders instead of a blank form

**Implementation Note**: Pause here for manual confirmation before Phase 2. This phase carries the auth-regression risk; everything after it is additive.

---

## Phase 2: Auth dialog

### Overview

Build the dialog that hosts the two forms, mount it in the existing `Topbar`, and wire the three entry points: the top-bar trigger, `?auth=` / `?auth_error=` on load, and `[data-auth-open]` elements anywhere on the page. Both the pages and the dialog work at the end of this phase.

### Changes Required

#### 1. The dialog

**File**: `src/components/auth/AuthDialog.tsx` (new)

**Intent**: The auth counterpart to `ProfileDialog` — self-contained open state, mode switching between sign-in and sign-up, and the in-dialog confirmation state that replaces the `/auth/confirm-email` navigation.

**Contract**: Follows `ProfileDialog.tsx:24-30` — local `useState` for `open`, `<Dialog open onOpenChange>`, `DialogTrigger asChild` wrapping a plain button, and the same glass `DialogContent` recipe (`border-white/10 bg-white/10 text-white backdrop-blur-xl`). Holds `mode: "signin" | "signup" | "confirm"` and an `initialError` string. Renders `GoogleSignInButton` + the existing "or" divider + the matching form, reusing the markup currently inlined at `signin.astro:17-26`. The cross-link at the bottom switches `mode` in place instead of navigating. On sign-in success, navigate to the validated `next` or reload the current URL. On sign-up success, switch to `"confirm"` when `needsConfirmation`, otherwise treat it as signed in — do **not** auto-close, matching the profile dialog's no-auto-close behavior. Accepts a `next` prop supplied server-side by `Topbar`.

**Opening from outside**: a `useEffect` reads `?auth=` / `?auth_error=` from `window.location.search` on mount, opens accordingly, then strips both params with `history.replaceState`. A second `useEffect` registers one delegated `document` click listener matching `[data-auth-open]`, reads the mode from the attribute value, opens the dialog, and calls `preventDefault()`; it is removed on unmount.

#### 2. Google button as a React component

**File**: `src/components/auth/GoogleSignInButton.tsx` (new)

**Intent**: An `.astro` component cannot render inside a React island, so the existing button needs a TSX twin. It stays a real form POST — the redirect to Google's consent screen is unavoidable, so native submission is correct here even inside a dialog.

**Contract**: Same markup and inline SVG as `GoogleSignInButton.astro`, with the hidden `origin` input replaced by a hidden `next` input. `<form method="POST" action="/api/auth/google">` with no JS — this is the one form in the slice that should navigate.

#### 3. Mount point

**File**: `src/components/Topbar.astro`

**Intent**: Replace the two anonymous-branch links with the dialog trigger, so the top bar is the single auth entry point.

**Contract**: The anonymous branch (`:38-48`) renders `<AuthDialog next={...} client:load />` in place of the `/auth/signin` and `/auth/signup` anchors, passing the current path so a sign-in from a deep page returns there. `client:load` matches every other island in the repo — there are no other hydration directives in the codebase. The authenticated branch, including the sign-out form at `:30-34` and the existing `ProfileDialog` at `:29`, is untouched.

### Success Criteria

#### Automated Verification

- Lint and build pass: `npm run lint && npm run build`
- Unit tests still pass: `npm run test`
- The dialog is the only anonymous auth entry point in the top bar: `grep -n "/auth/sign" src/components/Topbar.astro` returns nothing

#### Manual Verification

- Top-bar "Sign in" opens the dialog; ESC, overlay click, and the corner X all close it (Radix supplies these)
- Switching between Sign in and Sign up inside the dialog does not navigate and does not lose the dialog
- Sign in from the dialog on `/` — the top bar re-renders signed in, still on `/`
- Sign up from the dialog — the dialog swaps to "check your email" in place
- Google from inside the dialog redirects out and returns to the originating page signed in
- Visiting `/?auth=signup` opens the dialog on the sign-up panel, and the URL is clean afterwards
- Visiting `/?auth_error=Something%20went%20wrong` opens the dialog showing that message
- Refreshing after either of the above does **not** reopen the dialog

**Implementation Note**: Pause here for manual confirmation before Phase 3 — Phase 3 deletes the fallback pages, so the dialog must be proven first.

---

## Phase 3: Centralize the shell

### Overview

Move the cosmic ground and the top bar into `Layout.astro`, demote the auth pages to redirect shims, and delete what that makes dead. This is the phase that makes the auth dialog reachable from every page by construction.

### Changes Required

#### 1. Layout owns the shell

**File**: `src/layouts/Layout.astro`

**Intent**: One definition of the page ground and the top bar, so no page can forget either and the auth dialog is mounted exactly once.

**Contract**: Renders `bg-cosmic` as the page ground wrapping `<Topbar />` and `<slot />`. Adds a `topbar?: boolean` prop (default `true`) for any future page that wants the bare ground. Existing `Banner`/`missingConfigs` rendering and the `client:only="react"` `Toaster` at `:45` stay exactly as they are — the SSR-invalid-hook comment at `:41-44` explains why and must survive.

#### 2. Pages shed their wrappers

**Files**: `src/components/Welcome.astro`, `src/pages/dashboard.astro`

**Intent**: Stop each page owning the ground now that the layout does, and stop importing `Topbar` individually.

**Contract**: Both drop their `bg-cosmic` wrapper and their `Topbar` import and usage (`Welcome.astro:2,5,28`; `dashboard.astro:3,10,11`). `Welcome.astro` keeps its decorative orbs and star field (`:6-25`) as an absolutely-positioned layer scoped to the landing page only — they are landing decoration, not shell. Verify no double top bar and no gradient seam where the layout ground meets page content.

#### 3. Auth pages become shims

**Files**: `src/pages/auth/signin.astro`, `src/pages/auth/signup.astro`

**Intent**: Keep the paths resolving for bookmarks and any stale link while removing the second auth idiom entirely.

**Contract**: Each reduces to a server-side `Astro.redirect("/?auth=signin")` / `("/?auth=signup")`, forwarding a `next` query param through `safeNextPath` if present. No layout, no form, no island.

#### 4. Delete what is now dead

**Files**: `src/pages/auth/confirm-email.astro`, `src/components/auth/GoogleSignInButton.astro`

**Intent**: The confirmation message now lives in the dialog's `"confirm"` mode, and the Google button now has a TSX implementation. Neither file has a remaining caller.

**Contract**: Delete both. Confirm with `grep -rn "confirm-email\|GoogleSignInButton.astro" src/` returning nothing.

### Success Criteria

#### Automated Verification

- Lint, build, and tests pass: `npm run lint && npm run build && npm run test`
- No page mounts `Topbar` directly: `grep -rn "Topbar" src/pages src/components/Welcome.astro` returns nothing
- No dangling references to deleted files: `grep -rn "confirm-email\|GoogleSignInButton.astro" src/` returns nothing
- Only the layout paints the ground: `grep -rn "bg-cosmic" src/` returns just `Layout.astro` and `global.css`

#### Manual Verification

- `/` and `/dashboard` both show exactly one top bar, on an unbroken cosmic ground with no seam or scroll mismatch
- `/auth/signin` and `/auth/signup` redirect to `/` with the dialog open on the right panel
- Signed out, visiting `/dashboard` bounces to `/` with the dialog open; signing in **lands on `/dashboard`**, not `/`
- Sign out still works from the top bar (unchanged bare form POST) and returns to `/`
- The `missingConfigs` banner still renders above the shell when a secret is absent

**Implementation Note**: Pause here for manual confirmation before Phase 4.

---

## Phase 4: Landing content, metadata, and starter cleanup

### Overview

Replace the starter copy with product copy, give the app real social metadata, and remove the remaining starter residue. No behavioral risk — pure content.

### Changes Required

#### 1. Landing copy

**File**: `src/components/Welcome.astro`

**Intent**: Say what the product does. English, matching every existing string in the app.

**Contract**: H1 (`:35`) and subcopy (`:37-39`) describe the core loop — curate 3–5 competitor channels, get a ranked list of content opportunities scored against each channel's own median, each with a one-line justification. The three feature cards (`:74-77`, `:97-100`, `:119-122`) replace "Authentication Ready" / "Modern Stack" / "Developer Experience" with the product's three beats: curated competitors, outlier scoring, saved opportunities. Hero CTAs (`:42,48`) drop their `href="/auth/..."` and become buttons carrying `data-auth-open="signin"` / `"signup"`, picked up by the delegated listener from Phase 2. Keep the existing type scale, gradient heading, and glass card classes — restyling is out of scope.

#### 2. Document metadata

**File**: `src/layouts/Layout.astro`

**Intent**: The `<head>` has no description and no social tags at all, so a shared link currently previews as nothing.

**Contract**: Default `title` (`:11`) changes from `"10x Astro Starter"` to the product name. Add a `description?: string` prop with a product default, emitted as `<meta name="description">`, plus `og:title`, `og:description`, `og:type`, `og:image`, `og:url` (from `Astro.url`) and `twitter:card` (`summary_large_image`) with matching `twitter:*` tags.

#### 3. Social image

**File**: `public/og.png` (new)

**Intent**: Without an image the social card renders bare, which reads as unfinished.

**Contract**: A 1200×630 PNG on the cosmic theme carrying the product name and the one-line value statement. Produce it by loading the new hero at a 1200×630 viewport against the dev server and capturing it, rather than hand-authoring an asset — the hero already is the value statement on the right background. Referenced as `/og.png` from the `og:image` and `twitter:image` tags.

#### 4. Runtime banner link

**File**: `src/lib/config-status.ts`

**Intent**: `:16` points users at `przeprogramowani/10x-astro-starter` from a **live, user-visible banner** when Supabase is unconfigured — a real bug, not cosmetics. `:15-17` is also the only Polish copy in the codebase.

**Contract**: Repoint `docsUrl` to this repository's README setup section and translate the message to English, matching the two sibling entries at `:20-32`.

#### 5. Starter residue

**Files**: `README.md`, `public/template.png`, `src/components/ui/LibBadge.astro`

**Intent**: The repo introduces itself as someone else's starter, and ships two files nothing imports.

**Contract**: Rewrite `README.md` for this product — title, what it does, setup (Node 22.14.0 per `.nvmrc`, `.env` / `.dev.vars`, `npx supabase start`), and the `npm run` scripts — dropping the starter clone URL and the `template.png` screenshot. Delete `public/template.png` (1.2 MB, referenced only from the README) and `src/components/ui/LibBadge.astro` (imported nowhere). Do the README edit before deleting the image so no broken reference is left behind.

### Success Criteria

#### Automated Verification

- Lint, build, and tests pass: `npm run lint && npm run build && npm run test`
- No starter references remain: `grep -rni "10x astro starter\|10x-astro-starter\|template.png" src public README.md` returns nothing
- Deleted files are gone and unreferenced: `grep -rn "LibBadge" src/` returns nothing
- `public/og.png` exists and is 1200×630

#### Manual Verification

- `/` explains the product to someone who has never seen it — no starter language anywhere
- Both hero CTAs open the auth dialog on the correct panel without navigating
- View source on `/`: description, `og:*`, and `twitter:*` tags are present and correct
- The OG card renders with an image in a link preview (e.g. paste the deployed URL into Slack or a card validator)
- With `SUPABASE_URL` unset, the config banner shows English copy and links to this repo, not the starter
- Browser tab title is the product name on `/`, and still page-specific on `/dashboard`

---

## Testing Strategy

**Unit tests** (the only automated tests this slice adds — the repo tests pure service logic only):
- `safeNextPath` — accepts `/dashboard`, `/dashboard?tab=x`; rejects `//evil.com`, `/\evil.com`, `https://evil.com`, `javascript:alert(1)`, `""`, `null`, and non-string input, each falling back to `/`.

**Manual end-to-end scenarios** (no e2e harness exists; run these against `npm run dev`):
1. Signed out on `/` → dialog → sign in → top bar shows email, still on `/`
2. Signed out on `/` → dialog → switch to sign up → create account → in-dialog confirmation
3. Signed out → `/dashboard` → bounced to `/` with dialog → sign in → **lands on `/dashboard`**
4. Dialog → Google → consent → back on the originating page, signed in
5. Dialog → Google → **deny consent** → back with a readable cancellation message in the dialog
6. Wrong password → inline error, dialog stays open, URL stays clean
7. `/auth/signin` and `/auth/signup` → redirect to `/` with the right panel open
8. Sign out → returns to `/`, top bar anonymous
9. Dev server stopped mid-submit → connection error renders (finding **F2** path)
10. `SUPABASE_URL` unset → "Supabase is not configured" still reaches the user through the dialog, not through the removed `?error=` channel

## Migration Notes

No data migration — this slice touches no tables and adds no secrets. Two compatibility concerns:

- **In-flight sessions survive.** Cookie handling is unchanged; only the response shape of the auth routes changes. A user signed in before deploy stays signed in.
- **Old links keep working.** `/auth/signin` and `/auth/signup` remain as redirect shims rather than 404s, which is why the "delete routes entirely" option was rejected.

**Rollback** is per-phase: each phase is an independent commit that leaves the app working, so reverting the most recent commit is always a safe recovery.

## References

- Internal research: `context/changes/landing-and-auth-shell/research.md`
- Dialog pattern to copy: `src/components/profile/ProfileDialog.tsx:24-30`
- Fetch/JSON submit contract to mirror: `src/components/profile/ChannelProfileForm.tsx:61-93`
- JSON error contract: `src/lib/http.ts`, `src/pages/api/profile.ts:31-50`
- OAuth decisions and the skipped `access_denied` finding: `context/archive/2026-09-08-google-oauth-login/plan.md:33-43`, `.../reviews/impl-review.md`
- Binding review findings F2/F3/F5/F8: `context/changes/channel-profile-crud/reviews/impl-review.md`
- Radix + React 19 form-action trap and the `FormData` → JSON switch: `context/changes/channel-profile-crud/plan.md:29-32`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: JSON auth contract and return-path plumbing

#### Automated

- [ ] 1.1 `safeNextPath` unit tests pass (`npm run test`)
- [ ] 1.2 Lint and type check pass (`npm run lint`)
- [ ] 1.3 Production build succeeds (`npm run build`)
- [ ] 1.4 No auth route redirects with `?error=`
- [ ] 1.5 No auth form declares a native action

#### Manual

- [ ] 1.6 Sign in with valid credentials works
- [ ] 1.7 Wrong password shows inline error without navigating
- [ ] 1.8 Sign up reaches confirmation; duplicate email errors inline
- [ ] 1.9 Google sign-in completes and returns signed in
- [ ] 1.10 Denying Google consent shows a cancellation message, not "Missing OAuth code"
- [ ] 1.11 `/dashboard` signed out bounces with `next=%2Fdashboard`
- [ ] 1.12 Server unreachable mid-submit renders the connection error

### Phase 2: Auth dialog

#### Automated

- [ ] 2.1 Lint and build pass
- [ ] 2.2 Unit tests still pass
- [ ] 2.3 Top bar has no direct `/auth/sign*` links

#### Manual

- [ ] 2.4 Dialog opens from the top bar; ESC, overlay, and X all close it
- [ ] 2.5 Sign in / sign up mode switch does not navigate
- [ ] 2.6 In-dialog sign-in re-renders the top bar on the same page
- [ ] 2.7 In-dialog sign-up swaps to the confirmation state
- [ ] 2.8 Google from the dialog returns to the originating page
- [ ] 2.9 `?auth=signup` opens the right panel and the URL is cleaned
- [ ] 2.10 `?auth_error=` shows the message in the dialog
- [ ] 2.11 Refresh after either does not reopen the dialog

### Phase 3: Centralize the shell

#### Automated

- [ ] 3.1 Lint, build, and tests pass
- [ ] 3.2 No page mounts `Topbar` directly
- [ ] 3.3 No dangling references to deleted files
- [ ] 3.4 Only the layout paints `bg-cosmic`

#### Manual

- [ ] 3.5 One top bar on `/` and `/dashboard`, unbroken ground
- [ ] 3.6 `/auth/signin` and `/auth/signup` redirect with the dialog open
- [ ] 3.7 Protected-route bounce returns the user to `/dashboard` after sign-in
- [ ] 3.8 Sign out still works and returns to `/`
- [ ] 3.9 Config banner still renders above the shell

### Phase 4: Landing content, metadata, and starter cleanup

#### Automated

- [ ] 4.1 Lint, build, and tests pass
- [ ] 4.2 No starter references remain in `src`, `public`, or `README.md`
- [ ] 4.3 `LibBadge` is gone and unreferenced
- [ ] 4.4 `public/og.png` exists at 1200×630

#### Manual

- [ ] 4.5 Landing explains the product with no starter language
- [ ] 4.6 Hero CTAs open the dialog on the correct panel
- [ ] 4.7 Description, `og:*`, and `twitter:*` tags present in page source
- [ ] 4.8 OG card renders with an image in a link preview
- [ ] 4.9 Config banner is English and links to this repo
- [ ] 4.10 Tab title is the product name on `/`, page-specific on `/dashboard`
