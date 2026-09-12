# Analyze and Rank Opportunities — Plan Brief

> Full plan: `context/changes/analyze-and-rank-opportunities/plan.md`
> Research: `context/changes/analyze-and-rank-opportunities/research.md` (internal), `yt-api-docs.md` + `yt-library-research.md` (external)

## What & Why

Roadmap slice **S-02**, the north star: a logged-in user with a channel profile clicks "Analyze" and gets a ranked list of the top 5 content opportunities, each with a numeric `outlier_score` and a one-sentence justification. This is the slice that proves the product's core hypothesis — that curated competitors plus outlier scoring beats the general algorithm — and it is the direct prerequisite for S-03.

## Starting Point

`channel_profiles` exists with per-owner RLS and, as of 2026-09-12, a hard 3–5 competitor bound on both client and server. Nothing else needed here exists: no outbound third-party `fetch()` anywhere in the repo, no `src/lib/services/` despite CLAUDE.md naming it, no test runner, and `src/components/ui/` holds only `button` and `dialog`. Secrets follow a fixed six-point plumbing path, and `.env.example` / `.dev.vars` are both missing.

## Desired End State

An Analyze button on `/dashboard` returns, within seconds, a ranked list of up to 5 opportunities showing video title, channel, score, and justification. Competitors that could not be resolved, or that had too little data to score, are named explicitly rather than silently dropped. Every failure — missing key, quota exceeded, rate limit, LLM unavailable — produces a readable message. A click never ends in unexplained emptiness.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Baseline statistic | Median, not mean | One extreme video moves a mean arbitrarily; every competitor worth curating already has outliers inflating theirs. | Research (D2) |
| Competitor cap | 3–5, enforced in the profile | Makes quota, latency and CPU bounded at once — the cheapest single lever on all three. | Research (D1) |
| API access | Plain `fetch()` + zod, never `search.list` | `googleapis` needs `http2`, which workerd lacks; `search.list` costs 100 units vs 1 and would cap the product at ~20 runs/day. | Research |
| Competitor ID integrity | `UC`-format check at the profile **and** resolved-N-of-M reconciliation at analysis | `channels.list` silently omits unknown IDs — the worst failure shape for a product whose entire output is a ranked list. | Plan |
| Sampling window | Last 20 long-form videos, capped at 180 days | Stable across wildly different upload cadences, and bounds paging for Shorts-heavy channels on both axes. | Plan |
| Too-small sample | Skip the channel below 5 videos, name it in the response | A median over n=2 is degenerate; better to explain the gap than emit an undefendable score. | Plan |
| Recent videos | Excluded from ranking under 7 days, still counted in the median | Launch-week spikes read as 4x outliers and settle to ~1.2x by day ten. | Plan |
| Shorts cutoff | Under 5 minutes | User's call; risk is asymmetric — a leaked Short corrupts the baseline, a lost real video only shrinks the sample. | Plan |
| Quota abuse | Cloudflare rate-limit binding, with an explicit "limit reached" message | No schema or migration; stops the realistic vector (double-clicks, retry loops) for a single-user MVP. | Plan |
| Caching | None | ~650 runs/day of headroom means volume is not the binding constraint; rate limiting covers abuse. | Plan |
| Justifications | One batched LLM call, structured output | One round trip instead of five, and the model can compare the five so they don't read alike. | Plan |
| LLM failure | Return the ranking anyway, justifications omitted | The quota-consuming work is already done; discarding it produces exactly the empty screen the PRD forbids. | Plan |
| Ranking | Top 5 videos by score, deterministic tie-break | LLM-based theme clustering would break the repeatability NFR outright. | Plan |
| Language | English throughout | Every existing UI string is already English; this removes the one Polish inconsistency instead of adding more. | Plan |
| Tests | Vitest, scoring module only | The repeatability NFR is a property no manual click-through verifies, and hand-rolling the maths was justified on the assumption of unit tests. | Plan |
| Results UI | Section on `/dashboard`, not a dialog | A ranking is content to keep visible while deciding; a dialog also re-enters the Radix bug that cost real time in S-01. | Plan |
| Workers plan | Free — design to the 10ms CPU budget | Matches what `infrastructure.md` documents, and the competitor cap keeps parsing bounded. | Plan |

