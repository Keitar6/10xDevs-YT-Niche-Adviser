---
date: 2026-09-14T00:03:02+02:00
researcher: Mateusz
git_commit: abedb5947fc9e0034eaf0341e14bd23f650f2845
branch: feature/testing-analyze-boundary-resilience
repository: 10xDevs-YT-Niche-Adviser
topic: "Analyze-pipeline boundary resilience — grounding test-plan Risks #1 (LLM justification) and #2 (YouTube quota/errors)"
tags: [research, codebase, analyze, justify, youtube, error-handling, testing, vitest]
status: complete
last_updated: 2026-09-14
last_updated_by: Mateusz
---

# Research: Analyze-pipeline boundary resilience

**Date**: 2026-09-14T00:03:02+02:00
**Researcher**: Mateusz
**Git Commit**: `abedb5947fc9e0034eaf0341e14bd23f650f2845`
**Branch**: `feature/testing-analyze-boundary-resilience`
**Repository**: Keitar6/10xDevs-YT-Niche-Adviser

## Research Question

Ground Phase 1 of `context/foundation/test-plan.md` ("Analyze-pipeline boundary
resilience") in the live codebase. Specifically, the two risks it covers:

- **Risk #1** — the LLM provider returns a malformed, truncated, or refused
  payload for the justification step and the whole Analyze run dies, even though
  the deterministic scores were already computed.
- **Risk #2** — YouTube quota exhaustion or an API error surfaces as a broken
  screen, or as a _confidently empty_ ranking indistinguishable from "these
  competitors published nothing."

Per §1 principle #3 of the test plan, the plan describes _what could fail_;
this document is the ground truth for _where the failure lives_. Scope agreed
with the user before research: both risks, full chain, plus the fake-transport
seam decision that §4 defers to this phase.

## Summary

**The headline finding is that both risks are already largely defended in
production code — and that this changes what Phase 1 should be.** This is not a
bootstrap; it is a _characterization and gap-closing_ phase. The code was written
deliberately against these two failure modes (the archived plan from
2026-09-10 specifies the degradation ladder almost line for line), but **none of
that behaviour is covered by a single test** — there is no `justify.test.ts` and
no `youtube.test.ts` anywhere in the repo.

What holds today:

1. **Scores provably survive a justification failure, by construction.** The
   `opportunities` array is materialized with `justification: null` at
   `analyze.ts:166`, _before_ the LLM is called. The failure branch
   (`analyze.ts:182-183`) only writes `summary.justifications_error` and never
   reassigns `opportunities`. There is no code path where a justification
   failure discards the scored rows.
2. **`justifyOpportunities` cannot throw past the route.** Every branch inside
   returns a `JustifyResult` sentinel; the `catch` at `justify.ts:135-148`
   converts the typed SDK error classes (correctly ordered most-specific-first,
   since `APIConnectionError extends APIError` in this SDK) plus any unknown
   throw into `{ ok: false, message }`.
3. **YouTube errors are classified, never collapsed.** `YouTubeError` carries a
   discriminated `YouTubeFailure` union — `quota | auth | transport | malformed`
   (`youtube.ts:49-63`) — and quota/auth are deliberately fatal across the
   `Promise.allSettled` fan-out rather than being reported as one unlucky
   channel (`youtube.ts:496-511`). `analyze.ts:100-109` maps quota to 429 and
   everything else to 502.

What does **not** hold — four concrete, testable gaps, in priority order:

| #   | Gap                                                                                                                                                                         | Where                                                        | Which risk |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------- |
| G1  | An **empty-string** justification is reported as _available_ and renders as _nothing_                                                                                       | `analyze.ts:174,178` + `OpportunityList.tsx:62`              | #1         |
| G2  | Per-competitor `transport`/`malformed` failures fold into a bare `unresolved: string[]` with **no reason code** — indistinguishable from "this channel ID does not exist"   | `youtube.ts:505-513`, `types.ts` `AnalyzeSummary.unresolved` | #2         |
| G3  | **No top-level try/catch** in the route; `analyze.ts:108` re-throws non-`YouTubeError` into Astro's generic 500 HTML                                                        | `analyze.ts:46-190`                                          | #1, #2     |
| G4  | `stop_reason: "max_tokens"` is **never checked**; a truncation that still yields schema-valid JSON with fewer items looks identical to the model legitimately omitting rows | `justify.ts:123-133`                                         | #1         |

G1 is the sharpest: it is a live defect, not a hypothetical, and it defeats the
exact PRD guardrail ("Analyze never ends in emptiness without explanation") that
the rest of the file works so hard to uphold.

## Detailed Findings

### 1. The LLM justification boundary (`src/lib/services/justify.ts`)

**Transport construction.** The client is built **per call**, inside
`justifyOpportunities`, at `justify.ts:108`:

```ts
const client = new Anthropic({ apiKey, maxRetries: 0, timeout: REQUEST_TIMEOUT_MS });
```

No `fetch`, no `baseURL`. The API key is _not_ read here — it is a parameter,
read upstream from `astro:env/server` at `analyze.ts:11` and passed at
`analyze.ts:169`. `maxRetries: 0` is deliberate and recorded: the archived plan
says _"No retry on the LLM call — one attempt, then degrade. Retrying pushes
against the ~30s p95 target on the slowest path."_

**One batched request for the whole ranking.** `justify.ts:110-121` issues
exactly one `client.messages.parse()` per run, with `buildPrompt`
(`justify.ts:75-91`) concatenating all ranked items (max `TOP_N = 5`) into a
single user message. The file documents why: _"One batched call for the whole
ranking — five separate calls would multiply the latency this step is already
budgeted against."_

**Consequence for testing:** a single bad batch degrades _every_ row at once.
There is no per-item fallback and no partial-batch retry. The only "partial"
case handled is a schema-valid response that omits some `video_id`s, absorbed
by the `Map` lookup at `analyze.ts:171-175`.

**Parsing is delegated to the SDK, not hand-rolled.** This materially changes
the risk. The code does _not_ index `response.content[0].text` and `JSON.parse`
it. It uses `client.messages.parse()` with `zodOutputFormat(justificationsSchema)`
(imported at `justify.ts:10`), so content-block extraction, JSON parsing, and
schema validation all happen inside the SDK, surfacing to this file as just two
fields:

```ts
if (message.stop_reason === "refusal") {
  return { ok: false, message: "The justification service declined to answer." };
}
const parsed = message.parsed_output;
if (!parsed) {
  return { ok: false, message: "The justification service returned an unreadable response." };
}
```

Empty `content` array, non-`text` block type, truncated JSON, a prose refusal,
and wrong-key JSON should _all_ funnel into `parsed_output == null` and return a
clean `ok: false`. **That is an assumption about SDK behaviour that no test in
this repo verifies** — and verifying it is precisely the value Phase 1 adds.

**G4 — the one silent-garbage path.** `stop_reason` is checked only for
`"refusal"` (`justify.ts:123`). If `max_tokens` truncation happens to land
after a complete justification object such that the structured-output machinery
still yields schema-conforming JSON with _fewer_ entries, the function returns
`ok: true` with a short array. Downstream, `analyze.ts:171-175` cannot tell that
apart from the model choosing to omit rows — both produce `justification: null`
for the missing rows. The run is not wrong, but `summary.justifications_error`
will read "only available for some of the ranked videos" when the real cause was
a token budget. Low blast radius, but it is the only path in the module that
produces data rather than an error.

### 2. The YouTube boundary (`src/lib/services/youtube.ts`)

**Transport seam is a single private helper.** All four network-touching
functions funnel through `getJson` (`youtube.ts:69-120`), which uses raw global
`fetch` against a hardcoded `API_BASE` (`youtube.ts:13`). No SDK. `getJson` is
**not exported**, so a test must fake `fetch` itself — which is the right answer
anyway, since it keeps the real zod parsing and the real error classification in
the exercised path.

**Error translation, all inside `getJson`:**

| Upstream condition              | Result                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------ |
| 403 + `reason: "quotaExceeded"` | `YouTubeError{ kind: "quota" }`, message names the Pacific-midnight reset (`youtube.ts:101-106`) |
| 400 / 401 / other 403           | `YouTubeError{ kind: "auth" }` (`youtube.ts:107-112`)                                            |
| any other non-ok status (5xx)   | `YouTubeError{ kind: "transport" }` naming the HTTP status (`youtube.ts:113-116`)                |
| network throw / timeout         | `YouTubeError{ kind: "transport" }`, distinguishing `TimeoutError` by name (`youtube.ts:76-89`)  |
| `res.json()` fails              | `YouTubeError{ kind: "malformed" }` (`youtube.ts:91-96`)                                         |
| 200 with `items: []`            | **no error** — treated as a legitimate empty response                                            |

**Timeout, no retry.** Every request carries
`AbortSignal.timeout(REQUEST_TIMEOUT_MS)` with `REQUEST_TIMEOUT_MS = 10_000`
(`youtube.ts:16-20,78`). There is no retry, no backoff, no manual
`AbortController`.

**Aggregation is `Promise.allSettled` with a deliberate fatal/local split**
(`youtube.ts:496-513`). The code comments state the reasoning directly: quota
and auth _"are properties of the run, not of one competitor: they will hit every
remaining call too, so reporting them as a single unlucky channel would be a
lie. They stay fatal."_ Everything else is _"local to this competitor"_ and gets
pushed into `unresolved`.

**G2 — the confidently-empty gap lives exactly here.** The fatal/local split is
sound, but the "local" side loses all fidelity: `unresolved` is a
`string[]` of bare channel IDs. A competitor that 5xx'd on its `playlistItems`
call, a competitor whose payload was malformed, and a competitor ID that simply
does not exist on YouTube all land in the same array with no reason code. The
route then carries it into `AnalyzeSummary.unresolved` and returns **200 with a
ranking computed over the survivors**. The user sees a ranking that looks
complete over fewer competitors; nothing in the response distinguishes "3 of
your 5 IDs are wrong" from "2 of your competitors' data failed to load this
run." This is Risk #2's "confidently empty" — narrowed from "somewhere in the
fetch layer" to one field.

Note the useful correction to the risk as written: quota exhaustion itself is
**never** silently converted to an empty array. It is always a thrown, typed
error mapped to a 429. The ambiguity is real but it lives one level down, in
per-competitor transport failures.

**Shorts and window ordering** (asked because §2 flags it as an adjacent
unknown): the **time window runs first**, during `playlistItems` paging in
`collectCandidateIds` (`youtube.ts:356-393`, cutoff `MAX_WINDOW_DAYS = 180`),
because durations are not known yet. **Shorts are excluded second**, in
`collectChannelSample` (`youtube.ts:439-455`), once `videos.list` has hydrated
`duration_seconds`, via `isShort` (`scoring.ts:118-120`). `scoreChannel` re-filters
defensively at `scoring.ts:163`. No `videoDuration` API parameter is used.

**Quota economics, recorded in the file** (`youtube.ts:241-248`): the chain is
`channels.list → playlistItems.list → videos.list`, ~3 units each, ~15 units for
a 5-competitor run. `search.list` is never used because at 100 units it would
cap the product at ~20 runs/day.

### 3. The route and the user-visible chain (`src/pages/api/analyze.ts`)

**Only `POST` is exported** (`analyze.ts:46`). **There is no zod schema** — and
that is correct, not an oversight: no request body is read at all. The file
documents it (`analyze.ts:47-48`): _"the run is defined entirely by the caller's
saved profile, so there is nothing to parse and nothing to guard."_ The auth
check is the first statement (`analyze.ts:49-51`), satisfying the CLAUDE.md rule
that `PROTECTED_ROUTES` never covers `/api/*`.

**The full degradation ladder**, matching the archived plan almost exactly:

| Condition                                      | Status | Body                                                                |
| ---------------------------------------------- | ------ | ------------------------------------------------------------------- |
| no session                                     | 401    | `{ error }`                                                         |
| rate limited (5/60s)                           | 429    | `{ error }`                                                         |
| `YOUTUBE_API_KEY` missing / no Supabase client | 500    | `{ error }`                                                         |
| profile read error                             | 500    | `{ error }`                                                         |
| no profile or zero competitors                 | 400    | `{ error }`                                                         |
| `YouTubeError`, `kind === "quota"`             | 429    | `{ error }`                                                         |
| `YouTubeError`, any other kind                 | 502    | `{ error }`                                                         |
| zero resolved / zero scored / zero rankable    | 200    | `AnalyzeResponse` + `summary.empty_reason`                          |
| LLM failed, partial, or unconfigured           | 200    | full ranking, `justification: null`, `summary.justifications_error` |

**G3 — the one hole in that ladder.** The only try/catch in the file is the
narrow one around `fetchCompetitorVideos` (`analyze.ts:100-109`), and it
**re-throws** anything that is not a `YouTubeError` (`analyze.ts:108`). There is
no wrapping try/catch around the handler body. So an unexpected throw from
`parseChannelProfile`, `scoreChannel`, `rankOpportunities`, or the Anthropic SDK
escaping `justifyOpportunities`' guarantee propagates out of `POST` into Astro's
generic SSR error handling — producing a 500 **HTML** page, not the route's
`{ error }` JSON. The client then cannot read `payload.error` and collapses to
the generic `The analysis failed (HTTP 500).` (`AnalyzePanel.tsx:89-92`). This is
the closest thing in the codebase to the "error page" the risk names.

**G1 — the empty-string chain, verified directly in this session.** Three links,
each individually reasonable, combining into a silent failure:

```ts
// analyze.ts:172-175 — `??` substitutes only on null/undefined, so "" passes through
justification: (byVideoId.get(opportunity.video_id) ?? null,
  // analyze.ts:178 — "" !== null, so an empty justification counts as AVAILABLE
  (summary.justifications_available = opportunities.every((o) => o.justification !== null)));
```

```tsx
// OpportunityList.tsx:62 — truthy check, so "" renders nothing at all
{opportunity.justification ? ( ... ) : null}
```

Result: if the model returns `""` for a row, the API reports
`justifications_available: true`, sets no `justifications_error`, and the UI
renders a card with **no explanation and no indication that one is missing**. The
run claims full success. `AnalyzeOpportunity.justification` is typed
`string | null` (`types.ts:26-29`), which cannot express the difference.

**Per-row vs run-level degradation.** `AnalyzeSummary` is rich at the run level
— `justifications_available`, `justifications_error`, `empty_reason`,
`skipped: SkippedChannel[]`, `unresolved: string[]`. What is missing is any
**per-opportunity** degradation field. A single row's missing justification is
invisible in the list; the only signal is the aggregate banner rendered above it
(`AnalyzePanel.tsx:159-161`).

**Empty states are distinguished only by prose.** All three "200 but empty"
cases render through one branch — `Notice tone="info"` with
`result.summary.empty_reason` (`AnalyzePanel.tsx:170-173`). There is no
`empty_reason_kind` enum. This directly collides with the test plan's
anti-pattern for Risk #2: _"Asserting the error message text rather than the
user-visible state class — copy churns, the state class is the contract."_
**Today there is no state class to assert.** A test either asserts prose (the
named anti-pattern) or the phase adds a structured discriminant. That is a
design decision for `/10x-plan`, not something research can settle.

### 4. Test infrastructure — the fake-transport seam

**Existing conventions.** Five test files, all in `src/lib/services/`, all using
only `import { describe, expect, it } from "vitest"` and plain _relative_
imports. Local factory functions with `Partial<T>` overrides are the fixture
style (`scoring.test.ts:16-39`). **There is no `vi.*` call anywhere in the
suite** — no `vi.mock`, no `vi.fn`, no `vi.stubGlobal`, no `beforeEach`, no setup
file. Every module tested so far is pure and synchronous. **Whatever Phase 1
adopts will be a new pattern, not an extension of an existing one.**

**Versions:** Vitest `5.0.0`, Vite `7.3.6` (pinned via a `package.json`
`overrides` entry). No mocking or HTTP-interception library is installed — no
msw, nock, sinon, or explicit undici.

**Import-time blockers — narrower than expected.** A correction worth recording,
because it flips the plan's cost calculus:

- `justify.ts` and `youtube.ts` **do not import `astro:env/server` at all.**
  Both take their API key as a parameter. Their only imports are
  `@anthropic-ai/sdk`, `zod`, and relative `./scoring` / `./youtube-ids`. **Both
  are directly importable under the current Vitest config with no changes.**
- `analyze.ts` imports **two** virtual modules at module scope:
  `astro:env/server` (`analyze.ts:11`) and `cloudflare:workers`
  (`analyze.ts:15`, for the `RATE_LIMITER` binding — `Astro.locals.runtime` was
  removed in Astro 6 / `@astrojs/cloudflare` v13). Testing the route directly
  requires mocking both, or adopting `getViteConfig()`.
- The `@/*` alias is **not configured** in `vitest.config.ts`. It survives today
  only because the sole usage in a tested module is `import type`
  (`content-opportunity.ts:2`), which is erased. `analyze.ts` uses `@/` for
  _value_ imports, so route-level tests need alias config.
- `include` is scoped to `src/lib/services/**/*.test.ts`, so any test outside
  that directory is silently not run.

**The seam decision (§4's deferred question).** Two viable options, and the
cheap one may cover both boundaries:

- **`youtube.ts`: `vi.stubGlobal("fetch", ...)` is a clean fit.** `getJson` calls
  global `fetch` directly, so stubbing it exercises the real zod schemas, the
  real status/reason classification, and the real `allSettled` fan-out. Vitest's
  `unstubGlobals: true` auto-resets between tests. This satisfies the
  "fake the transport, not the parsing" rule exactly.
- **`justify.ts`: the Anthropic SDK constructor accepts a `fetch` option.**
  Confirmed against current SDK docs (Context7, `/anthropics/anthropic-sdk-typescript`),
  which show this exact pattern in the SDK's own test suite:
  ```ts
  const client = new Anthropic({ baseURL, apiKey, fetch: (url) => Promise.resolve(new Response(...)) });
  ```
  Injecting a fake `fetch` keeps the SDK's real decoding _and_ `justify.ts`'s
  real `parsed_output` / `stop_reason` handling in the path — the only way to
  actually test G4 and the SDK-behaviour assumptions in §1.
- **Open question the plan must settle empirically:** the SDK dropped
  `node-fetch` and now relies on the built-in Web fetch API with zero
  dependencies. **If it resolves `globalThis.fetch` at request time rather than
  capturing it at import time, then a single `vi.stubGlobal("fetch", ...)` covers
  both boundaries with zero production-code changes.** If it captures at import,
  `justify.ts` needs a small injectable-`fetch` parameter added. A ~10-line spike
  settles this and decides whether Phase 1 touches production code at all.

Either way, **no mocking library needs to be installed** — which is the answer
the cost × signal rule (§1 principle 1) points to.

## Code References

- [`src/lib/services/justify.ts:108`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/abedb5947fc9e0034eaf0341e14bd23f650f2845/src/lib/services/justify.ts#L108) — per-call `new Anthropic({ apiKey, maxRetries: 0, timeout })`; the transport seam, currently not injectable
- [`src/lib/services/justify.ts:110-134`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/abedb5947fc9e0034eaf0341e14bd23f650f2845/src/lib/services/justify.ts#L110-L134) — the one batched `messages.parse` call, `stop_reason === "refusal"` check, `parsed_output` null check (**G4** lives here)
- [`src/lib/services/justify.ts:135-148`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/abedb5947fc9e0034eaf0341e14bd23f650f2845/src/lib/services/justify.ts#L135-L148) — typed SDK error catch, most-specific-first ordering
- [`src/lib/services/justify.ts:56-61`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/abedb5947fc9e0034eaf0341e14bd23f650f2845/src/lib/services/justify.ts#L56-L61) — `Justification` / `JustifyResult` discriminated union
- [`src/lib/services/youtube.ts:69-120`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/abedb5947fc9e0034eaf0341e14bd23f650f2845/src/lib/services/youtube.ts#L69-L120) — `getJson`, the single private transport funnel and all error classification
- [`src/lib/services/youtube.ts:49-63`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/abedb5947fc9e0034eaf0341e14bd23f650f2845/src/lib/services/youtube.ts#L49-L63) — `YouTubeFailure` union and `YouTubeError` class
- [`src/lib/services/youtube.ts:496-513`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/abedb5947fc9e0034eaf0341e14bd23f650f2845/src/lib/services/youtube.ts#L496-L513) — `Promise.allSettled` fan-out; quota/auth fatal, everything else into `unresolved` (**G2**)
- [`src/lib/services/youtube.ts:356-393`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/abedb5947fc9e0034eaf0341e14bd23f650f2845/src/lib/services/youtube.ts#L356-L393) — window cutoff applied during paging (runs **first**)
- [`src/lib/services/youtube.ts:439-455`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/abedb5947fc9e0034eaf0341e14bd23f650f2845/src/lib/services/youtube.ts#L439-L455) — Shorts exclusion after duration hydration (runs **second**)
- [`src/pages/api/analyze.ts:166`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/abedb5947fc9e0034eaf0341e14bd23f650f2845/src/pages/api/analyze.ts#L166) — `opportunities` materialized with `justification: null` **before** the LLM call; why scores survive
- [`src/pages/api/analyze.ts:172-178`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/abedb5947fc9e0034eaf0341e14bd23f650f2845/src/pages/api/analyze.ts#L172-L178) — `?? null` and `!== null` (**G1**, links 1 and 2)
- [`src/pages/api/analyze.ts:100-109`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/abedb5947fc9e0034eaf0341e14bd23f650f2845/src/pages/api/analyze.ts#L100-L109) — the only try/catch; line 108 re-throws non-`YouTubeError` (**G3**)
- [`src/pages/api/analyze.ts:11`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/abedb5947fc9e0034eaf0341e14bd23f650f2845/src/pages/api/analyze.ts#L11) and [`:15`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/abedb5947fc9e0034eaf0341e14bd23f650f2845/src/pages/api/analyze.ts#L15) — the two virtual-module imports that block direct route testing
- [`src/components/analyze/OpportunityList.tsx:62`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/abedb5947fc9e0034eaf0341e14bd23f650f2845/src/components/analyze/OpportunityList.tsx#L62) — truthy check that renders nothing for `""` (**G1**, link 3)
- [`src/components/analyze/AnalyzePanel.tsx:89-92`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/abedb5947fc9e0034eaf0341e14bd23f650f2845/src/components/analyze/AnalyzePanel.tsx#L89-L92) — non-2xx handling; falls back to generic text when the body is not JSON
- [`src/components/analyze/AnalyzePanel.tsx:170-173`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/abedb5947fc9e0034eaf0341e14bd23f650f2845/src/components/analyze/AnalyzePanel.tsx#L170-L173) — all three empty states render through one `Notice`, differentiated only by prose
- [`src/types.ts:26-66`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/abedb5947fc9e0034eaf0341e14bd23f650f2845/src/types.ts#L26-L66) — `AnalyzeOpportunity`, `AnalyzeSummary`, `AnalyzeResponse`
- [`vitest.config.ts`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/abedb5947fc9e0034eaf0341e14bd23f650f2845/vitest.config.ts) — `include` only; no environment, no setupFiles, no alias, no `getViteConfig()`
- [`src/lib/services/scoring.test.ts:16-39`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/abedb5947fc9e0034eaf0341e14bd23f650f2845/src/lib/services/scoring.test.ts#L16-L39) — the house fixture-factory style to follow
- [`src/lib/services/content-opportunity.test.ts:22-25`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/abedb5947fc9e0034eaf0341e14bd23f650f2845/src/lib/services/content-opportunity.test.ts#L22-L25) — the existing "degraded-Anthropic" null-justification precedent

## Architecture Insights

- **Degradation is a first-class design concern, and it is documented in-line.**
  `justify.ts:4-7` states the module's contract outright: _"the only step in the
  analysis that is allowed to fail without failing the run… nothing thrown from
  this module ever reaches the user as a 500."_ `analyze.ts:1-8` states the
  route's: _"A click never ends in unexplained emptiness — that is a PRD
  guardrail, not a nicety."_ The tests Phase 1 writes should be read as
  _pinning contracts the code already claims_, which is a much stronger framing
  than "adding coverage."
- **The Result-type pattern is used at exactly one boundary.** `justifyOpportunities`
  returns `{ ok }` instead of throwing, which is why the caller needs no
  try/catch. `fetchCompetitorVideos` does the opposite — it throws a typed
  error. Both are defensible, but the asymmetry means a test author must not
  assume one style from having seen the other.
- **"Fatal vs local" is the real error-handling axis in the YouTube layer**, and
  it is chosen per failure _kind_, not per call site. Quota and auth are
  properties of the run; transport and malformed are properties of one
  competitor. The design is right; the loss of fidelity on the "local" side
  (G2) is the bug.
- **Run-level degradation signals are rich; per-row signals do not exist.** This
  single asymmetry generates both G1 and the invisible-missing-justification
  behaviour. Any fix for G1 will probably want a per-row discriminant, which is
  a DTO change, not just a guard.
- **The codebase pins Astro 6 / Cloudflare v13 migration hazards in comments**
  (`analyze.ts:12-14` on `locals.runtime` removal; `justify.ts:114-119` on
  `budget_tokens` and assistant-prefill both returning 400 on this model
  family). These are exactly the details a test that constructs fake contexts or
  fake responses must respect.

## Historical Context (from prior changes)

- `context/archive/2026-09-10-analyze-and-rank-opportunities/plan.md:295-305` —
  the **eight-step degradation ladder** the route implements today, specified in
  advance. Step 8 reads: _"LLM failure → 200 with the full ranking,
  justifications omitted, and a flag the UI renders as a notice."_ Phase 1 is
  testing a contract that was written down before the code.
- `.../plan.md:50` — _"No retry on the LLM call — one attempt, then degrade."_
  A deliberate decision, not an omission; a test must not "fix" `maxRetries: 0`.
- `.../plan.md:285` — the typed-error-chain ordering requirement, including the
  note that `APIStatusError` is the _Python_ SDK's name and does not exist here.
- `.../plan.md:233` — _"Errors are classified rather than collapsed: HTTP 403
  carrying `quotaExceeded` is distinguishable by the caller from a transport
  failure or a malformed response, because FR-009 requires the quota case to
  produce its own readable message."_
- `.../research.md:306-311` — errors surface as a **toast** (per-run) and are
  deliberately kept distinct from the persistent config **banner**
  (`src/lib/config-status.ts` → `Layout.astro`) for missing keys, because
  _"a toast cannot do this job, since it only fires if someone clicks Analyze."_
- `.../research.md:264-284` — origin of the PRD's **mean → median** correction
  (decision D2, 2026-09-11), citing the breakdown-point argument; PRD FR-008 and
  `roadmap.md:32` were both amended. Relevant to Phase 3, not Phase 1, but it is
  the answer to where that note came from.
- `src/lib/services/content-opportunity.test.ts:22-25` — the degraded case is
  already honoured downstream at the persistence boundary: a `null` justification
  must not fail `saveOpportunitySchema`.

## Related Research

- `context/foundation/test-plan.md` §2–§3 — the risk map and the phase
  definition this document grounds. §6.2 ("Adding a boundary test around an
  external provider") is currently `TBD — see §3 Phase 1` and should be filled
  in from whatever pattern this phase lands.
- `context/archive/2026-09-10-analyze-and-rank-opportunities/research.md` — the
  original exploration behind the pipeline.
- `context/archive/2026-09-13-save-and-view-opportunities/plan.md` — downstream
  persistence of a degraded (null-justification) opportunity.

## Open Questions

1. **Does the Anthropic SDK resolve `globalThis.fetch` at request time or
   capture it at import time?** This single fact decides whether Phase 1 touches
   production code at all. If request-time, one `vi.stubGlobal("fetch", …)`
   covers both boundaries. If import-time, `justify.ts` needs an injectable
   `fetch` parameter threaded through `justifyOpportunities`. Settle with a
   ~10-line spike before planning the test files.
2. **Is G1 (empty-string justification) fixed in this phase or only
   characterized?** Phase 1 is scoped as a _testing_ phase, but G1 is a live
   defect with a two-line fix (treat `""` as absent at `analyze.ts:174`). The
   test plan gives no guidance on test phases that uncover production bugs.
   Recommendation: fix it here, because a test asserting the current behaviour
   would be pinning a defect.
3. **Does G2 get a structured reason code, or does Phase 1 assert prose?** The
   test plan's own anti-pattern for Risk #2 forbids asserting message text, but
   there is currently no state class to assert instead. Either the phase adds a
   discriminant to `unresolved` / `empty_reason` (a DTO change with UI
   consequences), or it knowingly violates its own anti-pattern. This is the
   largest scope decision facing `/10x-plan`.
4. **How far up the chain does Phase 1 test?** Testing `justify.ts` and
   `youtube.ts` directly is nearly free — no virtual modules, no alias needed.
   Testing `analyze.ts` (where G1 and G3 actually live) requires mocking
   `astro:env/server` _and_ `cloudflare:workers`, plus alias config and a
   widened `include`. The cheap tests do not reach the gaps; the tests that reach
   the gaps carry the config cost. Worth an explicit decision rather than drift.
5. **Should G3 be closed with a top-level try/catch?** It is a small change with
   a clear benefit (guaranteeing the `{ error }` JSON contract the client
   already assumes), but it is production hardening inside a testing phase —
   same category question as G1.
