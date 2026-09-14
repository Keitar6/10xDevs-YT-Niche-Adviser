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
3. **Risks are scenarios, not code locations.** This plan documents _what
   could fail_ and _why we believe it's likely_ — drawn from documents,
   interview, and codebase _signal_ (churn, structure, test base). It does
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
terms, not test names. The Source column cites the _evidence that surfaced
this risk_ — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| #   | Risk (failure scenario)                                                                                                                                                                                                              | Impact | Likelihood | Source (evidence — not anchor)                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The LLM provider returns a malformed, truncated, or refused payload for the justification step, and the whole Analyze run dies — the user gets an error or a blank screen even though the deterministic scores were already computed | High   | High       | interview Q1 (stated top worry), interview Q4; PRD Guardrails ("Analyze never ends in emptiness without explanation"); PRD NFR separating the deterministic score from the non-deterministic justification; hot-spot dir `src/lib/services/` — 24 commits/30d                                                                                                                                                                                  |
| 2   | YouTube quota exhaustion or an API error surfaces as a broken screen, or as a _confidently empty_ ranking indistinguishable from "these competitors published nothing"                                                               | High   | Medium     | PRD Guardrails (graceful degradation), PRD FR-006 resolution note; roadmap S-02 Unknowns — 10 000 units/day shared per Google Cloud project, "in practice still unverified"; interview Q4                                                                                                                                                                                                                                                      |
| 3   | One user reads, modifies, or deletes another user's channel profile, saved opportunities, or avatar object                                                                                                                           | High   | Medium     | PRD Guardrails ("no leak of saved opportunities between accounts"), FR-002, Access Control; PRD NFR explicitly requires isolation to be _verifiable by test_ and no such test exists; `context/archive/2026-09-09-channel-profile-data-model/plan.md` and `context/archive/2026-09-13-save-and-view-opportunities/plan.md` — the owner-scoped policy pattern was replicated across two tables and a storage bucket in four separate migrations |
| 4   | A logged-out caller, or a caller acting for someone else, reaches a data-touching API route directly and receives data or performs a mutation                                                                                        | High   | Medium     | `CLAUDE.md` hard rule: the middleware's protected-route list covers page requests only and never covers API routes, so every API route must resolve the caller itself; hot-spot dirs `src/pages/api/auth/` — 28 commits/30d and `src/pages/api/` — 10 commits/30d; three new data-touching routes landed late in milestone M-1 per `context/foundation/roadmap.md`                                                                             |
| 5   | The scoring rule drifts from the PRD definition and the ranking looks plausible but is wrong — an invisible failure, worse than no ranking at all                                                                                    | High   | Medium     | PRD FR-007 (Shorts excluded), PRD FR-008 including the recorded mean-to-median correction and its rationale, PRD NFR (repeatability of the computational core); interview Q3 ("the analyze pipeline" — changed often without confidence); hot-spot dir `src/lib/services/` — 24 commits/30d                                                                                                                                                    |

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

