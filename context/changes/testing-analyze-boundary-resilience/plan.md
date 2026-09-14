# Analyze-pipeline Boundary Resilience Implementation Plan

## Overview

Phase 1 of `context/foundation/test-plan.md` covers Risks #1 (the LLM
justification boundary) and #2 (the YouTube quota/error boundary). Research
established that both risks are already *largely defended in production code*
and that **none of that behaviour is covered by a single test** — there is no
`justify.test.ts` and no `youtube.test.ts` in the repo.

So this is not a bootstrap. It is a **characterization and gap-closing** phase:
pin the degradation contracts the code already claims in its own comments, and
fix the four places where the claim and the code disagree.

## Current State Analysis

**What holds today** (verified in research, re-verified in this session):

- `opportunities` is materialized with `justification: null` at
  `analyze.ts:166` *before* the LLM call, and the failure branch never
  reassigns it. Scores provably survive a justification failure by
  construction.
- `justifyOpportunities` returns a `JustifyResult` sentinel on every path; the
  catch at `justify.ts:135-148` orders the typed SDK errors most-specific-first
  (`APIConnectionError extends APIError` in this SDK, so the order matters).
- `YouTubeError` carries a discriminated `YouTubeFailure` union
  (`youtube.ts:49-63`); quota and auth are deliberately fatal across the
  `Promise.allSettled` fan-out (`youtube.ts:496-511`) rather than reported as
  one unlucky channel.

**What does not hold** — five gaps. G1–G4 come from research; G5 is new to this
session:

| # | Gap | Where | Risk |
|---|-----|-------|------|
| G1 | An **empty-string** justification is reported as *available* and renders as *nothing* | `analyze.ts:172-178` + `OpportunityList.tsx:62` | #1 |
| G2 | Per-competitor `transport`/`malformed` failures fold into a bare `unresolved: string[]` with no reason code, and the UI then reports them to the user as **"Not found on YouTube"** | `youtube.ts:505-519`, `types.ts:52`, `AnalyzePanel.tsx:141-148` | #2 |
| G3 | **No top-level try/catch** in the route; `analyze.ts:108` re-throws non-`YouTubeError` into Astro's generic 500 **HTML** page, which the client cannot read as `{ error }` | `analyze.ts:46-190` | #1, #2 |
| G4 | `stop_reason: "max_tokens"` is never checked | `justify.ts:123-133` | #1 |
| G5 | Truncated / wrong-shape JSON **throws** `AnthropicError` rather than yielding `parsed_output === null`, so it misses all three typed branches and lands in the generic fallback | `justify.ts:122-148` | #1 |

### The SDK spike (settles research Open Question #1)

Research deferred one question that decided whether this phase touches
production code at all. **Settled: it does not need to.**

`justify.ts:108` constructs `new Anthropic()` **per call**, inside
`justifyOpportunities`. The SDK resolves the transport in the *constructor* —
`client.ts:655` runs `this.fetch = options.fetch ?? Shims.getDefaultFetch()`,
and `getDefaultFetch()` (`internal/shims.ts:11-18`) reads the `fetch` global at
that moment. It is not captured at module import.

Therefore a single `vi.stubGlobal("fetch", …)` installed before the call covers
**both** boundaries. The injectable-`fetch` parameter research held in reserve
is unnecessary, and no mocking library needs installing.

### The SDK spike also corrects research §1

Research asserted that empty `content`, a non-`text` block, truncated JSON, a
prose refusal, and wrong-key JSON *all* funnel into `parsed_output == null`.
**Two of those five do not.**

`messages.parse()` is `create().then(parseMessage)`
(`resources/messages/messages.ts:133-138`). `parseMessage` runs on the raw
message and calls `parseOutputFormat`, which **throws** `AnthropicError` when
`JSON.parse` fails or when the zod `safeParse` fails
(`lib/parser.ts:107-124`, `helpers/zod.ts:24-52`). It never returns `null` for
those.

Consequences, each of which becomes a named test:

- **Truncated JSON** and **wrong-key JSON** → throw. `AnthropicError` is the
  *parent* of `APIError` (`core/error.ts:4-10`), so it matches none of the
  three typed branches and falls to
  `"Justifications could not be generated."` (**G5**)
- `parsed_output === null` is reachable only for an **empty content array** or a
  response carrying **no text block**.
- **G5 does not break the module's headline contract.** Every path still
  returns `ok: false`; nothing escapes as a 500. Only the message is wrong.
- **G4 shrinks.** A `max_tokens` truncation almost certainly yields incomplete
  JSON, which throws. The "silent short array" needs truncation to land exactly
  on a valid closing brace with a schema-conforming shorter array. Real, but far
  narrower than research framed it — it is characterized, not defended against.
- The `stop_reason === "refusal"` check at `justify.ts:123` is **conditionally
  reachable**: it fires when a refusal carries no parseable text block, and is
  pre-empted by the parse throw when it carries prose. The test documents when
  it fires rather than asserting it always does.

### Test-infrastructure baseline

- Five test files, all in `src/lib/services/`, all importing only
  `{ describe, expect, it }` from `vitest`, all using plain relative imports and
  local `Partial<T>` factory fixtures (`scoring.test.ts:16-39`).
- **There is no `vi.*` call anywhere in the suite** — no `vi.mock`, `vi.fn`,
  `vi.stubGlobal`, `beforeEach`, or setup file. Every module tested so far is
  pure and synchronous. This phase introduces the first non-pure test.
- `vitest.config.ts` has `include` only — no environment, no setupFiles, no
  alias, no `getViteConfig()`.
- Vitest 5.0.0, Vite 7.3.6 (pinned via `package.json` `overrides`). No msw,
  nock, sinon, or explicit undici.
- **This worktree has no `node_modules`.**

## Desired End State

When this plan is complete:

- `npm test` runs `justify.test.ts` and `youtube.test.ts` alongside the existing
  five suites, with every external call faked at the `fetch` boundary and the
  real zod schemas, the real SDK decoder, and the real error classification all
  in the exercised path.
- A hostile provider response — garbage, a refusal, a truncated body, a rate
  limit, a connection failure — provably yields the ranked list with its scores
  plus an explicit account of the missing justification. Never a 500, never a
  blank card.
- A justification that is empty or whitespace is reported as **absent**, not as
  available, and the run says so.
- A competitor whose fetch failed is distinguishable in the payload *and on
  screen* from a competitor ID that does not exist on YouTube.
- Any unexpected throw inside `POST /api/analyze` returns `{ error }` JSON with
  a 500, never Astro's HTML error page.
- `context/foundation/test-plan.md` §6.2 and §6.6 carry the pattern this phase
  landed, so the next boundary test has a template.

Verify with `npm test` (all suites green), `npm run lint`, `npm run build`, and
the manual checks named per phase.

### Key Discoveries

- The SDK resolves `fetch` at client-construction time, and `justify.ts`
  constructs per call — `vi.stubGlobal` reaches both boundaries
  (`client.ts:655`, `internal/shims.ts:11-18`, `justify.ts:108`).
- `messages.parse()` parses **before** the caller can inspect `stop_reason`
  (`resources/messages/messages.ts:133-138`), and the parse throws rather than
  nulling (`lib/parser.ts:107-124`).
- `AnthropicError` is the base class, not a subclass, of `APIError`
  (`core/error.ts:4-10`) — which is exactly why G5's cases miss every branch.
- **There are two distinct `unresolved` concepts in `youtube.ts`.**
  `resolveChannelRefs` (`youtube.ts:182-238`) returns one consumed by
  `/api/profile.ts:60-61`; `fetchCompetitorVideos` (`youtube.ts:469-519`)
  returns another consumed by `analyze.ts:114`. **Only the second changes.**
- `AnalyzePanel.tsx:141-148` already renders unresolved ids under the copy
  *"Not found on YouTube"* — so today a transport-failed competitor is actively
  **mis-reported** to the user. G2 is a wrong statement on screen, not merely a
  missing field.
