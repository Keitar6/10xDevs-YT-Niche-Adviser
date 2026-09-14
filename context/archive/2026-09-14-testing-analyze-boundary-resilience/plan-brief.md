# Analyze-pipeline Boundary Resilience — Plan Brief

> Full plan: `context/changes/testing-analyze-boundary-resilience/plan.md`
> Research: `context/changes/testing-analyze-boundary-resilience/research.md`

## What & Why

Phase 1 of the project's test plan covers the two top risks: the LLM
justification provider returning garbage and killing a run whose scores were
already computed (Risk #1), and a YouTube quota or API error surfacing as a
broken screen or a *confidently empty* ranking (Risk #2). Research found both
risks are already largely defended in production code — and that **none of that
behaviour is covered by a single test**. So this is a characterization and
gap-closing phase, not a bootstrap.

## Starting Point

`justify.ts` returns a typed sentinel on every path and never throws past the
route; `youtube.ts` classifies errors into a discriminated union and keeps
quota/auth fatal across the fan-out. Both contracts are written down in the
modules' own comments and neither is tested. Five test suites exist, all pure
and synchronous, with **zero `vi.*` usage anywhere** — this phase writes the
repo's first faked transport. The worktree also has no `node_modules` yet.

## Desired End State

A hostile provider response — garbage, refusal, truncation, rate limit,
connection failure — provably yields the ranked list with its scores plus an
explicit account of what is missing. An empty or whitespace justification is
reported as absent rather than available. A competitor whose fetch failed is
distinguishable, in the payload and on screen, from an ID that does not exist.
Any unexpected throw in the route returns `{ error }` JSON, never Astro's HTML
error page.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Transport seam | `vi.stubGlobal("fetch", …)`, no library | A spike settled research's open question: the SDK resolves `fetch` in the client constructor and `justify.ts` constructs per call, so one stub reaches both boundaries with zero production-code change | Plan (spike) |
| Fake fidelity | Real `Response` objects | Keeps the real `res.json()`, real zod schemas and real SDK decoder in the path — the test plan's "fake the transport, not the parsing" rule | Plan |
| Fix vs characterize | Fix G1, G2, G3 (and G5) | A test asserting today's behaviour would pin a defect; all sit on the exact PRD guardrail this phase defends | Plan |
| "Present" justification | Non-empty after trim | Closes the silent-render gap with one boundary rule; a length floor would be a number invented here rather than derived from the PRD | Plan |
| Test reach | Extract the merge, test services only | Route-level tests would need `astro:env/server` + `cloudflare:workers` mocks, alias config and a widened `include`; extraction gets G1 covered at the cheapest layer | Plan |
| G2 shape | Reason-coded `unresolved` entries | Gives Risk #2's anti-pattern the state class it demands, mirroring the existing `SkippedChannel` shape | Plan |
| G2 UI reach | One extra warning notice | Today the panel actively mis-reports a failed competitor as "Not found on YouTube" — the risk is only closed where the user meets it | Plan |
| G3 catch body | Log server-side, generic message | Mirrors the existing `channel_profiles` handling in the same file: raw detail stays server-side, client gets readable `{ error }` | Plan |
| G4 (`max_tokens`) | Characterize, don't defend | The spike showed truncation almost always throws, making the silent short array near-unreachable | Plan (spike) |

## Scope

**In scope:** `justify.test.ts`, `youtube.test.ts`, a new
`justification-merge.ts` + suite; the G5 `AnthropicError` branch; reason-coded
`unresolved` through `youtube.ts` → `types.ts` → the route; a top-level
try/catch in `analyze.ts`; a split warning notice in `AnalyzePanel`; test-plan
§6.2 / §6.6.

**Out of scope:** route-level tests, `vitest.config.ts` changes, any mocking
library, `resolveChannelRefs` and `/api/profile.ts`, a `stop_reason` guard for
`max_tokens`, a justification length floor, UI look-and-feel tests, retry or
backoff anywhere, e2e.

## Architecture / Approach

Fake the transport, never the parsing. Every test installs a `fetch` returning a
genuine `Response`, so real status branching, real zod schemas and the SDK's
real decoder all stay in the exercised path. Phases move up the chain —
characterize a boundary, fix what the characterization exposes, then the next —
with everything that can only be checked by hand grouped into the last phase.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Harness + LLM boundary | `justify.test.ts`; the G5 `AnthropicError` branch | Vitest's `unstubGlobals` is off by default — stubs leak between tests without an explicit `afterEach` |
| 2. YouTube boundary + G2 | `youtube.test.ts`; reason-coded `unresolved` through the DTO | Two different `unresolved` concepts exist; touching the wrong one breaks profile saving |
| 3. G1 merge extraction | `justification-merge.ts` + suite; empty/whitespace → absent | The extraction could silently change the happy path, which no unit test establishes |
| 4. Close the chain | Route try/catch; split notice; test-plan §6.2 | Phases 2 and 4 must deploy together or the notice renders `[object Object]` |

**Prerequisites:** `npm ci` in this worktree (no `node_modules` present); a
valid `ANTHROPIC_API_KEY` and `YOUTUBE_API_KEY` in `.dev.vars` for the manual
checks.
**Estimated effort:** ~3-4 sessions across 4 phases.

## Open Risks & Assumptions

- A `Response` body is single-use, and `youtube.ts` issues three sequential
  calls per channel — the fake must build a fresh `Response` per invocation or
  fan-out tests fail confusingly.
- The new `AnthropicError` branch must sit *after* the three typed branches;
  first would swallow every `APIError`, mirroring the ordering hazard the file
  already documents.
- Whether a refusal carrying prose is pre-empted by the SDK's parse throw is
  inferred from the SDK source, not observed against the live API. Phase 1's
  test documents the condition rather than asserting the branch always fires.
- `AnalyzeSummary.unresolved` changes shape, but it is server-constructed and
  never persisted, so there is no stored data to migrate.

## Success Criteria (Summary)

- A broken or hostile external response leaves the user with the ranking, the
  scores, and a sentence explaining what is missing — never a 500, never a blank
  card, never an unexplained gap.
- A competitor whose data failed to load is never described to the user as a
  channel that does not exist.
- The next person adding a boundary test has a working pattern to copy from
  test-plan §6.2 instead of a "TBD".
