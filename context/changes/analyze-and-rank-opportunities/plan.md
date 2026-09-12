# Analyze and Rank Opportunities Implementation Plan

## Overview

Implement roadmap slice **S-02** (the north star): a logged-in user with a channel profile clicks "Analyze" and receives a ranked list of the top 5 content opportunities, each with a numeric `outlier_score` and a one-sentence justification.

The pipeline reads the profile's 3–5 curated competitor IDs, resolves each channel's uploads playlist, pages recent videos, excludes Shorts, scores every qualifying video against **its own channel's median** view count, ranks globally, and attaches LLM-generated justifications. Results render as a new section on `/dashboard`.

This is the slice that proves the product's core hypothesis — curated competitors plus outlier scoring beats the general algorithm — and it unlocks S-03 (`save-and-view-opportunities`).

## Current State Analysis

- **`channel_profiles` is the only application table.** RLS is four granular per-operation policies, all `to authenticated`, all `auth.uid() = user_id` (migration `20260909213911_create_channel_profiles.sql:13-28`), so a server-side read through the cookie-scoped client is automatically owner-isolated.
- **The profile is read in exactly one place today**: `src/components/Topbar.astro:7-11` via `.maybeSingle()`. `dashboard.astro` does not load it. `/api/analyze` needs its own read and must handle the signed-in-but-no-profile case.
- **Competitor count is now bounded.** As of 2026-09-12, `src/pages/api/profile.ts:15-16` enforces `.min(3).max(5)` and `ChannelProfileForm.tsx` mirrors it. Every quota, latency, and CPU estimate in the external research assumed this bound; it now holds. **Format is still unvalidated** — any non-empty unique string passes.
- **No outbound third-party `fetch()` exists anywhere in the repo.** S-02 is the first.
- **`src/lib/services/` does not exist** despite CLAUDE.md naming it. All logic to date lives inline in route handlers. This slice has four separable concerns (YouTube client, Shorts filter, scoring, LLM) and is the change that forces the directory into being.
- **No test runner.** `package.json` has no `test` script, zero `*.test.*` files exist, `ci.yml` runs lint + build only. Three prior changes each recorded this and used a phase-gated manual protocol instead.
- **`src/components/ui/` holds only `LibBadge.astro`, `button.tsx`, and `dialog.tsx`.** No card, table, skeleton, alert, badge, or toast.
- **Observability is absent** — no logger, no Sentry, `no-console: "warn"` in `eslint.config.js:23`, and `wrangler tail` is live-only.
- **Secrets follow a fixed six-point plumbing path** (`astro.config.mjs` → consuming module → `.env` → `.dev.vars` → `ci.yml` → `wrangler secret put`). `.env.example` and `.dev.vars` do not exist despite the README referencing the former.

## Desired End State

A logged-in user with a saved profile sees an "Analyze" button on `/dashboard`. Clicking it disables the button, shows a spinner, and within a few seconds renders a ranked list of up to 5 opportunities — each showing the video title, its channel, a numeric `outlier_score`, and a one-sentence justification. Competitors that could not be resolved, or that had too little data to score, are named explicitly rather than silently dropped. Any failure — missing API key, YouTube quota exceeded, rate limit hit, LLM unavailable — produces a readable message, never an empty or broken screen.

**Verification:** run an analysis against a real profile of 3–5 valid competitor channels and confirm a ranking appears with plausible scores; confirm the same profile analyzed twice returns identical scores and identical ordering; confirm a profile containing one bogus competitor ID still produces a ranking plus a "resolved N of M" notice; confirm the ranking is empty-but-explained (not blank) when no competitor clears the minimum-sample floor.

### Key Discoveries:

