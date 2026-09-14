<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Analyze and Rank Opportunities (S-02)

- **Plan**: `context/changes/analyze-and-rank-opportunities/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-12
- **Verdict**: REVISE → SOUND (all 10 findings fixed in triage)
- **Findings**: 2 critical, 6 warnings, 2 observations

## Verdicts

| Dimension             | Verdict (at review) | After fixes |
| --------------------- | ------------------- | ----------- |
| End-State Alignment   | WARNING             | PASS        |
| Lean Execution        | PASS                | PASS        |
| Architectural Fitness | WARNING             | PASS        |
| Blind Spots           | FAIL                | PASS        |
| Plan Completeness     | WARNING             | PASS        |

## Grounding

11/11 paths ✓, 6/6 symbols ✓ (4 line refs drifted — F9), brief↔plan ✓ except the CPU-risk wording (F5).
Progress↔Phase: 5/5 phases matched, 35/35 success criteria mapped, no stray checkboxes outside `## Progress` ✓.
External verification: Astro Cloudflare adapter + Cloudflare Rate Limiting binding via Context7; Anthropic TypeScript SDK surface via the bundled `claude-api` reference.
`context/foundation/lessons.md` and `docs/reference/contract-surfaces.md` do not exist — those checks were skipped.

## Findings

### F1 — Repeatability criterion is stronger than the PRD and unpassable live

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Desired End State · Phase 4 SC · Progress 4.5 · Testing Step 3
- **Detail**: PRD NFR (prd.md:121-122) reads "Ta sama analiza **na tych samych danych wejściowych** zwraca ten sam outlier_score i tę samą kolejność". The plan dropped "on the same input data" in four places, stating it as a live claim. Between runs viewCount grows, moving the channel median and every score with it; a video crossing `MIN_RANKABLE_AGE_DAYS = 7` also changes set membership. The implementer chases a phantom bug — or "fixes" it with caching, which the plan explicitly forbids.
- **Fix A ⭐ Recommended**: Restate as determinism-given-fixed-input
  - Strength: Matches the PRD verbatim; Phase 2's unit tests already are the verification.
  - Tradeoff: No live end-to-end check of the core property.
  - Confidence: HIGH — the PRD qualifier is explicit; the `now`-injection design exists for this.
  - Blind spot: None significant.
- **Fix B**: Keep the live double-run check with a stated tolerance
  - Strength: Still exercises the real pipeline end to end.
  - Tradeoff: Invents a tolerance the PRD never asked for; near-ties can still flip.
  - Confidence: MEDIUM — drift magnitude over a few minutes is unmeasured.
  - Blind spot: The 7-day boundary flip isn't covered by any tolerance.
- **Decision**: FIXED via Fix A — 4 edits in plan.md, 1 in plan-brief.md

### F2 — A channel median of 0 yields Infinity/NaN scores

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Scoring module, `scoreChannel`
- **Detail**: `MIN_SAMPLE_SIZE = 5` guarantees a non-empty array but not a non-zero median — three of five long-form videos at 0 views gives median 0, so every score becomes Infinity (or NaN for 0/0). Infinity sorts to rank 1 and renders as the literal "Infinity"; NaN compares inconsistently and breaks the deterministic ordering the NFR requires. The contract documented the empty-array case but not this one.
- **Fix**: Treat `median === 0` as a skip on the same path as the sample floor, with its own reason string; add a unit test alongside the below-floor test.
- **Decision**: FIXED — scoring contract + test list updated

### F3 — Paging stop condition contradicts the "3-call chain" quota contract

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Key Discoveries · Phase 3 §1 step 2 · Progress 3.8
- **Detail**: Key Discoveries fixed the chain at three calls (~3 units/competitor, ~15/run) and Progress 3.8 verified "~15 units at 5 competitors". But Phase 3's contract said the loop "evaluates the stop condition against the running confirmed count" — and the confirmed long-form count only exists after `videos.list`, forcing that call inside the paging loop. A Shorts-heavy channel paging four times costs ~8 units, not 3. The implementer either built the interleaved loop (failing 3.8 on a correct implementation) or quietly dropped the stop condition.
- **Fix A ⭐ Recommended**: Window/page-cap bound primary, single `videos.list` pass
  - Strength: Page to `MAX_WINDOW_DAYS` or `MAX_PAGES`, then one `videos.list` per 50-ID batch, then cap the sample at `TARGET_LONGFORM_PER_CHANNEL` after durations are known. Bounded both ways; the 3-call contract and 3.8 hold as written.
  - Tradeoff: Pays for a few Shorts lookups a confirmed-count loop would have skipped.
  - Confidence: HIGH — 180 days × 50/page is bounded by construction.
  - Blind spot: Page cap for an extreme daily-Shorts channel unmeasured.
- **Fix B**: Keep the interleaved loop, restate the budget as a range (~15–40 units) and rewrite 3.8
  - Strength: Hits `TARGET_LONGFORM_PER_CHANNEL` exactly on every channel shape.
  - Tradeoff: The "hard contract" framing weakens.
  - Confidence: MEDIUM — worst-case page count is data-dependent.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — `MAX_PAGES = 2` added to the constants; Critical Implementation Details, Phase 3 steps 2–3, verification 3.6, and the brief all updated

