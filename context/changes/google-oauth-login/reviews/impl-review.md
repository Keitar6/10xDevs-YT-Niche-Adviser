<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Google OAuth Login Implementation Plan

- **Plan**: context/changes/google-oauth-login/plan.md
- **Scope**: Phase 1 + Phase 2 (full plan)
- **Date**: 2026-09-10
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Google's own consent-denial error isn't surfaced distinctly

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/callback.ts:17-19
- **Detail**: When Google returns `?error=access_denied&error_description=...` (user cancels consent), the route doesn't read those params — it falls through the `!code` branch to a generic "Missing OAuth code" message. Manual test 2.6 passed (a visible error does show), but the message is misleading rather than the actual denial reason.
- **Fix**: Read `error`/`error_description` from `context.url.searchParams` first and pass `error_description` (or `error`) through to the `?error=` redirect when present, falling back to the current generic message only when neither `code` nor `error` is present.
- **Decision**: SKIPPED

### F2 — OAuth errors always redirect to /auth/signin, even from /auth/signup

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/auth/google.ts, src/pages/api/auth/callback.ts
- **Detail**: A user who clicks "Continue with Google" on `/auth/signup` and hits an error lands on `/auth/signin?error=...` instead of back on `/auth/signup`. No security impact, just a minor UX inconsistency with the rest of the signup flow.
- **Fix**: Thread the originating page through (e.g. a `redirect_to` query param on the initiation POST, or Supabase's OAuth `state`) and redirect errors back to that origin page.
- **Decision**: FIXED — added a validated `origin` hidden field to `GoogleSignInButton.astro` (defaults `"signin"`, `"signup"` on the signup page), threaded through `google.ts`'s initiation redirect and the `redirectTo` query string, read back in `callback.ts` against the same allowlist. Lint + build verified clean.

### F3 — `context.redirect(data.url)` has no defensive fallback

- **Severity**: ⚪ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/google.ts:24
- **Detail**: If `error` is null but `data.url` were ever falsy (not expected from the Supabase SDK, but typed as optional), `context.redirect(undefined)` would throw uncaught instead of degrading to the existing error-redirect path.
- **Fix**: Add `data.url ?? throw-to-error-redirect` style guard alongside the existing `error` check.
- **Decision**: FIXED — `google.ts` now checks `error || !data.url` and redirects to the error page with a fallback message when `data.url` is missing. Lint + build verified clean.

### F4 — Origin-derived `redirectTo` relies on Google's registered-URI allowlist as the real guard

- **Severity**: ⚪ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/google.ts:13
- **Detail**: `redirectTo` is built from `context.url.origin`, which reflects the incoming `Host` header on Cloudflare Workers. A spoofed `Host` would only change the constructed value — Google rejects any redirect URI not pre-registered in the OAuth client, so this isn't an open-redirect vector today, but it's worth confirming only the intended dev/prod origins are registered.
- **Fix**: No code change needed. Verify the Google Cloud OAuth client's "Authorized redirect URI" list contains only the intended origins (it should — Phase 1 manual step 1.3-1.5 already required registering these — this is a confirm-not-forget note, not a defect).
- **Decision**: SKIPPED — informational only, already covered by Phase 1's manual verification.