| Risk | What would prove protection                                                                                                                                                                                                                                                          | Must challenge                                                                                                                                                                                                                                                                                                                          | Context `/10x-research` must ground                                                                                                                                                                                                                                                                                                 | Likely cheapest layer                                                                          | Anti-pattern to avoid                                                                                                                                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1   | With credentials present and the provider returning garbage, a refusal, or a truncated body, the user still receives the ranked list with its scores plus an explicit account of the missing justification — never a server error, never a blank screen, never a fabricated sentence | "The missing-credential degradation path proves the provider path is safe." It does not: the missing-credential path short-circuits _before_ the call, while a bad payload fails _after_ it, during parsing. Also: a 200 response with an unexpected shape may not raise at all                                                         | Where the provider response is parsed and what shape is assumed; whether justifications are requested in one batch for all ranked items, in which case a single bad batch may poison every row; whether a parse failure propagates into the response status; what the interface renders for an absent, null, or empty justification | integration, with the provider transport faked and no network                                  | Faking the parsing step instead of the transport, so the real parsing code is never exercised. Asserting only that nothing threw, without asserting that the scores survived into the user-visible payload |
| #2   | On quota-exceeded, server-error, timeout, and genuinely-empty results, the user sees a readable and _distinct_ explanation and the app stays up; a partial failure across the competitor list does not silently produce a ranking that looks complete                                | "An empty response means the competitors published nothing." It may mean the shared quota died. Conflating the two produces a confidently wrong empty state                                                                                                                                                                             | How upstream errors are translated toward the user; whether per-competitor failures aggregate or fail fast; whether the time-window filter runs before or after the Shorts filter                                                                                                                                                   | integration on the fetch and aggregation layer, with faked HTTP responses                      | Asserting the error _message text_ rather than the user-visible state class — copy churns, the state class is the contract                                                                                 |
| #3   | An authenticated user cannot read, update, or delete another user's profile, saved opportunities, or avatar object — and every denied write provably leaves the targeted row intact                                                                                                  | "Row-level security is enabled, therefore isolation holds." Enabled is not correct: a policy can be missing for a single verb, and the anonymous and authenticated roles carry different grants. Also: "the application always filters by owner, so the database policy is belt-and-braces" — that inverts which layer is the guarantee | The actual policy set per table and _per verb_ across all four migrations; whether the storage bucket carries owner-scoped policies; whether any server path uses a privileged key that bypasses policies entirely                                                                                                                  | database-level policy tests, run through the Supabase CLI — no application stack required      | Asserting only that the stranger's read returns nothing. Matching zero rows is not proof on its own; pair every denied write with a check that the row it targeted is unchanged                            |
| #4   | Every API route that touches user data rejects a caller with no session, returns no data in the rejection body, and derives ownership from the resolved session rather than from client-supplied input                                                                               | "The middleware protects it." The project rules state plainly that it does not for API routes. Also: a route taking an owner identifier from the request body is the ownership-bypass vector, not a convenience                                                                                                                         | The full route inventory and which routes actually resolve the caller; which, if any, accept an owner identifier from the client                                                                                                                                                                                                    | table-driven route tests, one case per route, no database                                      | Testing one representative route and assuming the rest follow. Exhaustiveness across the inventory is the entire value of this test                                                                        |
| #5   | The score equals views divided by the channel's median over the window; Shorts are excluded; the ranking sorts descending; identical input yields identical output _and_ identical order                                                                                             | **The oracle.** Existing assertions may have been captured from the implementation's own output — such a test can never fail for the right reason. Also: "the median is implemented" — an even-count median, a single-video channel, and a zero median (division by zero) are the cases that actually decide correctness                | Where Shorts exclusion actually happens; how the time window is bounded; the behaviour when a channel's median is zero or the channel has one qualifying video                                                                                                                                                                      | unit, on hand-written fixtures whose expected values are computed from the PRD formula by hand | Snapshot assertions over the ranking output. A snapshot records whatever the code does today, bugs included, and is the purest form of the oracle problem                                                  |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| #   | Phase name                           | Goal (one line)                                                                                                                                            | Risks covered | Test types                                | Status      | Change folder                         |
| --- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ----------------------------------------- | ----------- | ------------------------------------- |
| 1   | Analyze-pipeline boundary resilience | Prove a hostile or broken external response degrades into a ranking plus an explanation, never an error page or a blank screen                             | #1, #2        | integration                               | complete    | `testing-analyze-boundary-resilience` |
| 2   | Provable per-user isolation          | Discharge the PRD requirement that isolation be verifiable by test, across both tables and the storage bucket, and close the unauthenticated-route surface | #3, #4        | database policy tests + route integration | complete    | `provable-user-isolation`             |
| 3   | Scoring oracle and spec conformance  | Prove the number means what the PRD says it means, and that the existing suite is able to fail for the right reason                                        | #5            | unit                                      | complete    | `testing-scoring-oracle`              |
| 4   | Quality-gates wiring                 | Lock the floor the first three phases established                                                                                                          | cross-cutting | gates                                     | not started | —                                     |

Order rationale: Phase 1 defends the stated top worry on the highest-churn
value chain. Phase 2 follows because it discharges a written non-functional
requirement whose failure is a data breach. Phase 3 is third because a
partial suite already exists — this is an audit and extension, not a
bootstrap. Phase 4 is last and deliberately thin: gates can only lock a
floor that the earlier phases have built.

