# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-09-14

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the team
   is worried about X, and the failure would surface somewhere in <area>"
   carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/`, `supabase/`,
`.github/`, root runtime config. Excluded: `context/`, `.claude/`, docs,
lockfiles, build output. 36 commits in the last 30 days — sufficient signal.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|---|---|---|---|
| 1 | The LLM provider returns a malformed, truncated, or refused payload for the justification step, and the whole Analyze run dies — the user gets an error or a blank screen even though the deterministic scores were already computed | High | High | interview Q1 (stated top worry), interview Q4; PRD Guardrails ("Analyze never ends in emptiness without explanation"); PRD NFR separating the deterministic score from the non-deterministic justification; hot-spot dir `src/lib/services/` — 24 commits/30d |
| 2 | YouTube quota exhaustion or an API error surfaces as a broken screen, or as a *confidently empty* ranking indistinguishable from "these competitors published nothing" | High | Medium | PRD Guardrails (graceful degradation), PRD FR-006 resolution note; roadmap S-02 Unknowns — 10 000 units/day shared per Google Cloud project, "in practice still unverified"; interview Q4 |
| 3 | One user reads, modifies, or deletes another user's channel profile, saved opportunities, or avatar object | High | Medium | PRD Guardrails ("no leak of saved opportunities between accounts"), FR-002, Access Control; PRD NFR explicitly requires isolation to be *verifiable by test* and no such test exists; `context/archive/2026-09-09-channel-profile-data-model/plan.md` and `context/archive/2026-09-13-save-and-view-opportunities/plan.md` — the owner-scoped policy pattern was replicated across two tables and a storage bucket in four separate migrations |
| 4 | A logged-out caller, or a caller acting for someone else, reaches a data-touching API route directly and receives data or performs a mutation | High | Medium | `CLAUDE.md` hard rule: the middleware's protected-route list covers page requests only and never covers API routes, so every API route must resolve the caller itself; hot-spot dirs `src/pages/api/auth/` — 28 commits/30d and `src/pages/api/` — 10 commits/30d; three new data-touching routes landed late in milestone M-1 per `context/foundation/roadmap.md` |
| 5 | The scoring rule drifts from the PRD definition and the ranking looks plausible but is wrong — an invisible failure, worse than no ranking at all | High | Medium | PRD FR-007 (Shorts excluded), PRD FR-008 including the recorded mean-to-median correction and its rationale, PRD NFR (repeatability of the computational core); interview Q3 ("the analyze pipeline" — changed often without confidence); hot-spot dir `src/lib/services/` — 24 commits/30d |

Ordering note: Risk #1 is the only High × High — it is both the stated top
worry and sits on the highest-churn value chain. Risk #3 leads the High ×
Medium group because the PRD does not merely imply a test, it names one as a
non-functional requirement, and the blast radius is a data breach rather
than a broken screen.

Deliberately excluded from this map, with reasons, so they are not
re-litigated: repeated Analyze fires draining the shared daily quota (real
impact, but defending it requires adding a rate guard first, so a test would
have to invent its own subject — tracked as observability under Risk #2);
secrets leaking into the client bundle (structural, handled by the
server-only env boundary, no evidence of exposure — a gate concern, see §5);
avatar upload validation and image-generation prompt handling (genuine
untrusted-input surfaces, but the capability is nice-to-have and the blast
radius is the user's own avatar — see §7).

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | With credentials present and the provider returning garbage, a refusal, or a truncated body, the user still receives the ranked list with its scores plus an explicit account of the missing justification — never a server error, never a blank screen, never a fabricated sentence | "The missing-credential degradation path proves the provider path is safe." It does not: the missing-credential path short-circuits *before* the call, while a bad payload fails *after* it, during parsing. Also: a 200 response with an unexpected shape may not raise at all | Where the provider response is parsed and what shape is assumed; whether justifications are requested in one batch for all ranked items, in which case a single bad batch may poison every row; whether a parse failure propagates into the response status; what the interface renders for an absent, null, or empty justification | integration, with the provider transport faked and no network | Faking the parsing step instead of the transport, so the real parsing code is never exercised. Asserting only that nothing threw, without asserting that the scores survived into the user-visible payload |
| #2 | On quota-exceeded, server-error, timeout, and genuinely-empty results, the user sees a readable and *distinct* explanation and the app stays up; a partial failure across the competitor list does not silently produce a ranking that looks complete | "An empty response means the competitors published nothing." It may mean the shared quota died. Conflating the two produces a confidently wrong empty state | How upstream errors are translated toward the user; whether per-competitor failures aggregate or fail fast; whether the time-window filter runs before or after the Shorts filter | integration on the fetch and aggregation layer, with faked HTTP responses | Asserting the error *message text* rather than the user-visible state class — copy churns, the state class is the contract |
| #3 | An authenticated user cannot read, update, or delete another user's profile, saved opportunities, or avatar object — and every denied write provably leaves the targeted row intact | "Row-level security is enabled, therefore isolation holds." Enabled is not correct: a policy can be missing for a single verb, and the anonymous and authenticated roles carry different grants. Also: "the application always filters by owner, so the database policy is belt-and-braces" — that inverts which layer is the guarantee | The actual policy set per table and *per verb* across all four migrations; whether the storage bucket carries owner-scoped policies; whether any server path uses a privileged key that bypasses policies entirely | database-level policy tests, run through the Supabase CLI — no application stack required | Asserting only that the stranger's read returns nothing. Matching zero rows is not proof on its own; pair every denied write with a check that the row it targeted is unchanged |
| #4 | Every API route that touches user data rejects a caller with no session, returns no data in the rejection body, and derives ownership from the resolved session rather than from client-supplied input | "The middleware protects it." The project rules state plainly that it does not for API routes. Also: a route taking an owner identifier from the request body is the ownership-bypass vector, not a convenience | The full route inventory and which routes actually resolve the caller; which, if any, accept an owner identifier from the client | table-driven route tests, one case per route, no database | Testing one representative route and assuming the rest follow. Exhaustiveness across the inventory is the entire value of this test |
| #5 | The score equals views divided by the channel's median over the window; Shorts are excluded; the ranking sorts descending; identical input yields identical output *and* identical order | **The oracle.** Existing assertions may have been captured from the implementation's own output — such a test can never fail for the right reason. Also: "the median is implemented" — an even-count median, a single-video channel, and a zero median (division by zero) are the cases that actually decide correctness | Where Shorts exclusion actually happens; how the time window is bounded; the behaviour when a channel's median is zero or the channel has one qualifying video | unit, on hand-written fixtures whose expected values are computed from the PRD formula by hand | Snapshot assertions over the ranking output. A snapshot records whatever the code does today, bugs included, and is the purest form of the oracle problem |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Analyze-pipeline boundary resilience | Prove a hostile or broken external response degrades into a ranking plus an explanation, never an error page or a blank screen | #1, #2 | integration | complete | `testing-analyze-boundary-resilience` |
| 2 | Provable per-user isolation | Discharge the PRD requirement that isolation be verifiable by test, across both tables and the storage bucket, and close the unauthenticated-route surface | #3, #4 | database policy tests + route integration | not started | — |
| 3 | Scoring oracle and spec conformance | Prove the number means what the PRD says it means, and that the existing suite is able to fail for the right reason | #5 | unit | not started | — |
| 4 | Quality-gates wiring | Lock the floor the first three phases established | cross-cutting | gates | not started | — |

Order rationale: Phase 1 defends the stated top worry on the highest-churn
value chain. Phase 2 follows because it discharges a written non-functional
requirement whose failure is a data breach. Phase 3 is third because a
partial suite already exists — this is an audit and extension, not a
bootstrap. Phase 4 is last and deliberately thin: gates can only lock a
floor that the earlier phases have built.

## 4. Stack

The classic test base for this project. AI-native tools carry a `checked:`
date so future readers can see which lines need re-verification.

| Layer | Tool | Version | Notes |
|---|---|---|---|
| unit + integration | Vitest | 5.0 | Configured. `include` in `vitest.config.ts` is scoped to `src/lib/services/**/*.test.ts` only, and §3 Phase 1 deliberately left it that way — the boundary suites and the extracted merge helper were placed in that directory so no config change was needed. Eight test files now exist, all in that one directory |
| network / boundary faking | Vitest built-in (`vi.stubGlobal`) | 5.0 | Settled by §3 Phase 1 under the cost × signal rule: no mocking library installed. The pattern — a real `Response` built fresh per call, `vi.unstubAllGlobals()` in `afterEach` — is written up in §6.2 |
| database / policy tests | Supabase CLI (pgTAP, `supabase test db`) | 2.116 | CLI is already a devDependency; needs Docker locally. No tests written yet — see §3 Phase 2 |
| typecheck | `@astrojs/check` | 0.9.8 | Installed, but there is no script for it and CI never runs one — see §3 Phase 4 |
| lint | ESLint, type-checked rules | 9.29 | Wired in three places: pre-commit via husky and lint-staged, and in CI |
| Astro component rendering | Container API (experimental) | Astro 6.3 | Available but not planned. Astro 6 removed rendering of Astro components in client test environments — such tests must run in a `node` environment. §7 rules out UI look-and-feel testing, so this stays unused |
| e2e | none — deliberately out of scope | — | No browser automation available in the current session, and §7 plus cost × signal keep e2e out unless a top risk is shown to be unreachable at a cheaper layer. See §5 for the standing trade |
| (optional) AI-native: judge model over justification quality | deferred — checked: 2026-09-13 | n/a | The PRD's secondary success criterion asks that the justification be good enough to act on, which no deterministic assertion expresses. Deferred because it needs its own evaluation harness against a non-blocking criterion. **When NOT to use:** never over the score, the ordering, or the error paths — those are deterministic, and an assertion is strictly better than a judge there. Promote only if users report rankings that are numerically right but useless to read |

**Stack grounding tools (current session):**
- Docs: Context7 — used. Confirmed that Astro 6 requires a `node` test environment for Container API rendering and exposes `getViteConfig()` for inheriting project config; confirmed that Supabase tests row-level security with pgTAP via `supabase test db`, and that its own guidance warns an emptiness assertion is not proof unless paired with a row-intactness check; checked: 2026-09-13
- Search: Exa.ai — available, not needed; local manifests and Context7 covered every stack question; checked: 2026-09-13
- Runtime/browser: none — no browser automation exposed in this session; noted as a constraint on the e2e trade in §5, not a blocker; checked: 2026-09-13
- Provider/platform: Linear and Notion MCPs available (issue tracking, no quality-gate relevance). No GitHub, Supabase, or Cloudflare MCP — the `gh`, `supabase`, and `wrangler` CLIs stand in for them; checked: 2026-09-13

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required after §3 Phase N" means the gate is enforced once that rollout
phase lands; before that, the gate is planned.

| Gate | Where | Required? | Catches |
|---|---|---|---|
| lint | local pre-commit + CI | required (wired) | syntactic and type-rule drift |
| typecheck | CI | required after §3 Phase 4 | type drift across the SSR and island boundary |
| unit + integration | local + CI | required (wired) | logic regressions, and from §3 Phase 1 onward boundary-failure regressions |
| database policy tests | local; CI placement decided in §3 Phase 4 | required after §3 Phase 2 | cross-account data exposure |
| build | CI | required (wired) | runtime build breakage before deploy |
| e2e on critical flows | not wired | deliberately deferred — see §7 | broken critical user paths end to end |
| pre-prod smoke | between merge and production | optional | runtime-only failures that local development on Node cannot reproduce, flagged as a real divergence in `context/foundation/infrastructure.md` |

Two standing trades are recorded here rather than hidden. First, e2e is a
normally-required gate that this rollout does not wire: the interview ruled
out infrastructure over-investment, and Phases 1 through 3 attack every top
risk at a cheaper layer. Revisit if a top risk is shown to be unreachable
below the browser, or if a regression reaches users through a path no
cheaper test could have covered. Second, database policy tests need Docker,
so whether they run in CI or remain a local gate is an explicit decision
deferred to Phase 4 rather than assumed now.

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once the
relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase N."

### 6.1 Adding a unit test to a service module

- **Location**: `src/lib/services/`, beside the module under test.
- **Naming**: `<module>.test.ts`.
- **Reference test**: `src/lib/services/scoring.test.ts`.
- **Run locally**: `npm test`.
- **Caveat until §3 Phase 3 lands**: the existing assertions have not been
  audited for the oracle problem. Before copying one as a template, confirm
  its expected values were derived from the PRD, not captured from a run.

### 6.2 Adding a boundary test around an external provider

- **Location**: `src/lib/services/`, beside the module under test.
- **Naming**: `<module>.test.ts`.
- **Reference tests**: `src/lib/services/youtube.test.ts` (raw `fetch`),
  `src/lib/services/justify.test.ts` (through the Anthropic SDK).
- **Run locally**: `npm test`.
- **No mocking library.** `vi.stubGlobal("fetch", …)` reaches both boundaries;
  nothing needs installing. Do not add msw, nock, or sinon for this.

**The rule: fake the transport, never the parsing.** The stub returns a
genuine `new Response(body, { status, headers })`, so the real `res.json()`,
the real zod schemas, the real status/reason classification, and (for the SDK)
the real decoder all stay in the exercised path. A test that fakes the parsed
result instead never exercises the code that decides what the user sees, which
is the one thing worth testing at a boundary.

Four hazards, each of which cost time the first time:

1. **`unstubGlobals` defaults to `false`.** Stubs do *not* reset between tests.
   Add `afterEach(() => vi.unstubAllGlobals())` — do not assume the config does
   it.
2. **A `Response` body is single-use.** Build a fresh `Response` *inside* the
   stub handler on each call. A pre-built instance reused across the chain
   fails the second read with "body already used". `youtube.ts` issues three
   sequential calls per channel, so this bites immediately.
3. **Set `content-type: application/json`.** The Anthropic SDK decides between
   JSON and text on that header alone; without it the body arrives as a string
   and the failure is confusing rather than informative.
4. **A duck-typed `{ ok, status, json }` will not do.** Both boundaries read
   `headers` and call real `Response` methods.

Assert the **state class, not the message text** wherever one exists — for
YouTube that is `YouTubeError.failure.kind` and the `reason` on each
`unresolved` entry. Where the only signal is prose, that is a design gap to
close rather than a string to assert.

And assert that *the good data survived*: a boundary test that only proves
nothing threw would pass even if the scores had been dropped on the way out.

### 6.3 Adding a per-owner isolation test for a table or bucket

- TBD — see §3 Phase 2, for the pattern that proves a stranger's read
  returns nothing *and* their denied write left the owner's row intact.

### 6.4 Adding a test for a new API route

- TBD — see §3 Phase 2, for the pattern that proves a route rejects a
  caller with no session and takes ownership from the session rather than
  from the request.

### 6.5 Changing or extending the scoring rule

- TBD — see §3 Phase 3, for the pattern that derives expected values
  from the PRD formula by hand and covers the median edge cases.

### 6.6 Per-rollout-phase notes

**Phase 1 — Analyze-pipeline boundary resilience (landed 2026-09-14).**

The phase found both risks already largely defended in production code and
none of it tested, so it ran as characterization plus gap-closing rather than
as a bootstrap. 43 tests added across three new files; the suite went from 67
to 110.

Two SDK facts are recorded here because they are expensive to re-derive and
neither is in the SDK's own documentation:

- **The Anthropic SDK resolves `fetch` in the client *constructor***
  (`client.ts` → `Shims.getDefaultFetch()`), not at module import. Because
  `justify.ts` constructs its client per call, `vi.stubGlobal` reaches it with
  no production seam. This is why §4's "network / boundary faking" row needs no
  tool.
- **`messages.parse()` decodes *before* the caller sees `stop_reason`**, and
  the structured-output parse *throws* `AnthropicError` on malformed or
  off-schema JSON rather than returning `parsed_output: null`. Since
  `AnthropicError` is the *parent* of `APIError`, such a failure matches none
  of the typed error branches. `justify.ts` gained an explicit branch for it.
  A corollary: a refusal carrying prose is pre-empted by the parse throw, so
  the `stop_reason === "refusal"` check fires only when there is no parseable
  text block.

Three live defects were fixed rather than pinned, on the principle that a test
asserting current behaviour would have pinned a defect:

- An empty or whitespace-only justification was reported as *available* and
  rendered as nothing. Presence is now decided on the trimmed value, in an
  extracted `justification-merge.ts` that is testable without the route's
  virtual modules.
- Per-competitor transport and malformed failures folded into a bare
  `unresolved: string[]`, and the interface then told the user those channels
  were "Not found on YouTube" — a confident, wrong statement about a channel
  that exists. Entries now carry a `reason` discriminant and the interface
  renders the two cases separately.
- The route had no top-level try/catch, so an unexpected throw returned a 500
  *HTML* page that the island could not read as `{ error }`.

Deliberately not done: no route-level tests (the route needs `astro:env/server`
*and* `cloudflare:workers` mocked plus alias config; the testable logic was
extracted instead), and no `stop_reason: "max_tokens"` guard — with the parse
throwing on truncated output, the silent-short-array case is near-unreachable
and is characterized rather than defended.

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **UI look and feel, including the vendored primitives under
  `src/components/ui/`** — presentational, and upstream's responsibility for
  the primitives. Note that this consciously excludes the single largest
  churn cluster in the scan (`src/components/auth/` — 48 commits/30d), which
  is the recent auth-dialog rewrite. Re-evaluate if a visual regression
  reaches users. (Source: Phase 2 interview Q5.)
- **Configuration as a subject of tests** — do not write tests asserting
  that config files contain particular values. Re-evaluate if a
  misconfiguration causes a production incident. (Source: Phase 2 interview
  Q5.)
- **Test infrastructure beyond what a named risk demands** — no e2e runner,
  no visual diffing, no browser automation unless a top risk is shown to be
  unreachable at a cheaper layer. (Source: Phase 2 interview Q5, reinforced
  by §1 principle 1.)
- **Avatar upload validation and image-generation prompt handling** — real
  untrusted-input surfaces, but the capability is nice-to-have and the blast
  radius is the user's own avatar. Re-evaluate if the avatar is promoted to
  must-have or the storage bucket becomes shared between users. (Source:
  Phase 3 challenger pass.)
- **Analyze latency as a test subject** — the measured p95 of roughly 11.2s
  is already tracked as a parked roadmap item with a diagnosed lever. This
  belongs to observability, not to the suite. (Source:
  `context/foundation/roadmap.md`, Parked.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-09-13
- Stack versions last verified: 2026-09-13
- AI-native tool references last verified: 2026-09-13

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
