<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Landing and Auth Shell (S-04)

- **Plan**: context/changes/landing-and-auth-shell/plan.md
- **Scope**: Full plan (Phases 1–4)
- **Date**: 2026-09-13
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 1 observation

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — Unplanned canonical link and og:site_name added to Layout.astro

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/layouts/Layout.astro (head/meta block)
- **Detail**: Phase 4's metadata contract specified `description`, `og:title`, `og:description`, `og:type`, `og:image`, `og:url`, and `twitter:card` + matching `twitter:*` tags. The implementation also emits `<link rel="canonical">` and `og:site_name`, which aren't named in the plan and aren't recorded as a deviation in `change.md`. They're a natural, harmless companion to the already-planned OG work, not scope creep with any risk.
- **Fix**: Add a one-line addendum to `change.md`'s Phase 4 deviations noting the canonical link and `og:site_name` as an accepted extension of the metadata task.
- **Decision**: FIXED — addendum #9 added to `change.md`'s "Deviations during `/10x-implement`" list.

### F2 — `authErrorUrl` trusts the caller to pre-validate `next`

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/safe-next.ts (`authErrorUrl`)
- **Detail**: `authErrorUrl(next, message)` builds the redirect URL from `next` without itself calling `safeNextPath`. Every current call site (`google.ts`, `callback.ts`) already validates `next` via `safeNextPath` before passing it in, so there is no live open-redirect today. The guarantee lives in caller discipline rather than in the function's own contract — a future call site that forgets `safeNextPath` would silently reintroduce the open-redirect class this slice was built to close.
- **Fix**: Have `authErrorUrl` call `safeNextPath(next)` internally as defense-in-depth, so the guard can't be bypassed by omission at a future call site.
- **Decision**: FIXED — `authErrorUrl` in `src/lib/services/safe-next.ts` now calls `safeNextPath(next)` internally. `npm run lint` and `npm run test` (28/28) both re-verified passing.

## Notes

- All 4 phases fully implemented and matched against the plan's "Changes Required" contracts, including the two highest-risk items called out in "Critical Implementation Details": the `next` open-redirect guard (verified at every read point — `google.ts`, `callback.ts`, `middleware.ts`, both auth shims, `AuthDialog.tsx`) and the `callback.ts` check-ordering fix (`error`/`error_description` read before `code`, closing archived finding F1).
- All 9 deviations documented in `change.md` were verified against actual code and found narrowly scoped and correctly implemented — including the Phase-4-adjacent hero/profile bug fix (deviation #9), which is contained to `Welcome.astro`, `Topbar.astro`, the new `channel-profile-server.ts`, and a minimal, cleanly-scoped addition to `ProfileDialog.tsx`.
- Automated verification: `npm run lint` (exit 0), `npm run build` (exit 0), `npm run test` (28/28 passed), and every grep-based check in the plan's Success Criteria returned the expected result.
- Manual verification: all checked except 4.8 ("OG card renders in a link preview"), which is explicitly and correctly deferred in the plan's own Progress section — it requires a publicly reachable URL, not verifiable against localhost. Not treated as a failure.
- No XSS path found for `auth_error` messages (React-escaped text rendering, `encodeURIComponent` at construction). No dead code left behind (`GoogleSignInButton.astro`, `confirm-email.astro`, `LibBadge.astro`, `template.png` all confirmed removed and unreferenced).