## 4. Stack

The classic test base for this project. AI-native tools carry a `checked:`
date so future readers can see which lines need re-verification.

| Layer                                                        | Tool                                     | Version   | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------ | ---------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| unit + integration                                           | Vitest                                   | 5.0       | Configured. `include` is `src/**/*.test.{ts,tsx}` — one glob over the whole tree, deliberately not an allowlist of the directories that happen to hold tests (§3 Phase 2 widened it from `src/lib/services/**` and flattened it). Eight test files: five service tests plus the route, middleware and source-scan files from §6.4                                                                                                                                                  |
| network / boundary faking                                    | Vitest built-in (`vi.stubGlobal`)        | 5.0       | Settled by §3 Phase 1 under the cost × signal rule: no mocking library installed. The pattern — a real `Response` built fresh per call, `vi.unstubAllGlobals()` in `afterEach` — is written up in §6.2                                                                                                                                                                                                                                                                             |
| database / policy tests                                      | Supabase CLI (pgTAP, `supabase test db`) | 2.116     | CLI is already a devDependency; needs Docker locally. Five files under `supabase/tests/`, 77 assertions — the harness/oracle guard plus per-verb, per-role isolation across `channel_profiles`, `content_opportunities` and the `avatars` bucket, and the policy-shape file. Wired as a local gate (§5); pattern in §6.3                                                                                                                                                           |
| typecheck                                                    | `@astrojs/check`                         | 0.9.8     | Installed, but there is no script for it and CI never runs one — see §3 Phase 4                                                                                                                                                                                                                                                                                                                                                                                                    |
| lint                                                         | ESLint, type-checked rules               | 9.29      | Wired in three places: pre-commit via husky and lint-staged, and in CI                                                                                                                                                                                                                                                                                                                                                                                                             |
| Astro component rendering                                    | Container API (experimental)             | Astro 6.3 | Available but not planned. Astro 6 removed rendering of Astro components in client test environments — such tests must run in a `node` environment. §7 rules out UI look-and-feel testing, so this stays unused                                                                                                                                                                                                                                                                    |
| e2e                                                          | none — deliberately out of scope         | —         | No browser automation available in the current session, and §7 plus cost × signal keep e2e out unless a top risk is shown to be unreachable at a cheaper layer. See §5 for the standing trade                                                                                                                                                                                                                                                                                      |
| (optional) AI-native: judge model over justification quality | deferred — checked: 2026-09-13           | n/a       | The PRD's secondary success criterion asks that the justification be good enough to act on, which no deterministic assertion expresses. Deferred because it needs its own evaluation harness against a non-blocking criterion. **When NOT to use:** never over the score, the ordering, or the error paths — those are deterministic, and an assertion is strictly better than a judge there. Promote only if users report rankings that are numerically right but useless to read |

**Stack grounding tools (current session):**

- Docs: Context7 — used. Confirmed that Astro 6 requires a `node` test environment for Container API rendering and exposes `getViteConfig()` for inheriting project config; confirmed that Supabase tests row-level security with pgTAP via `supabase test db`, and that its own guidance warns an emptiness assertion is not proof unless paired with a row-intactness check; checked: 2026-09-13
- Search: Exa.ai — available, not needed; local manifests and Context7 covered every stack question; checked: 2026-09-13
- Runtime/browser: none — no browser automation exposed in this session; noted as a constraint on the e2e trade in §5, not a blocker; checked: 2026-09-13
- Provider/platform: Linear and Notion MCPs available (issue tracking, no quality-gate relevance). No GitHub, Supabase, or Cloudflare MCP — the `gh`, `supabase`, and `wrangler` CLIs stand in for them; checked: 2026-09-13

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required after §3 Phase N" means the gate is enforced once that rollout
phase lands; before that, the gate is planned.