- **The call chain is a hard contract, not an optimization.** `channels.list(part=contentDetails, id=<batched>)` → `playlistItems.list(playlistId, maxResults=50)` → `videos.list(part=snippet,statistics,contentDetails, id=<up to 50>)`. At ~3 units per competitor this is ~15 units per run (~650 runs/day against the 10,000/day project bucket). `search.list` costs 100 units and would cap the product at ~20 runs/day — **any use of `search.list` in this slice is a defect.**
- **`statistics.viewCount` is a JSON string, not a number** (`yt-api-docs.md`). Arithmetic on the raw value concatenates instead of summing. Schemas need `z.coerce.number()`.
- **A `part` the request did not ask for is absent from the response object, not `null`.** Schemas must model missing parts as absent keys (`.optional()`), not nullable fields.
- **There is no Shorts flag anywhere in the API.** A query against a 3,015-snippet index of the official docs returned `No documentation matched this query`. Shorts are only identifiable after `videos.list` returns a duration, so `playlistItems` paging pays quota for Shorts it then discards — "50 uploads" does not mean "50 long-form videos."
- **Shorts view counts are inflated by design.** Since 2025-03-31 they are counted from start/replay events with no minimum watch time. A Short that leaks past the filter inflates the channel median and suppresses every genuine outlier on that channel — which is why exclusion happens *before* the baseline is computed, not merely before ranking.
- **Strict type-checked lint makes zod parsing mandatory, not stylistic.** `eslint.config.js:15` enables `strictTypeChecked`; `await res.json()` is `any`, so reading `data.items[0].statistics.viewCount` off a raw response is a lint **error**.
- **Secrets are `optional: true` and CI auto-deploys on every push to master** (`ci.yml:25-30`, gated only on branch). A build with no key succeeds and ships, so a missing key surfaces as a broken button in production. `validateSecrets: true` would *not* fix this — it validates the CI build environment, not the Worker's runtime secrets set via `wrangler secret put`. The countermeasure is the existing `configStatuses` banner, which makes the failure loud within seconds instead of silent until someone clicks Analyze.
- **Cloudflare places no wall-clock limit on HTTP-triggered Workers**, and awaiting `fetch()` costs no CPU. The binding constraint is the free plan's **10ms CPU** — which only JSON parsing and zod validation consume.
- **React 19 function form actions are broken inside Radix `Dialog`** (`channel-profile-crud/plan.md:30`) — relevant only as a reason the results UI is a page section, not a dialog.

## What We're NOT Doing

- **No `search.list`, ever** — see Key Discoveries.
- **No caching** (KV, D1, or otherwise). At ~650 runs/day the quota is not the binding constraint; rate limiting covers the abuse vector. Explicitly deferred.
- **No response persistence.** Saving an opportunity is S-03's job; this slice returns results and forgets them. No `content_opportunities` table, no migration.
- **No streaming or polling progress.** Per decision D4, option 1 — a blocking POST with a spinner, with the work capped so the spinner is honest. Escalate to streamed NDJSON only if measured p95 exceeds ~10s.
- **No richer per-competitor statistics UI** (decision D3 — post-MVP). The DTO carries sample size and channel median so it is cheap to add later, but nothing renders them beyond what a result row needs.
- **No `#shorts` metadata scanning** — duration is the only Shorts signal used.
- **No competitor-count changes.** The 3–5 bound was settled by D1 and implemented 2026-09-12.
- **No retry on the LLM call** — one attempt, then degrade. Retrying pushes against the ~30s p95 target on the slowest path.
- **No broader test coverage than the scoring module.** No route tests, no mocked-fetch client tests.
- **No profile deletion, no multi-profile support, no Shorts analysis** — all PRD Non-Goals.

## Implementation Approach

Four separable concerns become three modules under a new `src/lib/services/`, plus one route and one island:

```
src/lib/services/scoring.ts   pure, I/O-free, unit-tested   <- the product's core hypothesis
src/lib/services/youtube.ts   zod-validated API client      <- the quota contract
src/lib/services/justify.ts   batched LLM call              <- the only failable-but-degradable step
src/pages/api/analyze.ts      auth, rate limit, orchestration
src/components/analyze/*      trigger + ranked results island
```

The ordering is deliberate: scoring is pure and fully testable before any network code exists; the YouTube client is verifiable against the live API before orchestration; the route cannot ship until both work. Each phase leaves the app in a working state.

## Critical Implementation Details

**Shorts must be filtered before the baseline is computed.** The natural implementation order — fetch, compute median, filter, rank — is wrong and produces silently degraded results on every channel that posts Shorts. The correct order is fetch → filter Shorts → compute median over what remains → apply the minimum-sample floor → rank. The 7-day recency rule is different and applies **only at the ranking step**: recent videos still count toward the median, they just cannot be returned as opportunities.

**Paging is data-dependent and must be bounded on two axes.** A channel posting mostly Shorts yields few long-form videos per page, so a naive "page until N long-form collected" loop can page indefinitely. The loop stops at whichever comes first: `TARGET_LONGFORM_PER_CHANNEL` reached, or an item older than `MAX_WINDOW_DAYS`, or the playlist is exhausted. Both bounds are required; either alone is unbounded in one direction.