- `saveOpportunitySchema` is already `z.string().max(2000).nullable()`
  (`content-opportunity.ts:33`) and `content-opportunity.test.ts:22` already
  pins the null case — the G1 trim-to-null fix needs no persistence change.
- `Notice` already supports an unused `tone="warning"`
  (`AnalyzePanel.tsx:31-42`) — the new notice needs no new component.
- `getJson` is **not exported** (`youtube.ts:69`), which is the right shape: a
  test must fake `fetch` itself, keeping the real parsing in the path.

## What We're NOT Doing

- **No route-level tests.** `analyze.ts` imports `astro:env/server` and
  `cloudflare:workers` at module scope and uses `@/` for *value* imports; testing
  it needs both virtual modules mocked plus alias config plus a widened
  `include`. We extract the testable logic instead (Phase 3). The route's own
  wiring is verified by hand.
- **No `vitest.config.ts` changes.** Both target modules already live under
  `src/lib/services/**` and neither imports a virtual module. The new helper in
  Phase 3 lands in the same directory deliberately, so `include` still covers it.
- **No mocking library.** Research and the cost × signal rule both point away
  from it, and the spike confirmed stubbing suffices.
- **No changes to `resolveChannelRefs` or `/api/profile.ts`.** Different
  `unresolved`, different consumer, out of scope.
- **No defence against G4.** The spike showed it is near-unreachable; it gets a
  characterization test, not a `stop_reason` guard.
- **No length floor on justifications.** "Non-empty after trim" is the rule; any
  minimum character count would be a number invented here rather than derived
  from the PRD.
- **No UI look-and-feel tests** — §7 of the test plan rules these out. Phase 4's
  notice ships verified by hand.
- **No retry or backoff anywhere.** `maxRetries: 0` on the LLM call is a
  recorded decision (`archive/2026-09-10-.../plan.md:50`); a test must not
  "fix" it.
- **No e2e.** §5's standing trade holds.

## Implementation Approach

Fake the transport, never the parsing. Every test installs a `fetch` that
returns a genuine `Response`, so the real `res.json()`, the real status
branching, the real zod schemas, and the real SDK decoder all stay in the
exercised path — which is exactly the anti-pattern the test plan names for
Risk #1 ("faking the parsing step instead of the transport, so the real parsing
code is never exercised").

Sequence the phases so each one ends green: characterize a boundary, then fix
what the characterization exposed, then move up the chain. Phases 1–3 are
covered by automated tests; Phase 4 is the part that can only be checked by
hand, grouped deliberately so the manual verification happens once.

## Critical Implementation Details

**`vi.stubGlobal` and `unstubGlobals`.** Vitest's `unstubGlobals` defaults to
**false**, so stubs do *not* auto-reset between tests. Either set
`unstubGlobals: true` in `vitest.config.ts` or call `vi.unstubAllGlobals()` in
an `afterEach`. Research assumed the auto-reset was already on; it is not.
Prefer the explicit `afterEach` so the config stays untouched (see
"What We're NOT Doing").

**The fake must return a real `Response`.** The SDK's decoder calls `.json()`,
reads `headers`, and inspects `status` on the object it gets back. A duck-typed
`{ ok, status, json }` will not survive it. Construct
`new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })`.

**A `Response` body is single-use.** A fake that returns the *same* `Response`
instance for two calls fails the second with a "body already read" error.
`youtube.ts` issues three sequential calls per channel
(`channels.list → playlistItems.list → videos.list`), so the fake must build a
fresh `Response` per invocation — a queue of factory functions keyed on the URL
path, not a map of pre-built responses.

**Ordering inside `justify.ts`'s catch.** The new `AnthropicError` branch must
go **after** the three typed branches and **before** the final fallback. Placing
it first would swallow every `APIError`, `RateLimitError`, and
`APIConnectionError`, since all three extend it — the mirror image of the
`APIConnectionError`/`APIError` ordering hazard the file already documents at
`justify.ts:136-138`.

**`justifyOpportunities` short-circuits on an empty array** (`justify.ts:106`)
before constructing the client, so that case must assert the fake `fetch` was
never called — asserting only the return value would pass even if the call went
out.

