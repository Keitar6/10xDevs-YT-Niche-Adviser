---
change_id: google-oauth-login
title: Google oauth login
status: implemented
created: 2026-09-08
updated: 2026-09-09
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

- Cross-provider same-email (Migration Notes / Progress 2.9): confirmed Supabase links the Google identity onto the existing password-created user for a matching email — no duplicate account, no error. Both sign-in methods work for that one account afterward.
- Google's SSO means signing out of this app does not sign the user out of Google itself — without `prompt: "select_account"`, a returning click on "Continue with Google" silently re-authenticates the same Google account with no picker. Added `prompt: "select_account"` to `signInWithOAuth` in `src/pages/api/auth/google.ts` so the account chooser always shows.
- Local dev requires its own Google OAuth wiring, separate from the hosted Supabase project: `supabase/config.toml` `[auth.external.google]` (client id/secret via `env()`, values in local-only `.env`), local origin added to `additional_redirect_urls` (`http://localhost:4321/api/auth/callback`), and a matching Authorized redirect URI (`http://127.0.0.1:54321/auth/v1/callback`) added on the Google Cloud OAuth Client alongside the cloud Supabase callback.