**CPU, not wall-clock, is the runtime budget.** Awaiting `fetch()` is free; parsing and validating the video records is not. Keep scoring to a single pass over each channel's array and avoid re-sorting — a CPU overrun on the free plan surfaces as an intermittent Error 1102, which is nearly undiagnosable with no logger.

## Phase 1: Foundation — secrets, config visibility, shared helpers, test harness

### Overview

Everything the later phases assume exists: two new secrets plumbed through all six points, a loud failure mode when they are missing, the `jsonError` helper shared rather than duplicated, a Vitest harness, and the competitor-ID format check that stops bad input at the profile.

### Changes Required:

#### 1. Declare the two new secrets

**File**: `astro.config.mjs`

**Intent**: Make `YOUTUBE_API_KEY` and `ANTHROPIC_API_KEY` available from `astro:env/server`, following the exact shape of the existing Supabase secrets.

**Contract**: Two new `env.schema` entries using `envField.string({ context: "server", access: "secret", optional: true })`. Keep `optional: true` — a missing key must degrade to a readable message, not throw on import. Do not set `env.validateSecrets`.

#### 2. Local and CI secret plumbing

**Files**: `.env.example` (new), `.env`, `.dev.vars` (new), `.github/workflows/ci.yml`

**Intent**: `.env.example` does not exist despite `README.md:36,41,84,118` instructing readers to copy it; `.dev.vars` does not exist either, so Cloudflare local dev has no secret source. Both must be written, and CI's build step needs the new keys or the build sees `undefined`.

**Contract**: `.env.example` lists all four variable names with placeholder values and is committed. `.dev.vars` mirrors it with real values and stays gitignored (`.gitignore:14`). The `env:` block on the `npm run build` step in `ci.yml:22-24` gains both keys, sourced from repository secrets. Production values are set out of band via `wrangler secret put` — note this in the plan's Migration Notes, not in code.

#### 3. Make a missing key visible on every page load

**File**: `src/lib/config-status.ts`

**Intent**: Because secrets are optional and CI auto-deploys, a missing key ships a silently broken Analyze button. The existing banner mechanism is the countermeasure and already renders app-wide.

**Contract**: Add two `ConfigStatus` entries — one for YouTube, one for Anthropic — each `configured` on the presence of its key, following the existing Supabase entry's shape. Per the language decision, all three `message` strings are **English**; rewrite the existing Polish Supabase message to match rather than adding new inconsistency.

#### 4. Share the JSON error helper

**Files**: `src/lib/http.ts` (new), `src/pages/api/profile.ts`

**Intent**: `jsonError` is defined locally in `profile.ts:19-24` and imported by nobody. S-02 is its second consumer; the prior impl-review already flagged the unshared error envelope as a repeat-finding risk.

**Contract**: Move `jsonError(message, status)` to `src/lib/http.ts` unchanged — returns a `Response` with `{ error: string }` and `Content-Type: application/json`. Update `profile.ts` to import it. No behaviour change.

#### 5. Vitest harness

**Files**: `package.json`, `vitest.config.ts` (new), `.github/workflows/ci.yml`

**Intent**: The decision to hand-roll the statistics was justified on the assumption they would be unit-tested, and the repeatability NFR is a property no manual click-through verifies.

**Contract**: Add `vitest` as a dev dependency and a `test` script (`vitest run`). Config scoped to `src/lib/services/**/*.test.ts` only — no jsdom, no React testing, no setup files. Add a `npm test` step to CI after lint. Keep the harness minimal: this phase adds no tests, only the ability to run them.

#### 6. Competitor-ID format validation

**Files**: `src/pages/api/profile.ts`, `src/components/profile/ChannelProfileForm.tsx`

**Intent**: Nothing validates that a competitor entry is a YouTube channel ID. `channels.list` silently omits unknown IDs rather than erroring, so a user pasting a handle (`@name`), a URL, or a video ID would get a quietly smaller result set — the silent-emptiness failure shape the external research rejected `scrapetube` for.