## Phase 1: Boundary harness and the LLM boundary

### Overview

Establish the faked-transport pattern the rest of the phase and §6.2 will reuse,
characterize every exit from `justifyOpportunities` against a real SDK decode,
and fix the G5 error-routing gap the spike exposed.

### Changes Required

#### 1. The LLM boundary suite

**File**: `src/lib/services/justify.test.ts` (new)

**Intent**: Prove that `justifyOpportunities` degrades to a typed `ok: false` on
every hostile provider response, and that a healthy response maps back onto the
right rows. This is the file that pins the SDK-behaviour assumptions the module
is built on, which is the phase's stated value.

**Contract**: Follows the house style — `describe`/`it`, relative import of
`./justify`, local `Partial<ScoredOpportunity>` factory mirroring
`scoring.test.ts:16-39`, and an injected fixed `now` so prompt ages are
deterministic (`justifyOpportunities` already takes `now` for this reason).
A local helper installs `vi.stubGlobal("fetch", …)` returning a freshly
constructed `Response` per call; `afterEach(() => vi.unstubAllGlobals())`.

Cases, each asserting the `JustifyResult` shape and the exact `message`:

- healthy schema-valid response → `ok: true`, justifications match by
  `video_id`
- response omitting some `video_id`s → `ok: true` with a short array (the
  partial case `analyze.ts:171-175` absorbs)
- **empty `content` array** → `ok: false`, "unreadable response"
- **content with no text block** → `ok: false`, "unreadable response"
- **truncated JSON** → `ok: false` (G5 — message changes in step 2 below)
- **wrong-key JSON** → `ok: false` (G5 — same)
- **`stop_reason: "refusal"` with no parseable text block** → `ok: false`,
  "declined to answer"; a comment records that a refusal carrying prose is
  pre-empted by the parse throw
- **`stop_reason: "max_tokens"` with a schema-valid shorter array** → `ok: true`
  with fewer entries (G4, characterized — a comment records why this is not
  defended against)
- HTTP 429 → "rate limited"; HTTP 500 → "returned an error (HTTP 500)"; a
  `fetch` that rejects → "could not be reached"
- **empty `opportunities`** → `ok: true` with `[]` **and the fake `fetch` never
  called**

#### 2. G5 — the `AnthropicError` branch

**File**: `src/lib/services/justify.ts`

**Intent**: Restore the message the module already intends for an unreadable
response. Truncated and wrong-shape JSON currently throw past all three typed
branches into the generic fallback, so the user is told "Justifications could
not be generated." when the code's own comment says the case is "an unreadable
response."

**Contract**: One new `instanceof Anthropic.AnthropicError` branch inside the
existing catch, returning the same message as the `parsed_output` null check.
Placed after `RateLimitError`, `APIConnectionError`, and `APIError`, before the
final fallback — see "Critical Implementation Details" for why the order is not
negotiable. The comment above the catch is extended to record that `parse()`
decodes before the caller sees `stop_reason`, so a parse failure arrives as a
throw rather than a null.

#### 3. Record the harness decision

**File**: `context/changes/testing-analyze-boundary-resilience/change.md`

**Intent**: Note in the change's own record that Open Question #1 resolved to
"no production transport change needed", with the two file:line citations, so a
future reader does not re-run the spike.

**Contract**: A bullet under `## Notes`.

### Success Criteria

#### Automated Verification

- Dependencies installed in this worktree: `npm ci`
- New suite passes: `npm test`
- All five pre-existing suites still pass: `npm test`
- Linting passes: `npm run lint`

#### Manual Verification

- Confirm the truncated-JSON and wrong-key-JSON tests fail with the *old*
  message before the G5 branch is added — proof the test can fail for the right
  reason, and that G5 is real rather than inferred from reading the SDK

**Implementation Note**: After completing this phase and all automated
verification passes, pause for manual confirmation before proceeding.

---

## Phase 2: The YouTube boundary and reason-coded failures

### Overview