| Gate                  | Where                                                                          | Required?                                                                   | Catches                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| lint                  | local pre-commit + CI                                                          | required (wired)                                                            | syntactic and type-rule drift                                                                                                                 |
| typecheck             | CI                                                                             | required after §3 Phase 4                                                   | type drift across the SSR and island boundary                                                                                                 |
| unit + integration    | local + CI                                                                     | required (wired)                                                            | logic regressions, and from §3 Phase 1 onward boundary-failure regressions                                                                    |
| database policy tests | **local, wired** (`npm run test:db`); CI placement still decided in §3 Phase 4 | required (wired) — run before any change under `supabase/migrations/` lands | cross-account data exposure                                                                                                                   |
| build                 | CI                                                                             | required (wired)                                                            | runtime build breakage before deploy                                                                                                          |
| e2e on critical flows | not wired                                                                      | deliberately deferred — see §7                                              | broken critical user paths end to end                                                                                                         |
| pre-prod smoke        | between merge and production                                                   | optional                                                                    | runtime-only failures that local development on Node cannot reproduce, flagged as a real divergence in `context/foundation/infrastructure.md` |

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
- **Oracle**: the assertions in `scoring.test.ts` were audited in §3 Phase 3
  and are safe to copy as a template. Before adding one, read §6.5 — it names
  the four anti-patterns that audit removed, and the mutation recipe that
  proves a new assertion can fail for the right reason.

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

1. **`unstubGlobals` defaults to `false`.** Stubs do _not_ reset between tests.
   Add `afterEach(() => vi.unstubAllGlobals())` — do not assume the config does
   it.
2. **A `Response` body is single-use.** Build a fresh `Response` _inside_ the
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

And assert that _the good data survived_: a boundary test that only proves
nothing threw would pass even if the scores had been dropped on the way out.

### 6.3 Adding a per-owner isolation test for a table or bucket

- **Location**: `supabase/tests/`, one file per surface, numbered so the
  harness runs first: `NN-<surface>.test.sql`.
- **Reference test**: `supabase/tests/01-channel-profiles.test.sql`.
  Conventions live in `supabase/tests/README.md`.
- **Run locally**: `npm run test:db`. Needs Docker and `npx supabase start`.

The shape, in order:

1. **Wrap the file** in `begin;` / `rollback;` with
   `create extension if not exists pgtap;` and `select plan(N);`. Nothing
   persists, so no file depends on `supabase db reset` and files are
   order-independent.
2. **Create fixtures as `postgres`**, before the first `set local role`.
   Two fixed users: A `aaaaaaaa-0000-0000-0000-000000000001` (the owner) and
   B `bbbbbbbb-0000-0000-0000-000000000002` (the stranger).
3. **Impersonate** with `set local role authenticated;` plus
   `set local request.jwt.claim.sub = '<uuid>';`. Both are transaction-scoped,
   so switching actor is just re-issuing the claim.
4. **Cover four verbs × three roles** — owner, stranger, `anon`. `anon` needs
   the claim _cleared_ (`set local request.jwt.claim.sub = '';`) as well as the
   role switched: `auth.uid()` reads the claim, not the role.
5. **Pair every denied write with a row-intactness assertion.** A denied
   `UPDATE`/`DELETE` reports `UPDATE 0` silently, so "zero rows affected" and
   "quietly rewritten" are indistinguishable until you read the row back as its
   owner. This step is the one naive suites omit and the reason this pattern
   exists.
6. **Route denied `INSERT`s through `throws_ok`.** They raise `42501` and
   **abort the transaction**, taking every later assertion in the file with
   them; `throws_ok`'s internal exception handler acts as a savepoint.
7. **Close with a positive control: the owner CAN write.** As A, `update` and
   then `delete` A's own rows and assert the affected count is what you seeded.
   Put the `delete` last — it removes the rows the rest of the file reads.

Four traps, each of which produces a green suite that proves nothing:

- **The oracle.** If `auth.uid()` is NULL for both actors, every "the stranger
  sees nothing" assertion passes vacuously. `00-harness.test.sql` exists solely
  to rule that out, and it is the precondition for every other file.
- **Assert expressions, never policy counts.** Four `using (true)` policies
  satisfy "this table has four policies". `03-policy-shape.test.sql` asserts the
  `qual` / `with_check` text and the granted roles instead.
