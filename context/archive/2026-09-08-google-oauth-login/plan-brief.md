# Google OAuth Login — Plan Brief

> Full plan: `context/changes/google-oauth-login/plan.md`

## What & Why

Add Google OAuth sign-in alongside the already-working email+password flow, fully satisfying FR-001 ("email+hasło oraz OAuth Google"). This is roadmap item F-01 — an independent foundation slice with no prerequisites, sequenced early because it's a small, low-risk gap-closer that blocks the milestone's "Done when" check if left undone.

## Starting Point

`src/pages/api/auth/signin.ts` only calls `supabase.auth.signInWithPassword` — there's no OAuth code path and no callback route anywhere in the app. `src/lib/supabase.ts` and `src/middleware.ts` are provider-agnostic already and need no changes.

## Desired End State

A "Continue with Google" button appears on both `/auth/signin` and `/auth/signup`. Clicking it takes the user through Google's consent screen and back into the app fully authenticated — new accounts are auto-provisioned on first use, returning users log straight in, and denial/failure surfaces the same `?error=` message pattern the password flow already uses.

## Key Decisions Made

| Decision                    | Choice                                                               | Why (1 sentence)                                                                                                                                                                                                                                             |
| --------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Button placement            | Both `/auth/signin` and `/auth/signup`                               | Matches FR-001's "both tracks" framing and avoids funneling new users through the wrong page.                                                                                                                                                                |
| Redirect origin             | Derived from the incoming request (`context.url.origin`)             | Works in dev/prod without a new env var — no custom domain is configured yet anyway.                                                                                                                                                                         |
| Error handling              | Reuse the existing `?error=` redirect pattern                        | Zero new UI; consistent with the password flow's `ServerError` component.                                                                                                                                                                                    |
| First-time Google login     | Accept Supabase's default auto-provisioning                          | Matches PRD framing that Google users are already in Google's ecosystem; no onboarding step required by FR-001.                                                                                                                                              |
| `.scaffold` cleanup         | Delete all `*.scaffold` files repo-wide (~20 files)                  | Plan review found no evidence this repo-wide `/10x-bootstrapper` convention was ever pruned incrementally — retiring it entirely beats leaving 2 arbitrary exceptions.                                                                                       |
| YouTube API scopes          | Not requested by this login                                          | PRD treats Google OAuth as pure authentication, separate from the YouTube Data API quota concern under S-02.                                                                                                                                                 |
| Repo-wide CRLF lint failure | Fix it in Phase 1 via a new `.gitattributes` + re-normalization pass | Discovered during `/10x-implement`: `npm run lint` fails on 73 pre-existing CRLF files unrelated to this change, but it's a Success Criterion on both phases — folding the fix in here unblocks lint now instead of leaving it to block every future change. |

## Scope

**In scope:**

- New `/api/auth/google.ts` (initiate) and `/api/auth/callback.ts` (exchange code for session)
- New `GoogleSignInButton.astro` component, wired into `signin.astro` and `signup.astro`
- Required external config: Google Cloud OAuth Client + Supabase Dashboard provider/redirect-URL setup
- Deleting all `*.scaffold` files repo-wide (~20 files)
- New `.gitattributes` (`* text=auto eol=lf`) + one-time re-normalization of 73 CRLF-tracked files to LF

**Out of scope:**

- Any change to `SignInForm.tsx` / `SignUpForm.tsx` (React islands) or their `.scaffold` copies
- YouTube Data API OAuth scopes (belongs to S-02, unresolved independently there)
- Custom onboarding step for first-time Google users
- A `PUBLIC_SITE_URL` env var or dedicated OAuth error page

## Architecture / Approach

Two new server-only Astro API routes join the existing flat `src/pages/api/auth/` convention (`signin.ts`, `signup.ts`, `signout.ts`). The Google button is a plain `.astro` form (not a React island) since it's a pure full-page-redirect trigger with no client state. Flow: button → `/api/auth/google` → Google consent → Supabase's hosted callback → our `/api/auth/callback` → session cookies set → redirect to `/`.

## Phases at a Glance

| Phase                   | What it delivers                                                                                              | Key risk                                                                                                                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. OAuth backend routes | `google.ts` + `callback.ts`, Google Cloud / Supabase Dashboard configuration, repo-wide CRLF→LF normalization | External config must be correct before anything is testable — two distinct callback URLs (Supabase's own vs. ours) are easy to swap. The CRLF re-normalization touches 73 files' line-ending bytes — large diff, zero content change, but worth a careful review pass |
| 2. UI integration       | `GoogleSignInButton.astro` wired into both auth pages, scaffold cleanup, full E2E manual test                 | Regression risk on the existing password flow if the shared card layout is disturbed                                                                                                                                                                                  |

**Prerequisites:** A Google Cloud project (for the OAuth Client) and access to the project's Supabase Dashboard.
**Estimated effort:** ~1 session across 2 phases.

## Open Risks & Assumptions

- Supabase's Redirect URLs allowlist must include both the dev and prod origins (`<origin>/**`); this project has no PR-preview environment today (per `infrastructure.md`), so only two entries are needed — but this becomes a recurring chore if a custom domain or preview URLs are added later.
- A user could end up with two separate accounts (one password, one Google) if they sign up via both flows — not addressed here; the PRD doesn't raise it as a concern for FR-001.

## Success Criteria (Summary)

- A new user can create an account and sign in via Google from both `/auth/signin` and `/auth/signup`.
- A returning Google user logs back in without friction; denial shows a clear error.
- The existing email+password flow keeps working unchanged.