Characterize `getJson`'s error classification and the `allSettled` fatal/local
split, then close G2 by giving the "local" side the reason code it currently
loses.

### Changes Required

#### 1. Reason-coded unresolved competitors

**File**: `src/lib/services/youtube.ts`

**Intent**: A competitor that 5xx'd, one whose payload was malformed, and one
whose ID does not exist on YouTube currently land in the same bare `string[]`.
Give each an explicit reason so the caller — and ultimately the user — can tell
them apart.

**Contract**: `CompetitorVideosResult.unresolved` (`youtube.ts:319`) changes from
`string[]` to an array of `{ channel_id: string; reason: "not_found" | "transport" | "malformed" }`.
The `channels.list` miss at `youtube.ts:488` produces `not_found`; the
`allSettled` local branch at `youtube.ts:516` maps the caught
`YouTubeError.failure.kind` onto `transport` or `malformed`, with any
non-`YouTubeError` rejection falling back to `transport`. The fatal quota/auth
re-throw at `youtube.ts:509-511` is untouched — it is correct and deliberate.
`resolveChannelRefs` (`youtube.ts:182-238`) and its `/api/profile.ts` consumer
are **not** touched; the shape mirrors `SkippedChannel` in `types.ts:30-36` so
the two degradation arrays read alike.

#### 2. The DTO

**File**: `src/types.ts`

**Intent**: Carry the reason to the client, where the distinction actually
matters.

**Contract**: `AnalyzeSummary.unresolved` (`types.ts:52`) takes the new element
type, exported as a named interface alongside `SkippedChannel`. Its doc comment
is rewritten — the current one ("ids that matched no live channel") is now only
one of three reasons.

#### 3. Route call sites

**File**: `src/pages/api/analyze.ts`

**Intent**: Keep the two places that stringify `unresolved` compiling and
accurate.

**Contract**: `analyze.ts:114` passes the new array through unchanged.
`analyze.ts:125`'s `empty_reason` currently reads "could not be found on
YouTube" over every entry; it now names only the `not_found` ones that way and
describes the failed ones as having failed to load. No status-code change — the
all-unresolved case stays a 200 with `empty_reason`.

#### 4. The YouTube boundary suite

**File**: `src/lib/services/youtube.test.ts` (new)

**Intent**: Prove errors are classified rather than collapsed, that quota and
auth are fatal for the whole run while transport and malformed stay local to one
competitor, and that a genuinely empty result is not confused with a failure.

