# Google OAuth Login Implementation Plan

## Overview

Add Google OAuth sign-in alongside the existing, fully-working email+password flow, so FR-001 ("Użytkownik może założyć konto i zalogować się — email+hasło oraz OAuth Google") is fully satisfied. This is roadmap item **F-01**, an independent foundation slice with no prerequisites.

## Current State Analysis

- `src/pages/api/auth/signin.ts:13` only calls `supabase.auth.signInWithPassword` — there is no code path for OAuth today.
- `src/lib/supabase.ts` builds a cookie-based Supabase SSR client generically (`createServerClient` from `@supabase/ssr`) — it needs no changes to support OAuth; the same client exposes `signInWithOAuth` and `exchangeCodeForSession`.
- `src/middleware.ts:6-16` resolves the current user via `supabase.auth.getUser()` and doesn't care which provider was used — no changes needed there either.
- `src/components/auth/SignInForm.tsx` and `SignUpForm.tsx` are React islands (`client:load`) handling client-side validation for the password form. Neither has a social-login button, and neither needs one — the Google button is a plain full-page-redirect form, not a piece of interactive React state.
- `src/pages/auth/signin.astro` and `signup.astro` render the card layout and mount the React form islands; both already show a `serverError` query param via the existing `ServerError` component pattern.
- No OAuth callback route exists anywhere in `src/pages/api/`.
- `wrangler.jsonc` has no custom `routes` — the app is served from Cloudflare's default `*.workers.dev` origin (no fixed custom domain yet).
- Dead `.scaffold` duplicates sit next to several auth files (byte-identical copies from an earlier bootstrap step), including `signin.astro.scaffold` and `signup.astro.scaffold` — the two files this plan touches.
- `npm run lint` fails repo-wide today: 73 git-tracked files (spanning root configs, `.github/`, `.husky/`, `src/`, etc.) carry CRLF line endings, which `prettier/prettier` (default `endOfLine: "lf"`) flags as 1022 errors. No `.gitattributes` exists and `core.autocrlf` is unset, so nothing currently normalizes line endings on checkout or commit. This predates this change (confirmed via `git stash -u` + rerun on a clean `master`) — this plan's own new files (`google.ts`, `callback.ts`) are LF and lint clean on their own — but Phase 1 and Phase 2's "Lint passes: `npm run lint`" criteria can't pass while it's unfixed, so this plan now closes it out too rather than leaving it to block every future change.

## Desired End State

A user on `/auth/signin` or `/auth/signup` sees a "Continue with Google" button above the existing password form. Clicking it:
1. Redirects to Google's consent screen (via Supabase's hosted `/auth/v1/authorize` endpoint).
2. On approval, Google redirects to Supabase's fixed callback, which redirects to our app's `/api/auth/callback?code=...`.
3. Our callback route exchanges the code for a session (setting the same cookies the password flow uses) and redirects to `/`.
4. `/dashboard` (or any `PROTECTED_ROUTES` page) now works identically for a Google-authenticated user as for a password-authenticated one.

On denial/failure, the user lands back on `/auth/signin?error=...` with the existing `ServerError` component showing a message — the same pattern the password flow already uses.

**Verification:** manually walk through a first-time Google sign-in (new account auto-provisioned), a returning Google sign-in, the Google button from `/auth/signup`, the denial/error path, and confirm the existing email+password flow still works unaffected.

### Key Discoveries:

- Supabase's OAuth redirect flow has **two distinct callback URLs** that are easy to confuse: the Google Cloud Console "Authorized redirect URI" must point at **Supabase's own** fixed endpoint (`https://<project-ref>.supabase.co/auth/v1/callback`), while our app's `redirectTo` option points at **our own** `/api/auth/callback`. Neither is optional and they are not interchangeable.
- PRD's Access Control section frames Google OAuth purely as an authentication mechanism, distinct from the YouTube Data API quota concern flagged as an open unknown under roadmap item S-02 — so this change requests only the default `email`/`profile` scopes, nothing YouTube-related.
- Because there's no fixed custom domain yet, the OAuth redirect origin must be derived from the incoming request (`context.url.origin`) rather than hardcoded — this means Supabase's "Redirect URLs" allowlist needs both the local dev origin and the production Workers origin added.