## Scope

**In scope:** `POST /api/analyze`; `src/lib/services/{scoring,youtube,justify}.ts`; Vitest harness plus scoring unit tests; two new secrets through all six plumbing points with config-banner visibility; `UC` format validation on competitor IDs; a Cloudflare rate-limit binding; Analyze trigger and ranked results on `/dashboard`; sonner/card/skeleton primitives.

**Out of scope:** persisting results (S-03's `content_opportunities`); caching of any kind; streaming or polling progress; retrying the LLM; richer per-competitor statistics UI (D3); `#shorts` metadata scanning; test coverage beyond the scoring module; any change to the 3–5 competitor bound.

## Architecture / Approach

Four concerns become three service modules, one route, one island:

```
scoring.ts   pure, I/O-free, unit-tested        <- the core hypothesis
youtube.ts   zod-validated client, 3-call chain <- the quota contract
justify.ts   one batched LLM call, degradable   <- the only failable-but-optional step
api/analyze.ts   auth -> rate limit -> profile -> fetch -> score -> justify
components/analyze/*   trigger + ranked results
```

The call chain is fixed: `channels.list` (one call, all competitors) → `playlistItems.list` (paged, stopping at 20 long-form or 180 days) → `videos.list` (50 IDs per batch). Ordering matters inside scoring: **Shorts are filtered before the median is computed**, not merely before ranking.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Foundation | Secrets + config banner, shared `jsonError`, Vitest harness, `UC` format check | Six-point secret plumbing where the one step CI cannot verify (`wrangler secret put`) is the one that breaks production |
| 2. Scoring core | Pure scoring module + unit tests | The product's core maths — wrong numbers still look like numbers in the UI |
| 3. YouTube client | zod schemas, 3-call chain, resolved-N-of-M reconciliation | Paging is data-dependent; Shorts are only identifiable after the third call |
| 4. Analyze endpoint | Orchestration, rate limiting, LLM, every FR-009 failure path | Eight distinct failure exits, each needing its own readable message |
| 5. Dashboard UI | Analyze trigger, ranked results, toasts, partial-state notices | First real screen in the app; empty and partial states must always explain themselves |

**Prerequisites:** S-01 complete (it is — the 3–5 cap landed 2026-09-12). Out of band: enable YouTube Data API v3 on the existing `yt-niche-adviser` Google Cloud project, obtain an Anthropic key, and set both as GitHub secrets *and* Worker secrets.
**Estimated effort:** ~3–4 sessions across 5 phases.

## Open Risks & Assumptions

- **The 5-minute Shorts cutoff is aggressive.** Any channel whose normal format is 3–5 minute videos has its entire catalog classified as Shorts, gets skipped by the sample floor, and could push a run below the PRD's ≥3 opportunities. Implemented as a single named constant so it is tunable in one place.
- **Latency is measured, not predicted.** D4 chose a blocking POST with a spinner on the assumption the capped work keeps p95 comfortably under ~30s. Phase 5 records the real figure; if it exceeds ~10s the escalation path is streamed NDJSON progress, which would be new architecture.
- **The free plan's 10ms CPU ceiling is assumed, not verified** against the actual Cloudflare account. An overrun surfaces as an intermittent Error 1102 — hard to diagnose with no logger, no Sentry, and live-only `wrangler tail`.
- **Justification quality is subjective** and has no automated check. The Secondary success criterion — that the sentence is good enough to actually choose a topic on — is judged by reading the output.
- **The quota bucket is shared** with the Google Cloud project backing F-01's OAuth client. Harmless today since OAuth consumes no YouTube quota, but anything else added to that project competes for the same 10,000 units/day.

## Success Criteria (Summary)

- A user with a valid profile clicks Analyze and gets ≥3 (target 5) ranked opportunities, each with a score and a one-sentence justification.
- The same profile analyzed twice returns identical scores in identical order.
- Every failure path — no profile, bad competitor IDs, quota exceeded, rate limited, LLM down, key missing — produces a readable explanation rather than an empty or broken screen.