**Contract**: A shared constant and predicate (co-located with the profile schema, or in `src/lib/services/youtube.ts` if it reads better once that exists) matching the YouTube channel-ID shape: literal `UC` followed by 22 characters from `[A-Za-z0-9_-]`. Applied as a `.regex()` on each array element in the zod schema and mirrored in the form's `validate()`, with a message that names the expected shape and explicitly mentions that handles and URLs are not accepted. This is the entry half of the input-integrity fix; the reconciliation half lands in Phase 3.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build passes: `npm run build`
- Test runner executes (zero tests is a pass at this stage): `npm test`

#### Manual Verification:

- With no `YOUTUBE_API_KEY` set, the dashboard shows a config banner naming YouTube as unconfigured
- Saving a profile with a valid `UC...` competitor ID still succeeds
- Saving a profile with `@handle`, a full channel URL, or a bare word is rejected with a message explaining the expected format
- The existing profile save flow is otherwise unchanged (no regression from the `jsonError` move)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Scoring core — pure functions and unit tests

### Overview

The product's core hypothesis, expressed as pure functions with no I/O and no framework coupling, plus the unit tests that make the repeatability NFR verifiable.

### Changes Required:

#### 1. Scoring module

**File**: `src/lib/services/scoring.ts` (new — creates `src/lib/services/`)

**Intent**: Turn a channel's list of videos into scored, ranked opportunities, applying every sampling rule decided during planning. Pure and synchronous so it is trivially testable and cheap against the 10ms CPU budget.

**Contract**: Exports the tuning constants as named values in one place — `SHORTS_MAX_SECONDS = 300`, `MIN_RANKABLE_AGE_DAYS = 7`, `MIN_SAMPLE_SIZE = 5`, `TARGET_LONGFORM_PER_CHANNEL = 20`, `MAX_WINDOW_DAYS = 180` — so all of them are tunable without hunting through logic.

Core functions:
- `median(values: number[]): number` — sorted middle, mean of the two middles for even counts. Returns `0` (or throws, documented either way) for an empty array; this case must be unreachable because the min-sample floor runs first.
- `isShort(durationSeconds: number): boolean` — `<= SHORTS_MAX_SECONDS`.
- `parseIsoDuration(iso: string): number` — ISO-8601 to seconds. YouTube never emits years, months, or weeks for a video, so a compact regex over hours/minutes/seconds is sufficient; no dependency.
- `scoreChannel(videos, now)` — the ordered pipeline: exclude Shorts → if fewer than `MIN_SAMPLE_SIZE` remain, return a skipped result naming the channel and its count → compute the median over the remaining set → score every video as `viewCount / median` → return only videos at least `MIN_RANKABLE_AGE_DAYS` old as rankable, while the younger ones remain in the baseline.
- `rankOpportunities(perChannelResults, limit = 5)` — flatten, sort by `outlier_score` descending, take `limit`. Ties broken by a stable secondary key (published date descending, then video ID) so ordering is deterministic across runs, as the NFR requires.

The `now` parameter is injected rather than read from `Date.now()` inside, so age-dependent behaviour is testable.

#### 2. Scoring unit tests

**File**: `src/lib/services/scoring.test.ts` (new)

**Intent**: Cover the cases where silent wrongness hides — wrong numbers still look like numbers in the UI.

**Contract**: Tests for: `median` on odd, even, single-element, and unsorted input; `parseIsoDuration` on `PT15M51S`, `PT1H2M3S`, `PT45S`, `PT2H`; the Shorts boundary at exactly 300s (excluded) and 301s (included); a channel that falls below the sample floor returning skipped rather than a score; a video younger than 7 days being excluded from the ranking **but still moving the median**; deterministic ordering when two videos tie on score; and the documented empty-array behaviour of `median`.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- Reading through the test list, every sampling rule decided in planning has at least one test that would fail if the rule were removed

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: YouTube data client

### Overview

The three-call chain behind zod schemas, with bounded paging and explicit reconciliation of which competitors actually resolved.

### Changes Required:

#### 1. YouTube client module

**File**: `src/lib/services/youtube.ts` (new)

**Intent**: Fetch the long-form video data the scoring module needs, at the documented quota cost, validating every response before it is touched.

**Contract**: Module-scope zod schemas for the three response shapes, modelling absent parts as absent keys (`.optional()`) and `statistics.viewCount` via `z.coerce.number()`. Exported entry point takes the competitor ID list and the API key and returns, per channel, the validated long-form video records plus a reconciliation summary naming which requested IDs produced no channel.