## What We're NOT Doing

- Not touching `SignInForm.tsx` / `SignUpForm.tsx` or their `.scaffold` copies — the Google button lives entirely outside those React islands.
- Not requesting YouTube Data API OAuth scopes as part of this login — that's a separate concern for roadmap item S-02, unresolved there independently of this change.
- Not adding a custom app-side onboarding/confirmation step for first-time Google sign-ins — accepting Supabase's default auto-provisioning behavior.
- Not introducing a `PUBLIC_SITE_URL` (or similar) env var — the redirect origin is derived from the request at runtime.
- Not building a dedicated OAuth-specific error page — reusing the existing `?error=` query-param + `ServerError` pattern.
- Not leaving any `.scaffold` files behind — plan review (see Phase 2, Change 4) found this repo-wide convention has no evidence of incremental pruning, so this change retires it entirely rather than deleting just the two files it happens to touch.

## Implementation Approach

Two new server-only API routes following the existing flat convention under `src/pages/api/auth/` (`signin.ts`, `signup.ts`, `signout.ts` sit directly in that folder — the new routes join them rather than introducing a subfolder). A new plain `.astro` component renders the button and posts to the initiation route; it's added to both auth pages. No data model, middleware, or React-island changes.

## Critical Implementation Details

### Timing & lifecycle

The two external dashboards (Google Cloud Console, Supabase Dashboard) must be configured **before** Phase 1's manual verification can pass — the code has no effect until Google's OAuth client exists and Supabase's Google provider is enabled with matching credentials. Configure in this order: (1) create the Google Cloud OAuth Client with the Supabase-hosted callback as its Authorized redirect URI, (2) paste that Client ID/Secret into Supabase Dashboard → Authentication → Providers → Google, (3) add this app's dev and prod origins to Supabase Dashboard → Authentication → URL Configuration → Redirect URLs (as `<origin>/**` patterns) so `exchangeCodeForSession` in Phase 1's callback route is reachable from both environments.

## Phase 1: OAuth backend routes

### Overview

Add the two server routes that carry out the OAuth handshake, and get the external Google/Supabase configuration in place so the flow is reachable end-to-end at the network level (even before there's a UI button to trigger it).

### Changes Required:

#### 1. OAuth initiation route

**File**: `src/pages/api/auth/google.ts`

**Intent**: A `POST` route, mirroring `signin.ts`'s shape, that starts the OAuth handshake and redirects the browser to Google's consent screen.

**Contract**: Uses the same `createClient(context.request.headers, context.cookies)` helper as the other auth routes. Calls `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${context.url.origin}/api/auth/callback` } })`, then `context.redirect(data.url)` on success. On a missing/unconfigured Supabase client or an error from `signInWithOAuth`, redirect to `/auth/signin?error=...` — same failure shape as `signin.ts:10-17`.

#### 2. OAuth callback route

**File**: `src/pages/api/auth/callback.ts`

**Intent**: A `GET` route that Supabase redirects to after Google approval, carrying a `code` query param; exchanges it for a session and completes the login.

**Contract**: Reads `code` from `context.url.searchParams`. Calls `supabase.auth.exchangeCodeForSession(code)`. On success, `context.redirect("/")` (matching `signin.ts:19`'s successful-login destination). On a missing code or an exchange error, `context.redirect(`/auth/signin?error=${encodeURIComponent(...)}`)`.

#### 3. Normalize repo-wide line endings

**Files**: New `.gitattributes` at repo root; re-normalization pass over all git-tracked text files currently on CRLF (73 files as of this plan — see Current State Analysis).

**Intent**: `npm run lint` is a Success Criterion on both phases of this plan but currently fails repo-wide (1022 pre-existing `prettier/prettier` CRLF errors, unrelated to anything this plan otherwise touches). Fixing it here, once, unblocks both phases' lint criterion and stops it from silently blocking every future change too.

**Contract**: `.gitattributes` declares `* text=auto eol=lf` so Git normalizes line endings to LF in the working tree going forward, regardless of a given contributor's `core.autocrlf`. Existing tracked files are re-normalized to match (`git add --renormalize .` after the `.gitattributes` addition, or equivalent — `npm run format` alone does not rewrite files ESLint doesn't already touch, so re-normalization must happen at the Git layer, not just the formatter). `.scaffold` files are included in this pass for simplicity even though Phase 2 (Change 4) deletes them outright — normalizing then deleting is harmless, and excluding them would add exclusion logic for no benefit. No file *content* changes beyond line-ending bytes; this is not a formatting pass.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- Google Cloud OAuth Client created, with its Authorized redirect URI set to Supabase's hosted callback (`https://<project-ref>.supabase.co/auth/v1/callback`)
- Supabase Dashboard → Authentication → Providers → Google is enabled with that Client ID/Secret
- Supabase Dashboard → Authentication → URL Configuration → Redirect URLs includes both the local dev origin and the production Workers origin
- Requesting `/api/auth/google` directly returns a redirect (Location header) toward Supabase's hosted `/auth/v1/authorize` endpoint — following it (`curl -IL` or a browser) lands on `accounts.google.com`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: UI integration