- **Storage ownership is the path.** Bucket policies key on
  `(storage.foldername(name))[1]`, so a fixture object must be written at
  `<user_id>/<filename>`. One at the bucket root belongs to nobody and makes
  every assertion about it vacuous — see `04-avatars-bucket.test.sql`, which
  asserts its own fixture paths for exactly this reason.
- **A denial proves nothing without step 7.** "The stranger's UPDATE affected
  zero rows" reads identically whether the policy denies _the stranger_ or
  denies _everybody_ — drop the owner's UPDATE and DELETE policies outright and
  a suite without the positive control stays fully green. This was found by
  mutation testing during the `provable-user-isolation` impl-review, after two
  of the three files had shipped without it.

Before trusting a new file, **break the policy it covers**
(`alter policy … using (true)`) and confirm the file goes red. Then break it the
other way — drop the owner's own policy — and confirm it goes red for that too.
Only the second one catches a suite that proves denial without proving access.

### 6.4 Adding a test for a new API route

- **Location**: `src/pages/api/routes.test.ts` — one table for all routes, not
  one file per route. Exhaustiveness is the deliverable: §2 names "testing one
  representative route and assuming the rest follow" as the anti-pattern here,
  and there is no shared wrapper to test once.
- **Run locally**: `npm test`. No database, no Docker.

To cover a new data-touching route, **add a row to `DATA_ROUTES`**. The 401
case, the empty-body-shape check and the no-client-constructed check all come
for free from the table. Forgetting the row is not silent: the file walks
`src/pages/api/` and asserts the table matches the verbs actually exported on
disk, so a new route fails the suite by name until it is listed. The `ownerField` column is `null` only when the handler
reads no owner-shaped input at all, and the reason belongs in the comment above
the table.

Mechanics worth knowing before writing one:

- **Virtual modules must be aliased.** `astro:env/server`, `cloudflare:workers`
  and `astro:middleware` exist only inside an Astro or workerd build, so route
  handlers are unimportable without the stubs in `src/test/stubs/`, wired
  through `resolve.alias` in `vitest.config.ts`. The `astro:env/server` stub's
  exports mirror the `env.schema` block in `astro.config.mjs` **by hand** —
  adding a secret there and forgetting the stub is a silent import-time failure.
  `getViteConfig()` was rejected deliberately: it would trade an instant run for
  a full Astro build to resolve three modules the tests stub anyway.
- **Ownership from the session.** For any handler that reads a JSON body, invoke
  it with a session for A and a body carrying a planted `user_id` for a
  stranger, with `@/lib/supabase` module-mocked to a recording fake, and assert
  the row handed to `insert` / `upsert` carries A's id.
- **Assert on the call, not only the behaviour, where the two differ.**
  `src/middleware.test.ts` asserts that `getUser()` was called and
  `getSession()` was not. Both produce an identical user object; only one
  verifies the token. No behavioural assertion can tell them apart.
- **Some invariants are absences.** `src/lib/no-privileged-client.test.ts` is a
  source scan, not a behaviour test, because a service-role client breaks
  nothing observable — it just silently removes the guarantee every §6.3 test
  describes.

Before trusting a new row, **delete that handler's `if (!context.locals.user)`
guard** and confirm `npm test` goes red for that handler.

### 6.5 Changing or extending the scoring rule

- **Location**: `src/lib/services/scoring.ts` (the formula) and
  `src/lib/services/video-selection.ts` (which videos the formula runs over).
  Both are pure and synchronous; neither needs a faked transport.
- **Reference tests**: `scoring.test.ts`, `video-selection.test.ts`, and the
  `selection through the real chain` block in `youtube.test.ts`.
- **Run locally**: `npm test`.

**Derive the expected value, never capture it.** Compute it from the PRD
formula by hand and write the counterfactual into the comment — _what the
number would have been had the rule been wrong_. An assertion without a
counterfactual cannot tell a reader whether it is guarding anything:

```ts
// Median over the five long-form videos is 30. Had the two Shorts been left
// in, the seven-element median would have been 40 and every genuine outlier
// on this channel would have been suppressed.
expect(result.channel_median).toBe(30);
```

**The median edge cases that decide correctness.** Four, and the suite needs
all of them:

- **Non-degenerate fixtures.** `median([1,2,3])` is 2 — but so is its _mean_.
  Both median tests were degenerate this way until 2026-09-14, so the project's
  most explicitly protected decision (the 2026-09-11 średnia→mediana
  correction) survived in the very tests named for it. Use a skewed set:
  `median([1,2,300]) === 2`, mean 101.
- **Even count, through the real path.** `scoreChannel` averages the two
  middles, and for a long time every fixture had exactly five videos, so the
  even branch was only ever reached by calling `median` directly.
- **Single video, and the empty set.** `median([])` returns `0` by documented
  choice; the sample floor makes it unreachable in the pipeline.
- **Zero median.** Guarded before scoring, because every score would otherwise
  be `Infinity` or `NaN` and the deterministic-ordering NFR would break.

**Four anti-patterns, all of which were in this suite and are now out.** An
assertion doing any of these looks like coverage and is not:

| Anti-pattern                  | Example that was here                               | Why it cannot fail                                                             |
| ----------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------ |
| Snapshot over the ranking     | _(never introduced — keep it that way)_             | Records whatever the code does today, including the bug                        |
| Self-comparison               | `expect(rank(r,5)).toEqual(rank(r,5))`              | Cannot fail short of `Math.random()`                                           |
| Formula in the expectation    | `toBeCloseTo(400 / 300)`                            | Restates the implementation; also tolerated ±0.005, so rounding was unasserted |
| Branch condition as assertion | `expect(sample_size).toBeLessThan(MIN_SAMPLE_SIZE)` | Re-states the condition the code used to get there                             |

One self-referential assertion is kept deliberately: comparing a ranking to the
same ranking with the channels supplied in the opposite order detects a
non-total comparator, which no value assertion would.

**Size fixtures from the constant, assert on the outcome.** Write
`MIN_SAMPLE_SIZE - 1` rather than `4` so the threshold stays tunable — but keep
the assertion on what the user gets (`kind === "skipped"`, the reported count),
never on the condition the branch tested.

**Prefer an exact literal to `toBeCloseTo`.** Choose fixtures whose score is
exactly representable and has more than two decimals — `450 / 400 = 1.125` — and
write `1.125` as a literal. That pins the contract that _presentation_ decides
precision (`format.ts`, 2 dp) and computation does not: a rounding introduced
anywhere before the wire reads 1.13 and fails.

**The mutation recipe.** No Stryker, no devDependency — this is done by hand,
and it is the only evidence that an assertion can fail for the right reason:

1. Apply exactly one behaviour-changing edit to the module under test.
2. Run `npx vitest run src/lib/services/<module>.test.ts`.
3. **Red = the mutation was killed. Good.** Green = it survived: that behaviour
   is unasserted, whatever the coverage report says.
4. `git checkout` the module and confirm the suite is green again.

Include a deliberate no-op edit as a control. If it goes red, the harness is
broken, not the code.

**The ledger, re-run 2026-09-14 against the final state of both modules.**
24 behaviour-changing mutations, all killed, plus a no-op control. Reproduce it
before trusting a change to either module:

| #       | Mutation                                                                                             | Module               | Result                                         |
| ------- | ---------------------------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------- |
| M1      | `median` even branch → lower middle                                                                  | `scoring.ts`         | red                                            |
| M2      | `median` → arithmetic mean                                                                           | `scoring.ts`         | red, in _both_ tests named for the median rule |
| M4      | `median` sorts lexicographically                                                                     | `scoring.ts`         | red                                            |
| M20a    | `outlier_score` rounded to 2 dp                                                                      | `scoring.ts`         | red                                            |
| M20b    | `limit` falsy-defaults to 5                                                                          | `scoring.ts`         | red                                            |
| M21–M25 | emitted `title` / `channel_title` / `view_count` / `channel_median` / `sample_size` nulled or zeroed | `scoring.ts`         | red (five separate mutations)                  |
| M35     | `outlier_score` floored at 1                                                                         | `scoring.ts`         | red                                            |
| M36     | empty sample reported as `zero_median`                                                               | `scoring.ts`         | red                                            |
| M39     | NaN `published_at` admitted to the ranking                                                           | `scoring.ts`         | red                                            |
| M41     | zero-view withholding removed                                                                        | `scoring.ts`         | red                                            |
| M42     | zero-view guard `<= 0` → `< 0`                                                                       | `scoring.ts`         | red                                            |
| M43     | zero-view video also dropped from the _baseline_                                                     | `scoring.ts`         | red                                            |
| D1      | staleness filter → early `break`                                                                     | `video-selection.ts` | red                                            |
| D2      | unreadable / absent timestamp admitted                                                               | `video-selection.ts` | red                                            |
| D3      | candidate dedupe removed                                                                             | `video-selection.ts` | red                                            |
| D4      | cap `>=` → `>`                                                                                       | `video-selection.ts` | red                                            |
| D5      | cutoff boundary `<` → `<=`                                                                           | `video-selection.ts` | red                                            |
| D6      | Shorts drop removed                                                                                  | `video-selection.ts` | red                                            |
| W1      | pager stops after page one                                                                           | `youtube.ts`         | red                                            |
| W2      | `selectChannelSample` bypassed                                                                       | `youtube.ts`         | red                                            |
| —       | _(control)_ no-op comment insertion                                                                  | `scoring.ts`         | green, as intended                             |