### F4 — Rate-limit binding access unspecified; the obvious pattern was removed in this adapter version

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 4 §1 and §3 step 2
- **Detail**: The plan added a binding to wrangler.jsonc but never said how `/api/analyze` reaches it. `Astro.locals.runtime` was **removed in `@astrojs/cloudflare` v13 / Astro 6**; this project is on `^13.5.0` + `astro ^6.3.1`, so every v12-era tutorial pattern is a dead end. Access is `import { env } from "cloudflare:workers"`. `src/env.d.ts:1-5` types `App.Locals` with `user` only and no `Env` type exists, so the binding would be untyped under `strictTypeChecked` (`eslint.config.js:15`). Per Cloudflare docs the entry also needs an integer `namespace_id`, `simple.period` must be exactly 10 or 60, and the `limit({ key })` key (user vs IP) is a product decision.
- **Fix**: Pin all four — `import { env } from "cloudflare:workers"`; `ratelimits` entry with explicit `namespace_id` and `simple: { limit: 5, period: 60 }`; `limit({ key: context.locals.user.id })` so the budget is per-user (and is why the step runs after auth); `wrangler types`-generated `Env`.
- **Decision**: FIXED

### F5 — The headline risk (10ms CPU) had no verification step, and the stated reason it couldn't be checked was false

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Current State Analysis · Performance Considerations · Phase 5
- **Detail**: `infrastructure.md:55,62,87` makes the free-tier 10ms CPU cap the pre-mortem's headline failure, silent in production. plan-brief called it "assumed, not verified"; plan.md called it "comfortably bounded" — the two disagreed. No criterion measured CPU (5.12 measures wall-clock p95, dominated by network I/O). And Current State Analysis claimed "Observability is absent ... `wrangler tail` is live-only", but `wrangler.jsonc:11-13` already sets `"observability": { "enabled": true }` — Workers Logs retains per-invocation CPU time. The cheap check the plan said it lacked was already wired up.
- **Fix**: Correct the observability claim; add a step to read per-invocation CPU time from Workers Logs after the smoke deploy and record it separately from wall-clock; escalate to the $5/mo Workers Paid plan (`infrastructure.md:87`) if at/near 10ms.
- **Decision**: FIXED — new Progress step 5.13 added

### F6 — `channels.list(part=contentDetails)` carries no title, so skipped competitors cannot be "named explicitly"

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Desired End State · Phase 3 §1 step 1 · Phase 4 exits 6-7
- **Detail**: Desired End State promises competitors that failed to resolve or fell below the sample floor are "named explicitly", and exit 7 returns them "naming them and their counts". But step 1 requested only `part=contentDetails`, and the plan's own Key Discovery states an unrequested part is absent from the response — so no title is ever fetched and the UI can only print a raw `UC...` string. The plan already supplied the argument for the fix: "Requesting three parts costs the same one unit as requesting one."
- **Fix**: Request `part=contentDetails,snippet` and carry `snippet.title` into the reconciliation summary. Same 1 unit. Unresolved IDs have no title by definition — report those as the raw string.
- **Decision**: FIXED

### F7 — `@anthropic-ai/sdk` never installed; error-class chain used Python SDK names

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 §2 (and Phase 1 §5, which installed only vitest)
- **Detail**: The SDK is absent from package.json and no phase added it — `npm run build` fails on the first line of `justify.ts`. The chain `RateLimitError → APIStatusError → APIConnectionError` is the Python SDK's shape; the TypeScript SDK has no `APIStatusError`, and all status errors extend `Anthropic.APIError`. Verified sound in the same section: `output_config: { format }` is the current structured-output shape, `claude-opus-5` is the current model ID, and prefill and `budget_tokens` do both return 400 on it.
- **Fix**: Add `@anthropic-ai/sdk` in Phase 1 alongside vitest; rewrite the chain as `Anthropic.RateLimitError → Anthropic.APIError → Anthropic.APIConnectionError`.
- **Decision**: FIXED

### F8 — The 5-per-60s limit collides with the plan's own manual test protocol

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Testing Strategy — Manual Testing Steps 2-7
- **Detail**: Step 4 deliberately tripped the limiter; steps 5–7 were all Analyze clicks that would 429 for the rest of the window. The plan never said what the tester does next, and enforcement is per Cloudflare location, so local `wrangler dev` may not match production.
- **Fix**: Reorder so the rate-limit test runs last; state the 60s window and the per-location caveat.
- **Decision**: FIXED — steps renumbered 1–9 with the limiter test last

### F9 — Four Current State line references drifted, one materially

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Current State Analysis · Phase 1 §2, §4 · Phase 4 §3
- **Detail**: `jsonError` is at profile.ts:20-25 (not 19-24); the null-Supabase treatment at 48-51 (not 47-49); `.dev.vars` is .gitignore:20 (line 14 is `.env`). Materially, the plan described `profile.ts:31`'s `request.json()` as unguarded, but that guard landed in 677c648 — profile.ts:33-37 wraps it in try/catch. The instruction's intent was right; it described fixed code as broken.
- **Fix**: Re-anchor the four references; guidance unchanged.
- **Decision**: FIXED

### F10 — The "English throughout" pass missed the banner's Polish chrome

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §3
- **Detail**: Phase 1 §3 rewrote the Polish message in `config-status.ts`, but `src/layouts/Layout.astro:23,30` hardcodes `<strong>Uwaga:</strong>` and the `"Dokumentacja"` fallback label outside the `ConfigStatus` objects — every banner, including the two new ones, would still render Polish chrome.
- **Fix**: Translate both literals in the same Phase 1 edit; add `src/layouts/Layout.astro` to the section's file list.
- **Decision**: FIXED