### Overview

Add the visible "Continue with Google" button to both auth pages and confirm the full user-facing flow works end to end.

### Changes Required:

#### 1. Google sign-in button component

**File**: `src/components/auth/GoogleSignInButton.astro`

**Intent**: A self-contained, non-interactive button that posts to the Phase 1 initiation route — no client-side JS needed since it's a full-page redirect, so it stays a plain Astro component rather than a React island.

**Contract**: Renders `<form method="POST" action="/api/auth/google"><button type="submit">...</button></form>`, styled with an outline/secondary variant (visually distinct from the primary purple `SubmitButton` used by the password forms) to match the existing card theme (`bg-white/10`, `border-white/10`). Includes Google's standard four-color "G" mark as an inline SVG (brand guidelines require the exact colors — this is the one place in this plan where the icon markup itself, not just its usage, matters) and the label "Continue with Google".

#### 2. Wire into sign-in page

**File**: `src/pages/auth/signin.astro`

**Intent**: Show the Google button above the existing password form, separated by a visual divider, so it's the first option a returning user sees.

**Contract**: Add `<GoogleSignInButton />` plus a small inline "or" divider between it and `<SignInForm serverError={error} client:load />`, inside the existing card `<div>`.

#### 3. Wire into sign-up page

**File**: `src/pages/auth/signup.astro`

**Intent**: Same placement as sign-in, so a new user can create an account via Google without first going to the sign-in page.

**Contract**: Add `<GoogleSignInButton />` plus the same divider above `<SignUpForm serverError={error} client:load />`.

#### 4. Remove repo-wide scaffold duplicates

**Files**: All `*.scaffold` files tracked in the repo (`git ls-files | grep '\.scaffold$'` — ~20 files as of this plan, spanning the repo root, `.github/`, `.husky/`, `.vscode/`, `public/`, and `src/`, e.g. `package.json.scaffold`, `middleware.ts.scaffold`, `signin.astro.scaffold`, `Welcome.astro.scaffold`).

**Intent**: Plan review found these aren't dead duplicates local to the auth files this change touches — every scaffolded file in the repo has one, a deliberate `/10x-bootstrapper` convention with no evidence of prior pruning. Since this change already needs to delete two of them (their live counterparts are being edited), retire the convention entirely rather than leave two arbitrary exceptions among ~20 pairs.

**Contract**: File deletion for every git-tracked `*.scaffold` path. Confirm the full list via `git ls-files | grep '\.scaffold$'` before deleting and re-run after to confirm none remain. No build config, ignore file, or `package.json` script references `.scaffold` paths (already confirmed during plan review) — safe to delete outright.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- First-time Google sign-in from `/auth/signin`: account auto-provisioned, redirected to `/`, `/dashboard` shows the Google account's email
- Returning Google sign-in: same button logs the same user back in
- Google button on `/auth/signup` also completes the flow successfully
- Denying/canceling the Google consent screen redirects back to `/auth/signin` with a visible error message via the existing `ServerError` component
- Existing email+password sign-in and sign-up flows still work unaffected (regression check)
- Cross-provider same email: sign in with email+password using address X, sign out, then attempt "Continue with Google" with a Google account also using address X — confirm the observed behavior (link/duplicate/error) and, if it errors, that the error surfaces a comprehensible message via the existing `?error=` pattern rather than a raw/opaque one
- Zero `*.scaffold` files remain anywhere in the repo (`git ls-files | grep '\.scaffold$'` returns empty); `SignInForm.tsx` and `SignUpForm.tsx` (the live files, not their now-deleted scaffolds) are untouched

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None — this repo has no test runner configured (see `package.json` scripts); consistent with the existing auth routes, which also ship without unit tests.