**One thing the ledger cannot reach.** The single-clock fix lives in
`analyze.ts`, which has no unit tests by design (§6.6 Phase 1: the route needs
`astro:env/server` _and_ `cloudflare:workers` mocked; the testable logic is
extracted instead). Passing one `now` to both `fetchCompetitorVideos` and
`scoreChannel` is held by code review and the seam's doc comment, not by an
assertion.

### 6.6 Per-rollout-phase notes

**Phase 1 — Analyze-pipeline boundary resilience (landed 2026-09-14).**

The phase found both risks already largely defended in production code and
none of it tested, so it ran as characterization plus gap-closing rather than
as a bootstrap. 43 tests added across three new files; the suite went from 67
to 110.

Two SDK facts are recorded here because they are expensive to re-derive and
neither is in the SDK's own documentation:

- **The Anthropic SDK resolves `fetch` in the client _constructor_**
  (`client.ts` → `Shims.getDefaultFetch()`), not at module import. Because
  `justify.ts` constructs its client per call, `vi.stubGlobal` reaches it with
  no production seam. This is why §4's "network / boundary faking" row needs no
  tool.
- **`messages.parse()` decodes _before_ the caller sees `stop_reason`**, and
  the structured-output parse _throws_ `AnthropicError` on malformed or
  off-schema JSON rather than returning `parsed_output: null`. Since
  `AnthropicError` is the _parent_ of `APIError`, such a failure matches none
  of the typed error branches. `justify.ts` gained an explicit branch for it.
  A corollary: a refusal carrying prose is pre-empted by the parse throw, so
  the `stop_reason === "refusal"` check fires only when there is no parseable
  text block.

Three live defects were fixed rather than pinned, on the principle that a test
asserting current behaviour would have pinned a defect:

- An empty or whitespace-only justification was reported as _available_ and
  rendered as nothing. Presence is now decided on the trimmed value, in an
  extracted `justification-merge.ts` that is testable without the route's
  virtual modules.
- Per-competitor transport and malformed failures folded into a bare
  `unresolved: string[]`, and the interface then told the user those channels
  were "Not found on YouTube" — a confident, wrong statement about a channel
  that exists. Entries now carry a `reason` discriminant and the interface
  renders the two cases separately.
- The route had no top-level try/catch, so an unexpected throw returned a 500
  _HTML_ page that the island could not read as `{ error }`.

Deliberately not done: no route-level tests (the route needs `astro:env/server`
_and_ `cloudflare:workers` mocked plus alias config; the testable logic was
extracted instead), and no `stop_reason: "max_tokens"` guard — with the parse
throwing on truncated output, the silent-short-array case is near-unreachable
and is characterized rather than defended.

**Phase 3 — Scoring oracle and spec conformance (landed 2026-09-14).**

The audit's headline finding was not a missing test but a _near-miss_: 25 of 32
behaviour-changing mutations already went red, yet mutating `median` to the
arithmetic mean survived both tests named for the median rule, because both
fixtures were degenerate. The suite looked like it guarded the project's most
explicitly protected decision and did not. §6.5 records the repair and the
recipe; the suite went from 132 to 162 tests.