**Contract**: Same harness as Phase 1 — `vi.stubGlobal("fetch", …)` returning a
fresh `Response` per call, dispatching on the URL path so a channel's
`channels → playlistItems → videos` chain can be scripted (see "Critical
Implementation Details" on single-use bodies).

Cases:

- 403 + `reason: "quotaExceeded"` → throws `YouTubeError` with
  `failure.kind === "quota"`
- 403 *without* that reason, and 400, and 401 → `kind: "auth"`
- 500 → `kind: "transport"`, message naming the status
- `fetch` rejecting with a `TimeoutError` `DOMException` → `kind: "transport"`
  with the timeout wording; a plain rejection → the unreachable wording
- a 200 whose body is not JSON → `kind: "malformed"`
- a 200 with `items: []` → **no throw**; treated as a legitimate empty response
- a 200 whose shape fails the zod schema → `kind: "malformed"`
- **fan-out, quota:** three competitors, the second's `playlistItems` returning
  quota → the whole call throws, proving it is not reported as one unlucky
  channel
- **fan-out, local:** three competitors, the second's `playlistItems` returning
  500 → resolves with two `channels` and one `unresolved` entry carrying
  `reason: "transport"`, proving survivors are kept **and** that the failure is
  no longer indistinguishable from a bad ID (this is the Risk #2 assertion)
- a requested id absent from the `channels.list` response → `unresolved` with
  `reason: "not_found"`
- a resolved channel with no `relatedPlaylists.uploads` → also `not_found`
- duplicate and whitespace-padded ids are de-duplicated before any call

### Success Criteria

#### Automated Verification

- New suite passes: `npm test`
- Full suite passes, including Phase 1's: `npm test`
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification

- Run an analysis against a profile containing one valid competitor and one
  syntactically valid but nonexistent `UC…` id; confirm the response's
  `unresolved` entry carries `reason: "not_found"`
- Confirm `/api/profile.ts` still saves a profile with a competitor handle —
  the untouched `resolveChannelRefs` path

**Implementation Note**: Pause for manual confirmation before proceeding.

---

## Phase 3: G1 — extract and fix the justification merge

### Overview

The merge of LLM output onto ranked rows, and the summary flags derived from it,
currently live inline in the route where they cannot be tested. Extract them to
a pure helper, fix the empty-string rule, and cover it.

### Changes Required

#### 1. The merge helper

**File**: `src/lib/services/justification-merge.ts` (new)

**Intent**: Own the decision of which rows got a usable justification and what
the summary should therefore claim. Placed in `src/lib/services/` both because
it is extracted business logic per the project convention and because
`vitest.config.ts`'s `include` already covers that directory — no config change.

**Contract**: A pure function taking the ranked `ScoredOpportunity[]` and the
`JustifyResult`, returning the `AnalyzeOpportunity[]` plus the
`justifications_available` / `justifications_error` pair. Imports nothing from
`astro:env/server` or `cloudflare:workers` and uses relative imports only, so it
stays directly testable.

**The rule this phase changes**: a justification counts as present only when it
is non-empty **after trimming**. `""` and `"   "` become `null`; a single
character counts as present. The trimmed value is *not* substituted for the
original — trimming decides presence, it does not rewrite model output. This
closes the `?? null` / `!== null` chain at `analyze.ts:172-178` that today lets
`""` report as available while `OpportunityList.tsx:62`'s truthy check renders
nothing.

#### 2. Route delegation

**File**: `src/pages/api/analyze.ts`

**Intent**: Replace the inline merge block with a call to the helper, so the
route keeps orchestration and the logic lives where it can be tested.

**Contract**: `analyze.ts:165-186` collapses to constructing `opportunities` and
assigning the two summary fields from the helper's return. The unconfigured-key
branch (`ANTHROPIC_API_KEY` absent) keeps its own message and stays in the
route — it is a configuration decision, not a merge decision.

#### 3. The merge suite

**File**: `src/lib/services/justification-merge.test.ts` (new)

**Intent**: Pin the presence rule and the summary claims. Pure and synchronous —
no `vi.*`, matching the five existing suites.

**Contract**: Cases covering: every row justified → `available: true`, no error;
one row's `video_id` missing from the response → that row `null`,
`available: false`, partial-error message set; **one row returning `""`** →
treated as absent, `available: false` (the G1 regression test); **one row
returning `"   "`** → same; a single-character justification → present;
`ok: false` → every row `null`, `available: false`, the provider's message
carried through verbatim; empty ranked input → empty output, no crash; and that
row order and every scored field survive the merge untouched — the Risk #1
requirement that *the scores survived into the user-visible payload*, which the
test plan names as the thing a "nothing threw" assertion fails to prove.

### Success Criteria

#### Automated Verification

- New suite passes: `npm test`
- Full suite passes: `npm test`
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification

- Run a real analysis with a valid `ANTHROPIC_API_KEY` and confirm the
  opportunity cards still render their justifications and the summary reports
  `justifications_available: true` — proof the extraction preserved the happy
  path, which no unit test can establish

**Implementation Note**: Pause for manual confirmation before proceeding.

---

## Phase 4: Close the user-visible chain

### Overview

Everything remaining sits above the layer the tests reach: the route's last
unguarded exit, the notice that currently mis-reports failed competitors, and
the cookbook entry the test plan is waiting on.

### Changes Required

#### 1. G3 — the top-level catch

**File**: `src/pages/api/analyze.ts`

**Intent**: Guarantee the `{ error }` JSON contract that `AnalyzePanel` already
assumes. Today an unexpected throw from `parseChannelProfile`, `scoreChannel`,
`rankOpportunities`, or the re-throw at `analyze.ts:108` escapes into Astro's
generic SSR handling and returns a 500 **HTML** page; the client's `.json()`
fails and it collapses to `"The analysis failed (HTTP 500)."`
(`AnalyzePanel.tsx:89-92`). This is the closest thing in the codebase to the
"error page" Risk #1 names.

**Contract**: The handler body is wrapped in a try/catch whose catch
`console.error`s the real error — reaching Workers Logs, the project's only
diagnostic channel — and returns `jsonError` with a fixed generic message and a
500. This mirrors the existing `channel_profiles` failure handling at
`analyze.ts:84-89` exactly, including its `eslint-disable-next-line no-console`
comment. The narrow `YouTubeError` catch at `analyze.ts:100-109` stays where it
is; its 429/502 mapping is the specific case and must not be swallowed by the
outer generic one.

#### 2. Split the competitor notice

**File**: `src/components/analyze/AnalyzePanel.tsx`

**Intent**: Stop telling the user that a competitor whose data failed to load
was "not found on YouTube." That sentence is the user-visible form of Risk #2's
confidently-wrong empty state.

**Contract**: The warning `Notice` at `AnalyzePanel.tsx:141-148` partitions
`summary.unresolved` by `reason`. `not_found` entries keep the existing "Not
found on YouTube" copy; `transport` and `malformed` entries render a separate
`tone="warning"` notice saying their data could not be loaded for this run and
the ranking covers the remaining competitors. `Notice` already supports the
warning tone (`AnalyzePanel.tsx:31-42`) — no new component.

#### 3. The cookbook entry

**File**: `context/foundation/test-plan.md`

**Intent**: §6.2 currently reads "TBD — see §3 Phase 1". Fill it in, since this
phase existed partly to produce that pattern.

**Contract**: §6.2 records the pattern: location beside the module under test,
`<module>.test.ts` naming, `vi.stubGlobal("fetch", …)` returning a fresh real
`Response` per call, `vi.unstubAllGlobals()` in `afterEach` (noting that
`unstubGlobals` is off by default), the single-use-body hazard, and the rule
that the fake replaces the transport and never the parsing. It cites
`justify.test.ts` and `youtube.test.ts` as reference tests. §6.6 gains a note on
this phase, including the SDK facts — constructor-time `fetch` resolution and
parse-before-`stop_reason` — that a future reader would otherwise re-derive. §3's
Phase 1 row moves to complete.

### Success Criteria

#### Automated Verification

- Full suite passes: `npm test`
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification

- With `ANTHROPIC_API_KEY` unset, run an analysis: the ranking renders with
  scores and an info notice explaining the missing justifications, and no card
  is blank without explanation
- Force an unexpected throw inside the handler (temporarily, e.g. in
  `parseChannelProfile`) and confirm the browser receives `{ error }` JSON with
  a readable message rather than `"The analysis failed (HTTP 500)."` — then
  revert the forced throw
- With a profile mixing one good competitor, one nonexistent id, and one whose
  fetch is made to fail, confirm two visually distinct warning notices appear
  and neither describes the failed competitor as "not found"
- Confirm the ranking still renders and is usable throughout — Risk #1 and #2
  both require the app to stay up

**Implementation Note**: This is the last phase; confirm all manual checks
before archiving.

---

## Testing Strategy

### Unit Tests

- `justification-merge.test.ts` — the presence rule (`""`, `"   "`, one
  character, missing `video_id`), the summary claims, and that scored fields and
  row order survive the merge.

### Integration Tests

- `justify.test.ts` — every exit from `justifyOpportunities` with the SDK's real
  decoder in the path and the transport faked at `fetch`.
- `youtube.test.ts` — `getJson`'s full classification table, plus the
  `allSettled` fan-out proving quota/auth are fatal for the run while
  transport/malformed stay local and reason-coded.

### Manual Testing Steps

1. `npm ci`, then `npm run dev`.
2. With `ANTHROPIC_API_KEY` unset, run an analysis — expect the full ranking
   plus an info notice, no blank cards.
3. Restore the key, run again — expect justifications on every card and
   `justifications_available: true`.
4. Add a syntactically valid but nonexistent `UC…` competitor — expect the
   "Not found on YouTube" notice naming only that id.
5. Temporarily throw inside the handler — expect readable `{ error }` JSON, not
   the generic HTTP 500 text. Revert.
6. Confirm `/api/profile.ts` still saves a profile by handle.

## Performance Considerations

None. Every change is on a failure path or in test code, except the merge
extraction, which moves existing work without adding any. The recorded
`maxRetries: 0` / no-backoff decisions are preserved precisely because they
protect the ~30s p95 target.

## Migration Notes

`AnalyzeSummary.unresolved` changes shape in Phase 2. It is constructed by the
server and consumed only by `AnalyzePanel` — it is never persisted, so there is
no stored data to migrate. Phases 2 and 4 must land together before a deploy, or
the panel will render `[object Object]` into the notice; a single branch merged
as one unit satisfies this.

## References

- Research: `context/changes/testing-analyze-boundary-resilience/research.md`
- Test plan: `context/foundation/test-plan.md` §2 (Risk Map), §3 Phase 1, §6.2
- House test style: `src/lib/services/scoring.test.ts:16-39`
- Degraded-justification precedent: `src/lib/services/content-opportunity.test.ts:22-25`
- Degradation ladder as originally specified:
  `context/archive/2026-09-10-analyze-and-rank-opportunities/plan.md:295-305`
- No-retry decision: `context/archive/2026-09-10-analyze-and-rank-opportunities/plan.md:50`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Boundary harness and the LLM boundary

#### Automated

- [x] 1.1 Dependencies installed in this worktree: `npm ci` — 1ab7da7
- [x] 1.2 New suite passes: `npm test` — 1ab7da7
- [x] 1.3 All five pre-existing suites still pass: `npm test` — 1ab7da7
- [x] 1.4 Linting passes: `npm run lint` — 1ab7da7

#### Manual

- [x] 1.5 Confirm the truncated-JSON and wrong-key-JSON tests fail with the old message before the G5 branch is added — 1ab7da7

### Phase 2: The YouTube boundary and reason-coded failures

#### Automated

- [x] 2.1 New suite passes: `npm test` — 76ab311
- [x] 2.2 Full suite passes, including Phase 1's: `npm test` — 76ab311
- [x] 2.3 Type checking passes: `npx astro check` — 76ab311
- [x] 2.4 Linting passes: `npm run lint` — 76ab311
- [x] 2.5 Production build succeeds: `npm run build` — 76ab311

#### Manual

- [ ] 2.6 Nonexistent competitor id yields an `unresolved` entry with `reason: "not_found"`
- [ ] 2.7 `/api/profile.ts` still saves a profile with a competitor handle

### Phase 3: G1 — extract and fix the justification merge

#### Automated

- [x] 3.1 New suite passes: `npm test` — 68a5f7b
- [x] 3.2 Full suite passes: `npm test` — 68a5f7b
- [x] 3.3 Type checking passes: `npx astro check` — 68a5f7b
- [x] 3.4 Linting passes: `npm run lint` — 68a5f7b
- [x] 3.5 Production build succeeds: `npm run build` — 68a5f7b

#### Manual

- [ ] 3.6 Real analysis with a valid key still renders justifications and reports `justifications_available: true`

### Phase 4: Close the user-visible chain

#### Automated

- [x] 4.1 Full suite passes: `npm test`
- [x] 4.2 Type checking passes: `npx astro check`
- [x] 4.3 Linting passes: `npm run lint`
- [x] 4.4 Production build succeeds: `npm run build`

#### Manual

- [ ] 4.5 With `ANTHROPIC_API_KEY` unset, the ranking renders with scores and an explanatory notice, no blank cards
- [ ] 4.6 A forced unexpected throw returns readable `{ error }` JSON, not the generic HTTP 500 text (then reverted)
- [ ] 4.7 Mixed profile shows two distinct warning notices, neither calling the failed competitor "not found"
- [ ] 4.8 The ranking renders and stays usable throughout