Call sequence, exactly as contracted:
1. `channels.list(part=contentDetails, id=<all competitor IDs, comma-joined>)` — one call for the whole set; read the uploads playlist from `contentDetails.relatedPlaylists.uploads` rather than string-munging the channel ID. IDs absent from `items` are the unresolved set.
2. `playlistItems.list(playlistId, part=snippet,contentDetails, maxResults=50)` per channel, paging via `nextPageToken`. **Stop at whichever comes first**: `TARGET_LONGFORM_PER_CHANNEL` long-form videos confirmed, an item older than `MAX_WINDOW_DAYS`, or no `nextPageToken`. Because duration is unavailable here, the long-form count is only known after step 3 — so the loop collects candidate IDs and evaluates the stop condition against the running confirmed count.
3. `videos.list(part=snippet,statistics,contentDetails, id=<up to 50 comma-joined>)` — batch IDs 50 per call. Requesting three parts costs the same one unit as requesting one, so never split parts across calls.

Fan-out across channels uses `Promise.all`; with at most 5 competitors this stays under Cloudflare's limit of 6 simultaneous outgoing connections. A per-video fan-out would not, and is forbidden.

Errors are classified rather than collapsed: HTTP 403 carrying `quotaExceeded` is distinguishable by the caller from a transport failure or a malformed response, because FR-009 requires the quota case to produce its own readable message.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint` — in particular no `no-unsafe-*` violations, which would indicate a response being read without parsing
- Build passes: `npm run build`
- Unit tests still pass: `npm test`
- `grep -r "search.list\|/search?" src/` returns nothing

#### Manual Verification:

- A scratch invocation against 3–5 real channel IDs returns the expected number of long-form videos per channel
- A deliberately Shorts-heavy channel terminates paging rather than looping, and does so within the window bound
- A bogus-but-well-formed ID (`UC` + 22 valid characters that no channel uses) appears in the unresolved set rather than throwing
- Observed quota consumption for one run is in the expected range (~15 units for 5 competitors), confirmed in the Google Cloud console

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Analyze endpoint

### Overview

The route that ties it together: auth, rate limiting, profile read, orchestration, LLM justification, and every FR-009 failure path.

### Changes Required:

#### 1. Rate limit binding

**File**: `wrangler.jsonc`

**Intent**: Stop one user hammering Analyze from draining the shared 10,000 units/day project bucket.

**Contract**: Add a Rate Limiting binding (`ratelimit`) with a short-window configuration — on the order of 5 requests per 60-second period — alongside the existing `ASSETS` binding. Note in a comment that enforcement is per Cloudflare location, so this is a burst guard rather than a global daily budget.

#### 2. LLM justification module

**File**: `src/lib/services/justify.ts` (new)

**Intent**: Turn the top 5 scored opportunities into one-sentence justifications a creator would actually act on — the Secondary success criterion.

**Contract**: One batched call via `@anthropic-ai/sdk` (the plain `Anthropic()` client — **not** the Vertex client, which pulls `node:stream` and does not run on workerd). Default to `claude-opus-5`. Structured output via `output_config: { format: ... }`; assistant prefill returns 400 and must not be used, and `budget_tokens` returns 400 since thinking is adaptive by default. The response is parsed with zod like any other untrusted input — an LLM response is no more trustworthy than an API response.

The prompt carries, per opportunity: video title, channel title, `outlier_score`, the channel's median, sample size, and publication age. It asks for one sentence per opportunity explaining *why this topic is worth recording next*, in **English**, grounded in the numbers supplied rather than invented context.

Returns justifications on success. On any failure — including a schema mismatch — it returns a typed failure the caller can degrade on, never throwing past the route. Errors are caught on the typed chain (`RateLimitError` → `APIStatusError` → `APIConnectionError`), not one broad class.

#### 3. The analyze route

**File**: `src/pages/api/analyze.ts` (new)

**Intent**: The single orchestration point, and the only place that decides what the user sees when something fails.

**Contract**: `POST`, JSON in and out, following `profile.ts`'s conventions — self-guarded auth (middleware's `PROTECTED_ROUTES` covers only `/dashboard`, never `/api/*`), zod at module scope, `jsonError` from `src/lib/http.ts` for every failure exit. Body parsing, if any body is read at all, is guarded — `profile.ts:31`'s unguarded `request.json()` was an impl-review finding and must not be copied.

Ordered pipeline, each step with its own failure exit:
1. No `context.locals.user` → 401.
2. Rate limit exceeded → **429 with a message naming the limit and when to retry**, not a generic failure.
3. Missing `YOUTUBE_API_KEY` → 500 naming the unconfigured service, mirroring `profile.ts:47-49`'s treatment of a null Supabase client.
4. No profile, or a profile with no competitors → 400 telling the user to set up their profile first.
5. YouTube quota exceeded → a distinct, readable message, not a generic upstream error. This is the `quotaExceeded` case the archived OAuth impl-review's skipped F1 finding predicted would recur.
6. Zero competitors resolved → 200 with an empty ranking and an explanation naming the unresolved IDs. **An empty result is a successful response with a reason, never a bare empty list** — the PRD guardrail is explicit that a click never ends in unexplained emptiness.
7. All competitors skipped by the sample floor → 200 with an empty ranking naming them and their counts.
8. LLM failure → 200 with the full ranking, justifications omitted, and a flag the UI renders as a notice.

Success returns 200 with the ranked opportunities and the run metadata the UI needs: which competitors resolved, which were skipped and why, and whether justifications are present.

#### 4. Shared result types

**File**: `src/types.ts`

**Intent**: `src/types.ts` currently holds one `Database`-derived alias. S-02 introduces the project's first types that are not DB-derived.

**Contract**: Per CLAUDE.md, shared DTOs live here. Define the zod schemas as the source of truth in their owning service module and re-export the `z.infer` types through `src/types.ts` — establishing the convention S-03 will follow for `content_opportunities`.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build passes: `npm run build`
- Unit tests pass: `npm test`

#### Manual Verification:

- A signed-in user with a valid profile gets a 200 carrying 5 ranked opportunities with justifications
- The same profile analyzed twice returns identical scores and identical ordering (the repeatability NFR)
- An unauthenticated request returns 401 JSON, not an HTML error
- Clicking Analyze rapidly triggers the 429 path, and the message states the limit and when to retry
- A profile with one bogus competitor still returns a ranking plus an accurate "resolved N of M" summary
- With `ANTHROPIC_API_KEY` unset, the ranking still returns with justifications omitted and the degradation flag set
- With `YOUTUBE_API_KEY` unset, the response is a readable 500 naming the service — not a crash

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Dashboard UI

### Overview

The user-facing half: an Analyze trigger and a ranked results list on `/dashboard`, with every failure path from Phase 4 given a visible surface.

### Changes Required:

#### 1. Toast primitive

**File**: `src/components/ui/sonner.tsx` (generated)

**Intent**: Per decision D4, run errors surface as toasts. No toast component exists.

**Contract**: `npx shadcn@latest add sonner`, then apply the fix recorded in `channel-profile-crud/plan.md`: repoint the generated `cn` import at `@/lib/utils` and remove the redundant `cn` npm package the CLI pulls in. Mount the `Toaster` once in the layout.

#### 2. Result presentation primitives

**Files**: `src/components/ui/card.tsx`, `src/components/ui/skeleton.tsx` (generated)

**Intent**: A ranked list with scores and a loading state has nothing to build on today.

**Contract**: Add via `npx shadcn@latest add`, same `cn` fix. Keep the set minimal — only what the results list actually uses.

#### 3. Analyze panel island

**Files**: `src/components/analyze/AnalyzePanel.tsx`, `src/components/analyze/OpportunityList.tsx` (new)

**Intent**: Own the request lifecycle and render the outcome, including the partial and empty states that carry an explanation.

**Contract**: A React island holding `running`, `result`, and `error` state. Submits via a plain `fetch` — **not** a React 19 function form action, per the Radix interaction recorded in S-01, and not inside a dialog. The trigger disables while a run is in flight, which is the first line of defence against double-submission. The fetch is wrapped in `try/catch/finally`: a network failure or non-JSON response sets a readable error rather than silently resetting, which was impl-review finding F2 on the previous slice and must not recur.

Renders, in order of precedence: a skeleton while running; a toast plus inline error on failure; the ranked list on success. Above the list, when present, a notice naming unresolved competitors, skipped competitors with their sample counts, and whether justifications were degraded. Each row shows rank, video title, channel title, `outlier_score` formatted to a fixed precision, and the justification when present.

An empty ranking always renders its explanation — never a bare "no results".

#### 4. Wire into the dashboard

**File**: `src/pages/dashboard.astro`

**Intent**: `dashboard.astro` is currently a single centered welcome card. It becomes the app's primary surface.

**Contract**: Render `<AnalyzePanel client:load />` below the existing welcome card, inside a container wide enough for a list rather than the current centered narrow card. The profile is not passed down — the route reads it server-side, so the panel needs no props.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build passes: `npm run build`
- Unit tests pass: `npm test`
- No stray `cn` package: `grep '"cn"' package.json` returns nothing

#### Manual Verification:

- Clicking Analyze shows a loading state, then a ranked list of up to 5 opportunities with scores and justifications
- The button is disabled while a run is in flight
- Triggering the rate limit shows a toast naming the limit and when to retry
- A profile with a bogus competitor shows the ranking plus a visible "resolved N of M" notice
- With no profile saved, clicking Analyze explains that a profile is needed rather than failing opaquely
- With `ANTHROPIC_API_KEY` unset, the ranking renders with a visible notice that justifications are unavailable
- Stopping the dev server mid-request surfaces a readable connection error, not a silent reset
- Measured p95 for a 5-competitor run is recorded — if it exceeds ~10s, note it as the trigger for escalating to streamed progress in a follow-up

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- `src/lib/services/scoring.test.ts` — the full sampling rule set: median correctness, ISO-8601 duration parsing, the Shorts boundary at exactly 300s, the minimum-sample floor, the 7-day rankable rule and its interaction with the baseline, and deterministic tie-breaking.

### Integration Tests:

- None automated. The YouTube and Anthropic clients are verified manually against live APIs; mocked-fetch coverage is explicitly out of scope.

### Manual Testing Steps:

1. Run `npm run dev` with all four secrets set, sign in, and confirm no config banner appears.
2. Save a profile with 3 valid `UC...` competitor IDs, click Analyze, and confirm a ranking of up to 5 opportunities with scores and justifications.
3. Click Analyze again on the unchanged profile — confirm identical scores and identical ordering.
4. Click Analyze repeatedly to trip the rate limit; confirm the toast names the limit and the retry window.
5. Edit the profile to include one well-formed but non-existent `UC...` ID; re-run and confirm the ranking still appears alongside an accurate "resolved N of M" notice.
6. Unset `ANTHROPIC_API_KEY`, restart, and confirm the ranking renders with justifications omitted and a visible notice.
7. Unset `YOUTUBE_API_KEY`, restart, and confirm both the config banner and a readable error on click.
8. Attempt to save a profile with an `@handle` or a channel URL; confirm rejection with a message naming the expected format.
9. Record the wall-clock time of a 5-competitor run for the p95 note.

## Performance Considerations

Wall-clock time is unbounded for HTTP-triggered Workers and awaiting `fetch()` costs no CPU, so a multi-second analysis is architecturally fine. The real budget is the free plan's **10ms CPU**, consumed by JSON parsing and zod validation of the video records. With the competitor cap of 5 and `TARGET_LONGFORM_PER_CHANNEL = 20`, the worst case is roughly 100 validated records plus the Shorts that were paged through and discarded — comfortably bounded, which is exactly what decision D1's cap bought. Scoring is a single pass per channel plus one sort; `infrastructure.md`'s risk register already prescribes keeping it lightweight, and an overrun would surface as an intermittent Error 1102 rather than a clean failure.

Quota: ~15 units per run at 5 competitors against 10,000/day per Google Cloud project, shared with the existing `yt-niche-adviser` project that backs F-01's OAuth client. That is ~650 runs/day — not a binding constraint at MVP scale, which is why caching is deferred.

## Migration Notes

No schema changes. `channel_profiles` is read as-is; no new table is introduced (S-03 brings `content_opportunities`).

Out-of-band setup required before the feature works in production, in order:
1. Enable **YouTube Data API v3** on the existing `yt-niche-adviser` Google Cloud project and mint an API key.
2. Obtain an Anthropic API key.
3. Add both as GitHub repository secrets so CI builds see them.
4. Set both on the Worker via `wrangler secret put` — **this is the step the CI build cannot verify**, and forgetting it ships a deploy whose Analyze button fails at runtime. The config banner from Phase 1 makes that loud rather than silent.
5. Per `infrastructure.md`'s risk register, do a smoke-test deploy to Workers once Phase 4 lands rather than waiting until the end.

## References

- Internal research: `context/changes/analyze-and-rank-opportunities/research.md` — codebase compatibility, API route conventions, secret plumbing, decisions D1–D4
- External API contract: `context/changes/analyze-and-rank-opportunities/yt-api-docs.md` — call chain, response shapes, Shorts negative result, quota
- External library research: `context/changes/analyze-and-rank-opportunities/yt-library-research.md` — fetch-over-SDK rationale, median-over-mean argument, Workers limits
- Roadmap item: `context/foundation/roadmap.md` — S-02
- PRD requirements: `context/foundation/prd.md` — FR-006 to FR-009, US-01, Guardrails, NFR
- API route pattern to follow: `src/pages/api/profile.ts`
- Prior slice's impl-review (failure patterns not to repeat): `context/changes/channel-profile-crud/reviews/impl-review.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Foundation — secrets, config visibility, shared helpers, test harness

#### Automated

- [ ] 1.1 Lint passes: `npm run lint`
- [ ] 1.2 Build passes: `npm run build`
- [ ] 1.3 Test runner executes: `npm test`

#### Manual

- [ ] 1.4 With no `YOUTUBE_API_KEY`, the dashboard shows a config banner naming YouTube as unconfigured
- [ ] 1.5 Saving a profile with a valid `UC...` competitor ID still succeeds
- [ ] 1.6 `@handle`, a channel URL, or a bare word is rejected with a format message
- [ ] 1.7 Existing profile save flow unchanged after the `jsonError` move

### Phase 2: Scoring core — pure functions and unit tests

#### Automated

- [ ] 2.1 Unit tests pass: `npm test`
- [ ] 2.2 Lint passes: `npm run lint`
- [ ] 2.3 Build passes: `npm run build`

#### Manual

- [ ] 2.4 Every sampling rule decided in planning has a test that would fail if the rule were removed

### Phase 3: YouTube data client

#### Automated

- [ ] 3.1 Lint passes: `npm run lint` (no `no-unsafe-*` violations)
- [ ] 3.2 Build passes: `npm run build`
- [ ] 3.3 Unit tests pass: `npm test`
- [ ] 3.4 `grep -r "search.list\|/search?" src/` returns nothing

#### Manual

- [ ] 3.5 A scratch run against 3–5 real channel IDs returns the expected long-form counts
- [ ] 3.6 A Shorts-heavy channel terminates paging within the window bound
- [ ] 3.7 A well-formed but non-existent ID lands in the unresolved set rather than throwing
- [ ] 3.8 Observed quota for one run is ~15 units at 5 competitors (Google Cloud console)

### Phase 4: Analyze endpoint

#### Automated

- [ ] 4.1 Lint passes: `npm run lint`
- [ ] 4.2 Build passes: `npm run build`
- [ ] 4.3 Unit tests pass: `npm test`

#### Manual

- [ ] 4.4 A valid profile returns 200 with 5 ranked opportunities and justifications
- [ ] 4.5 The same profile analyzed twice returns identical scores and ordering
- [ ] 4.6 An unauthenticated request returns 401 JSON, not HTML
- [ ] 4.7 Rapid clicks trigger 429 with a message naming the limit and retry window
- [ ] 4.8 A profile with one bogus competitor returns a ranking plus an accurate resolved-N-of-M summary
- [ ] 4.9 With `ANTHROPIC_API_KEY` unset, the ranking returns with justifications omitted and the flag set
- [ ] 4.10 With `YOUTUBE_API_KEY` unset, the response is a readable 500 naming the service

### Phase 5: Dashboard UI

#### Automated

- [ ] 5.1 Lint passes: `npm run lint`
- [ ] 5.2 Build passes: `npm run build`
- [ ] 5.3 Unit tests pass: `npm test`
- [ ] 5.4 No stray `cn` package: `grep '"cn"' package.json` returns nothing

#### Manual

- [ ] 5.5 Clicking Analyze shows a loading state, then a ranked list with scores and justifications
- [ ] 5.6 The button is disabled while a run is in flight
- [ ] 5.7 Tripping the rate limit shows a toast naming the limit and retry window
- [ ] 5.8 A bogus competitor shows the ranking plus a visible resolved-N-of-M notice
- [ ] 5.9 With no profile saved, Analyze explains that a profile is needed
- [ ] 5.10 With `ANTHROPIC_API_KEY` unset, the ranking renders with a justifications-unavailable notice
- [ ] 5.11 Stopping the dev server mid-request surfaces a readable connection error, not a silent reset
- [ ] 5.12 Measured p95 for a 5-competitor run is recorded