**A spec divergence was resolved in the PRD's favour of the code.** FR-008's
"mediana wyświetleń kanału z okna czasowego" had no implementation — there was
no per-video window filter anywhere. `MAX_WINDOW_DAYS` was a paging _stop_, and
the denominator that actually shipped was "the first ≤20 long-form survivors of
≤100 candidates, in uploads-playlist order". The 20-video cap was declared to be
FR-008's window (it binds long before 180 days for any regular uploader) and the
PRD corrected with a dated `Poprawka`. The clause listing the window as a _user
input_ — no form field, API parameter, type or column ever implemented it — was
struck and re-logged as roadmap S-07.

**The selection rules were extracted to be testable at all.** They lived in two
module-private `async` helpers in `youtube.ts`, behind two awaits, where the
window edge, `MAX_PAGES`, the 20-cap and the Shorts drop had never executed
under test. `video-selection.ts` is the same move `justification-merge.ts` made
in Phase 1. The extraction landed behaviour-preserving and green _before_ any
fix was applied, so a broken extraction could not be mistaken for an intended
behaviour change.

Five defects were fixed rather than pinned, on Phase 1's principle:

- Candidate ids were collected from the array, not deduplicated, so an id
  returned on both pages was double-counted in the median and in `sample_size`.
- The walk `break`s on the first provably-stale item, so one misplaced upload in
  a non-monotonic playlist truncated the sample and lost everything behind it.
- An item whose timestamp was absent or unparseable fell through and was _kept_,
  letting an arbitrarily old video move the median.
- A 0-view video scored exactly 0, ranked, rendered — and then 400'd on Save
  against both `z.number().gt(0)` and `check (outlier_score > 0)`. It is now
  withheld from the ranking while still counting toward the baseline.
- The route built two independent `new Date()` values per request, so the
  staleness cutoff and the recency cutoff ran against different instants.

Recorded rather than fixed:

- **`SHORTS_MAX_SECONDS = 300` is pinned as-is.** It sits above both figures its
  own research offered and above YouTube's 3-minute Shorts ceiling, so a channel
  whose normal format is 3–5 minutes has its entire catalogue classified as
  Shorts. Known exposure, accepted for now.
- **`MIN_SAMPLE_SIZE = 5` keeps its value**, which is half the 10–20 floor its
  own research recommended; a 5-video median stays statistically thin. Fixtures
  are _sized from the constant_ so the number stays tunable.
- **Quota trade.** Removing the early break means paging is bounded by
  `MAX_PAGES` alone, so a channel that previously cost one `playlistItems` call
  may now cost two — ~+5 units on a 5-competitor run against 10,000/day.
  Deliberate, recorded here so it is not rediscovered as a regression.
- **`SkippedChannel` (`types.ts`) is still a structural duplicate** of the
  `kind: "skipped"` arm of `ChannelScoreResult`, copied field-by-field in
  `analyze.ts`. A field added to one would silently not reach the wire. Merging
  them is a refactor with no test in this risk.
- **`sample_size` is lossy**: it cannot distinguish "this channel has 3
  long-form videos" from "the cap left 3", and it is shown to the user in skip
  messages.

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
- **The avatar signed-URL read path** — `createSignedUrl` is a distinct
  authorization mechanism from the `avatars_select_own` policy: a DB-level test
  cannot reach it, and covering it at the route layer would mean asserting on
  the argument passed to a stubbed storage client, which pins the call rather
  than the guarantee. Consistent with the avatar exclusion above on the same
  blast-radius grounds. Re-evaluate if signed URLs are ever minted for an object
  the caller does not own. (Source: `provable-user-isolation` planning, scoped
  out explicitly rather than discovered.)
- **`service_role` and table-owner RLS bypass** — `service_role` bypasses RLS by
  design, so asserting it is asserting a platform truth that cannot fail for a
  reason anyone cares about. The invariant that _does_ matter — no service-role
  client exists in this codebase — is pinned by
  `src/lib/no-privileged-client.test.ts` instead. (Source:
  `provable-user-isolation` planning.)
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
