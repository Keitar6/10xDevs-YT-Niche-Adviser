<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Channel Profile Avatar

- **Plan**: context/changes/channel-profile-avatar/plan.md
- **Scope**: Phases 1–4 of 5 (Phase 5 excluded — Progress checkboxes not fully `[x]`; remaining items are documented won't-do/pending in change.md)
- **Date**: 2026-09-13
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Automated verification (re-run)

- `npm run lint` — pass (only `astro-eslint-parser` `projectService` warnings, no errors)
- `npm test` — pass (3 files, 50 tests)
- `npm run build` — pass
- `npx wrangler types` — regenerates cleanly; `AI`/`AVATAR_LIMITER` already present in committed `worker-configuration.d.ts`. (Local regen also picked up `YOUTUBE_API_KEY`/`ANTHROPIC_API_KEY` from this machine's `.dev.vars` — unrelated to this feature, reverted, not a finding.)

## Findings

### F1 — AvatarField hand-rolls pending state instead of using SubmitButton

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/components/profile/AvatarField.tsx:75,160,182-193,213-232
- **Detail**: Phase 3's contract (plan.md:171) explicitly says pending state uses `SubmitButton`'s `pending` prop, mirroring `ChannelProfileForm.tsx:186`. The shipped component never imports `SubmitButton`; it hand-rolls three buttons (upload label, Generate, Remove) driven by a local `busy: "upload" | "remove" | "generate" | null` state with custom spinner markup. Functionally correct — all three handlers are independently verified to wrap `fetch` in try/catch/finally — but this is an undocumented departure from a plan contract, not a cosmetic difference, and it introduces a second pending-button convention alongside `SubmitButton` with no rationale recorded in change.md.
- **Fix A ⭐ Recommended**: Document the deviation in change.md as accepted — three concurrent actions (upload/remove/generate) don't map cleanly onto a single-submit form component the way `ChannelProfileForm` does.
  - Strength: Preserves working, already-verified-correct code; avoids risky rework of a component whose async handling is safety-relevant.
  - Tradeoff: Two competing "pending button" conventions now coexist in the codebase for future implementers to reconcile.
  - Confidence: HIGH — functional correctness of the current code is independently confirmed.
  - Blind spot: Whether a future slice near this component copies the local pattern instead of `SubmitButton`, compounding the divergence.
- **Fix B**: Refactor to use `SubmitButton` per action (three instances) to match the plan's contract literally.
  - Strength: Restores a single pending-button convention project-wide.
  - Tradeoff: Non-trivial rework of a working, tested component for a pattern-only concern; risk of regressing currently-correct async handling.
  - Confidence: MEDIUM — unverified whether `SubmitButton` cleanly supports three independently-pending buttons in one dialog.
  - Blind spot: `SubmitButton`'s prop API hasn't been checked against this multi-action case.
- **Decision**: FIXED via Fix A — documented as an accepted deviation in change.md.

### F2 — Stale 512×512 references not updated after the 1024×1024 deviation

- **Severity**: ⚠️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: wrangler.jsonc:39 (comment); plan.md:400 (Progress item 4.5)
- **Detail**: change.md documents that generated avatars are 1024×1024 (not 512×512) at 57.6 neurons/image, but `wrangler.jsonc:39`'s comment still cites "~43.2 per 512px image", and plan.md's Progress checklist item 4.5 still asserts "a niche-derived 512×512 avatar." Both are stale audit-trail artifacts from before the deviation was discovered.
- **Fix**: Update the `wrangler.jsonc:39` comment to the corrected 1024px/57.6-neuron figure, and amend plan.md item 4.5's wording to reflect the accepted 1024×1024 deviation.
- **Decision**: FIXED — wrangler.jsonc:39 and plan.md:400 both updated.

### F3 — Duplicated AI-binding presence check with inconsistent casts

- **Severity**: ⚠️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/avatar/generate.ts:48-51; src/components/Topbar.astro:35
- **Detail**: The "is `env.AI` present" check is implemented independently in two places with different casts (`(env as { AI?: Ai }).AI` vs `(env as Record<string, unknown>).AI`), rather than sharing one helper.
- **Fix**: Extract a shared `hasAvatarGenerationBinding(env)` helper used by both call sites.
- **Decision**: FIXED — added `getAvatarAiBinding(env)` to `src/lib/services/avatar.ts`, used by both `generate.ts` and `Topbar.astro`. Lint/test/build all pass.

### F4 — Raw upstream error message forwarded to the client

- **Severity**: ⚠️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/avatar-generate.ts:84-87
- **Detail**: On a thrown error from `ai.run`, the raw `error.message` is forwarded verbatim in the JSON error envelope, unlike the fixed message used when `output.image` is missing, and unlike `avatar-storage.ts`'s fixed-message convention on its own failure paths. Low risk since Workers AI errors are generally generic, but inconsistent with the rest of the module.
- **Fix**: Log the raw message server-side and return a fixed user-facing string from `generateAvatar`.
- **Decision**: FIXED — returns a fixed message, not logged (the module has no existing logging convention, matching its other failure branches). Lint/test/build all pass.

### F5 — Read-then-mutate race in replaceAvatar/clearAvatar

- **Severity**: ⚠️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/avatar-storage.ts:97-134,143-166
- **Detail**: `readProfileAvatar` → mutate is not transactional. Two concurrent requests for the same user (double-click, or upload racing generate) could both read the same `previousPath` and both write, leaving a non-deterministic pointer and an orphaned object. Low real-world impact given the module's own "orphan over amnesia" philosophy (an orphaned object is recoverable; a lost pointer is not), and single-user UI interaction makes true concurrency rare.
- **Fix**: No action required as-is; note only. If a stricter guarantee is wanted later, add an optimistic-concurrency check (`.update().eq("avatar_path", previousPath)`) on the pointer update.
- **Decision**: ACCEPTED — matches the module's stated "orphan over amnesia" philosophy; no code change.

### F6 — No unit tests for ordering-critical write-path logic

- **Severity**: ⚠️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/avatar-generate.ts; src/lib/services/avatar-storage.ts
- **Detail**: `avatar.test.ts` thoroughly covers the pure module, but `replaceAvatar`/`clearAvatar` (whose write-then-delete ordering the module's own comments call "the whole point of this function") and `generateAvatar`'s decode/sniff logic have no unit coverage. The plan's Testing Strategy explicitly deferred integration-style tests for I/O paths as project convention, so this isn't a plan violation — just an opportunity.
- **Fix**: Optional — add tests for `replaceAvatar`'s three failure branches (upload fails, pointer update fails, previous-delete fails) and `generateAvatar`'s decode/sniff failure paths using a mocked `Ai`/`SupabaseClient`.
- **Decision**: SKIPPED — matches the plan's own no-I/O-mocking convention.
