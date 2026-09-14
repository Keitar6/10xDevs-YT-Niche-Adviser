<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Google OAuth Login Implementation Plan

- **Plan**: context/changes/google-oauth-login/plan.md
- **Mode**: Deep
- **Date**: 2026-09-08
- **Verdict**: REVISE (all findings fixed during triage — see Decisions below)
- **Findings**: 0 critical, 3 warnings, 0 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | WARNING |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

7/7 paths ✓ (`google.ts`/`callback.ts` targets, `signin.ts`, `signup.ts`, `supabase.ts`, `signin.astro`/`signup.astro` + `.scaffold` twins), 4/4 symbols ✓ (`signInWithOAuth`/`OAuthResponse` and `exchangeCodeForSession`/`AuthTokenResponse` in `@supabase/auth-js` type defs, `@supabase/ssr`'s PKCE code-verifier cookie handling in `createServerClient.js`/`cookies.js`, `createClient` call sites), brief↔plan ✓

Riskiest claim verified sound: the PKCE code-verifier handshake between `google.ts` and `callback.ts` across two separate HTTP requests works with zero changes to `src/lib/supabase.ts`, because `@supabase/ssr`'s `createServerClient` defaults to `flowType: "pkce"` and applies the code-verifier cookie the moment it's generated (`cookies.js:288-308`).

## Findings

### F1 — Scaffold deletion breaks a repo-wide, git-tracked convention

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Phase 2, Change 4 ("Remove stale scaffold duplicates")
- **Detail**: The plan called `signin.astro.scaffold`/`signup.astro.scaffold` dead duplicates and deleted them. `git ls-files | grep '\.scaffold$'` shows ~20 other tracked `.scaffold` twins repo-wide with no evidence any were ever pruned — a deliberate `/10x-bootstrapper` convention, not debris.
- **Fix A ⭐ Recommended**: Drop the scaffold-deletion item from Phase 2
  - Strength: Keeps the convention intact — no orphaned exception.
  - Tradeoff: The two twins go stale (missing the Google button).
  - Confidence: HIGH — ~20 other pairs exist repo-wide with zero evidence of prior pruning.
  - Blind spot: Haven't confirmed with the user why the twins are kept, only inferred intentionality.
- **Fix B**: Keep deleting, but repo-wide instead of just these two
  - Strength: No orphaned exceptions; removes ~20 files of dead weight if truly unneeded.
  - Tradeoff: Larger, unrelated diff bolted onto a Google-OAuth change; could destroy a bootstrapper re-run/conflict-resolution capability on a guess.
  - Confidence: LOW — this outcome was never discussed with the user before this review.
  - Blind spot: Same as Fix A — actual purpose of the twins is unconfirmed.
- **Decision**: FIXED (Fix B — deletion scope broadened to all ~20 repo-wide `.scaffold` files; `plan.md` Phase 2 Change 4, "What We're NOT Doing", Manual Verification, and Progress 2.8 updated; `plan-brief.md` decision table and scope list updated)

### F2 — Existing-email account-linking behavior is untested

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Migration Notes / Manual Testing Steps
- **Detail**: Migration Notes said "not applicable, no existing-user impact" then described exactly such an impact in the same breath. Supabase's behavior when a Google sign-in email matches an existing password account is config-dependent (link, duplicate, or error) and none of the manual test steps exercised it.
- **Fix**: Add a manual test step to Phase 2 — sign in with email+password using address X, sign out, then attempt "Continue with Google" with a Google account sharing address X; record whether Supabase links, duplicates, or errors, and confirm any error surfaces a comprehensible message via the existing `?error=` pattern.
- **Decision**: FIXED (Migration Notes reworded to remove the contradiction; new manual verification bullet added to Phase 2, new step 6 added to Manual Testing Steps, new Progress item 2.9 added)

### F3 — Imprecise redirect-target wording in Phase 1 verification

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 Manual Verification (and Progress 1.6)
- **Detail**: Stated that requesting `/api/auth/google` "returns a redirect toward accounts.google.com." The route's own Location header actually points at Supabase's hosted `/auth/v1/authorize` endpoint first; a plain non-following `curl -I` wouldn't show `accounts.google.com` at all.
- **Fix**: Reword to "...returns a redirect (Location header) toward Supabase's hosted `/auth/v1/authorize` endpoint — following it (`curl -IL` or a browser) lands on accounts.google.com."
- **Decision**: FIXED (Phase 1 Manual Verification bullet and Progress 1.6 reworded)