### Integration Tests:

- None automated, for the same reason. Covered by the manual verification steps in each phase instead.

### Manual Testing Steps:

1. Run `npm run dev`, visit `/auth/signin`, click "Continue with Google" with a Google account that has never signed in before — confirm account creation + redirect to `/`.
2. Sign out (`/api/auth/signout`), click "Continue with Google" again with the same account — confirm it logs back in without re-prompting for account creation.
3. Visit `/auth/signup`, click "Continue with Google" — confirm it completes the same flow.
4. Start the Google flow and click "Cancel" / deny access on Google's consent screen — confirm redirect to `/auth/signin?error=...` with a visible error message.
5. Confirm the pre-existing email+password sign-in and sign-up flows still work unchanged.
6. Sign in with email+password using address X, sign out, then attempt "Continue with Google" with a Google account also using address X — record whether Supabase links, duplicates, or errors, and confirm any error is comprehensible via the existing error pattern.

## Performance Considerations

None beyond what the existing password flow already does — this adds two lightweight redirect-only routes, no new data fetching or heavy computation.

## Migration Notes

No data model changes. There is a real existing-user edge case worth naming: a user could sign in with email+password using address X, then later click "Continue with Google" with a Google account that also uses address X. Supabase's behavior here (silently link the identities, silently create a second account, or return an "already registered" error) depends on project-level Auth settings and isn't something this plan controls. Phase 2's manual verification now exercises this path directly (see its Manual Verification list) so the actual behavior is observed and confirmed non-broken before this change ships, rather than assumed. Deliberately reconciling/merging such accounts is still out of scope for FR-001 and not raised as a concern in the PRD — this note only covers verifying the failure mode isn't silently broken.

## References

- Roadmap item: `context/foundation/roadmap.md` — F-01
- PRD requirement: `context/foundation/prd.md` — FR-001, Access Control section
- Existing password flow: `src/pages/api/auth/signin.ts`, `src/pages/api/auth/signup.ts`
- Supabase SSR client: `src/lib/supabase.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: OAuth backend routes

#### Automated

- [x] 1.1 Lint passes: `npm run lint`
- [x] 1.2 Build passes: `npm run build`

#### Manual

- [x] 1.3 Google Cloud OAuth Client created, with its Authorized redirect URI set to Supabase's hosted callback
- [x] 1.4 Supabase Dashboard → Authentication → Providers → Google enabled with Client ID/Secret
- [x] 1.5 Supabase Dashboard → Authentication → URL Configuration → Redirect URLs includes dev and prod origins
- [x] 1.6 Requesting `/api/auth/google` directly returns a redirect toward Supabase's `/auth/v1/authorize` endpoint, which itself leads to `accounts.google.com`

### Phase 2: UI integration

#### Automated

- [ ] 2.1 Lint passes: `npm run lint`
- [ ] 2.2 Build passes: `npm run build`

#### Manual

- [ ] 2.3 First-time Google sign-in from `/auth/signin` creates account and redirects to `/`
- [ ] 2.4 Returning Google sign-in logs the same user back in
- [ ] 2.5 Google button on `/auth/signup` completes the flow successfully
- [ ] 2.6 Denying the Google consent screen redirects to `/auth/signin` with a visible error
- [ ] 2.7 Existing email+password flows still work unaffected
- [ ] 2.8 All repo-wide `*.scaffold` files removed (`git ls-files | grep '\.scaffold$'` returns empty); `SignInForm.tsx`/`SignUpForm.tsx` (live files) untouched
- [ ] 2.9 Cross-provider same-email behavior (password account + Google sign-in, same address) observed and confirmed non-broken
