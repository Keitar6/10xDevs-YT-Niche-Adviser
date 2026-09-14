---
date: 2026-09-11T21:05:00+02:00
researcher: Mateusz
git_commit: 40e33b8be55ae778fe69c13ab06eac3583cb6a3b
branch: master
repository: YT-Niche-Adviser
topic: "Is yt-api-docs.md compatible with this codebase? Internal research for S-02 (analyze-and-rank-opportunities)"
tags:
  [research, codebase, internal, s-02, youtube-data-api, api-routes, astro-env, rls, cloudflare-workers, compatibility]
status: complete
research_type: internal
last_updated: 2026-09-11
last_updated_by: Mateusz
last_updated_note: "Added follow-up recording user decisions (D1-D4); PRD FR-008 and roadmap amended to median; competitor cap of 5 assigned to S-01"
---

# Research: compatibility of `yt-api-docs.md` with the codebase, for implementing S-02

**Date**: 2026-09-11T21:05:00+02:00
**Researcher**: Mateusz
**Git Commit**: `40e33b8`
**Branch**: master
**Repository**: YT-Niche-Adviser

## Research Question

Review the codebase and decide whether [`yt-api-docs.md`](./yt-api-docs.md) — the external YouTube Data API v3 contract for S-02 — is compatible with it, given that we want to implement roadmap slice **S-02** (`analyze-and-rank-opportunities`, the north star).

This is the internal counterpart to the two external documents already in this change folder. It answers _"what does our codebase already do, and what does it force on the plan"_, not _"what should we build with"_.

## Summary

**Verdict: yes — `yt-api-docs.md` is compatible with this codebase. Nothing in it is blocked by the stack, and every technical prerequisite it names is already satisfied or is a one-line config addition.**

Specifically, all five of the document's hard requirements check out against the repo as it stands:

| `yt-api-docs.md` requires                                                        | Codebase status                                                                                                                     |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Three plain `GET` calls over HTTP                                                | Native to `workerd`; no Node built-in needed. **First** outbound third-party `fetch()` in the repo — no precedent, but no obstacle. |
| `z.coerce.number()` for the string `viewCount`                                   | `zod@4.4.3` installed (`package.json:37`) and already mandated for API routes by `CLAUDE.md`. `z.coerce` exists in v4.              |
| Absent parts modelled as absent keys, not `null`                                 | Plain `.optional()` in zod. No conflict with the `Database`-derived type convention, which only covers DB rows.                     |
| A server-side API key as an `astro:env/server` secret "alongside `SUPABASE_KEY`" | Exactly the existing pattern (`astro.config.mjs:19-20`). See the `optional: true` caveat below.                                     |
| No OAuth; a credential distinct from F-01's Google login                         | Correct. F-01 uses Supabase's Google provider (`src/pages/api/auth/google.ts`), which never touches an API key.                     |

**The incompatibilities are not in the document — they are three gaps between the document's assumptions and this codebase's current state.** Ranked by how much they change the plan:

1. **The document's call chain assumes "3-5 competitors"; the codebase deliberately allows unbounded, unvalidated competitor IDs.** `channel-profile-crud` relaxed the PRD's "3–5" to **min 3 / no max** _by explicit user direction_, and no layer — DB, API, or form — validates that an entry is a YouTube channel ID at all. Every quota, latency, and CPU figure in both external documents is computed against a bound the product does not enforce. This is the one finding that must reach `/10x-plan`.
2. **The PRD's "visible progress" NFR has no pattern to build on.** The repo's only async-UI idiom is a boolean `saving` flag plus a spinner. There is no `AbortController`, no timeout, no streaming, no polling anywhere in `src/`. The document's paging loops are exactly what makes S-02's runtime variable, so this is where its contract meets an unbuilt capability.
3. **Secrets are declared `optional: true` and CI auto-deploys to production on every push to master.** A missing `YOUTUBE_API_KEY` therefore fails at _runtime_, not at build time — the Analyze button would ship broken and silent. The repo already has the right countermeasure (`src/lib/config-status.ts`), it just has to be used.

Two points the document gets right but understates: the quota bucket is **per Google Cloud project**, and this project already has one (`yt-niche-adviser`, visible in the untracked, gitignored `OAuth.json`) — the key and F-01's OAuth client would share it. And `search.list` is not used anywhere today, so "banned from the analysis path" costs nothing to adopt as a plan invariant.

## Detailed Findings

### 1. The competitor-ID contract — the real incompatibility

`yt-api-docs.md` opens its call chain with _"Accepts a comma-separated id list — all 3-5 competitors resolve in one call"_. Three layers of this codebase disagree with the "3-5" half of that sentence, and all three agree with each other:

- **DB** — `supabase/migrations/20260909213911_create_channel_profiles.sql:6` declares `competitor_channel_ids text[] not null` with **no check constraint at all**: no length bound, no element-format check, no element uniqueness.
- **API** — `src/pages/api/profile.ts:13-16` validates `.min(3, ...)` plus set-uniqueness. There is **no `.max()`** and no format check; any non-empty trimmed string passes.
- **Form** — `src/components/profile/ChannelProfileForm.tsx:26-42` mirrors the server exactly (min 3, non-empty, unique, no max), and `addCompetitorRow()` at `:78-80` has no upper bound. The label reads _"Competitor channel IDs (min. 3)"_ (`:113`).

This is **not an oversight to fix in passing** — it is a recorded product decision:

> "**Deliberate PRD deviation, by explicit user direction:** the PRD/roadmap describe competitor IDs as a '3–5' range. This plan implements a **minimum of 3 with no upper cap** instead, per the user's explicit choice during planning."
> — `context/changes/channel-profile-crud/plan.md:28`

`channel-profile-data-model` deferred the count check to S-01 on purpose, and S-01 then chose not to impose one. So S-02 inherits an input whose size is unbounded and whose contents are arbitrary strings.

Two concrete consequences for the plan:

- **Quota and latency are unbounded in two dimensions at once.** `yt-library-research.md` budgets ~15 units per run at 5 competitors; at 20 competitors with Shorts-heavy paging it is several times that, and the wall-clock cost scales with it — against a PRD target of _"< ~30 s p95"_.
- **An invalid ID fails silently, which is the worst failure shape for this product.** `channels.list` omits unknown IDs from `items` rather than erroring. A user who pastes a channel _handle_ (`@name`), a URL, or a video ID gets a quietly smaller result set, not an error. `yt-library-research.md` rejected `scrapetube` specifically for silent emptiness; the same hazard re-enters here through our own unvalidated input. The route needs an explicit "resolved N of M competitors" reconciliation step, and FR-009's readable-message guardrail should cover it.

### 2. Secrets: the pattern fits, `optional: true` is the catch

`astro.config.mjs:19-20` declares both existing secrets as:

```js
SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
```

`optional: true` types them `string | undefined` in the generated `astro:env/server` module, and the codebase's established answer is **degrade, don't crash**:

- `src/lib/supabase.ts:7-9` returns `null` when either value is missing.
- `src/lib/config-status.ts:11-19` turns that into a user-visible banner via `configStatuses` / `missingConfigs`.
- `src/pages/api/profile.ts:47-49` converts the `null` client into `jsonError("Supabase is not configured", 500)`.

`YOUTUBE_API_KEY` (and `ANTHROPIC_API_KEY`) should follow this exact shape — which conveniently hands FR-009 its first graceful-degradation path for free.

**Full plumbing checklist for one new secret** (six places, none optional):

1. `astro.config.mjs` `env.schema` — new `envField.string({ context: "server", access: "secret", optional: true })`.
2. The consuming module under `src/lib/` — import from `astro:env/server`, null-guard.
3. `.env` — local Node dev. **Note: `.env.example` does not exist**, despite `README.md:36,41,84,118` telling you to `cp .env.example .env`. The README is stale; the file must be written by hand.
4. `.dev.vars` — Cloudflare local dev. Does not exist yet either (gitignored, `.gitignore:14`).
5. `.github/workflows/ci.yml:22-24` — the `env:` block on the `npm run build` step.
6. Cloudflare production — `wrangler secret put`, out of band. `wrangler.jsonc` has no `vars` block.

**The deploy risk this creates.** `ci.yml:25-30` runs `cloudflare/wrangler-action@v4 command: deploy` gated only on `github.ref == 'refs/heads/master' && github.event_name == 'push'` — fully automated, no approval gate. Because the schema field is `optional: true`, a build with no key **succeeds**, and the deploy ships. The failure then surfaces as a broken Analyze button in production. Adding a `configStatuses` entry for YouTube (and the LLM) is the cheap fix and matches the existing convention exactly.

**The quota bucket is shared with F-01's Google project.** The document is right that the credential is unrelated to F-01 — but `OAuth.json` at the repo root (untracked and gitignored via `.gitignore:30`, so no leak) shows `"project_id": "yt-niche-adviser"`. YouTube Data API quota is allocated **per Google Cloud project**, not per key, so a key minted in that project shares the 10,000 units/day with anything else it does. Practically this is good news — the project exists, so the step is just enabling YouTube Data API v3 on it — but it should be stated rather than discovered.

### 3. API route conventions the new route must follow

`src/pages/api/profile.ts` is the only JSON API route in the repo and is the template for `POST /api/analyze`:

- **Self-guard for auth.** `src/middleware.ts:4` defines `PROTECTED_ROUTES = ["/dashboard"]` — **`/api/*` is not covered**. Middleware populates `context.locals.user` on every request but redirects nothing under `/api`. The route must repeat `profile.ts:27-29`: `if (!context.locals.user) return jsonError("You must be signed in", 401)`. This matters even though YouTube needs no user credential, because the profile read is RLS-scoped to `auth.uid()`.
- **Error envelope is `{ error: string }`**, produced by a `jsonError(message, status)` helper defined **locally** at `profile.ts:19-24` and imported by nobody. S-02 is the second consumer — either extract it to `src/lib/` or knowingly duplicate it.
- **zod at module scope, `safeParse`, first issue only.** `profile.ts:36,43` surfaces `parsed.error.issues[0].message`.
- **Body parsing is unguarded.** `profile.ts:31` calls `await context.request.json()` with no try/catch; a malformed body throws. Worth not copying.
- **`export const prerender = false` is absent from all six API routes**, although `CLAUDE.md` mandates it. Under `output: "server"` (`astro.config.mjs:11`) it is a no-op, so this is documentation drift rather than a bug — but the plan should pick a side rather than leave a seventh inconsistent file.
- **The auth routes are a different convention entirely** — `formData()`, no zod, errors via `context.redirect("...?error=...")`. S-02 belongs to the `profile.ts` JSON family, not this one.

### 4. Lint config actively enforces the document's zod recommendation

`eslint.config.js:15` applies `tseslint.configs.strictTypeChecked` + `stylisticTypeChecked` with `projectService: true` (`:18`). That means `no-unsafe-assignment` / `no-unsafe-call` / `no-unsafe-member-access` / `no-unsafe-return` are all on, repo-wide, type-aware.

The practical effect for S-02: `await res.json()` is `any`, so **reading `data.items[0].statistics.viewCount` off a raw response is a lint error, not a style preference.** The only clean path is parsing into a validated shape first — which is precisely what `yt-api-docs.md` and `yt-library-research.md` both recommend. External advice and internal tooling agree here; it is not a judgement call.

Two more rules that touch this slice: `no-floating-promises` (the `playlistItems` paging loop and any `Promise.all` fan-out must be awaited properly) and `no-console: "warn"` (`eslint.config.js:24`) — relevant because **observability is absent**: no logger, no Sentry, and `wrangler tail` is live-only per `context/foundation/infrastructure.md`.

`.husky/pre-commit` runs `npx lint-staged` → `eslint --fix` on `*.{ts,tsx,astro}`, so these fire before anything reaches CI.

### 5. The "visible progress" NFR meets an unbuilt capability

The PRD's NFR is explicit:

> "Uruchomienie „Analyze" dla profilu z 3–5 konkurentami zwraca wynik w czasie odczuwalnym jako akceptowalny (cel: < ~30 s p95); **przy dłuższym przetwarzaniu użytkownik widzi ciągły, widoczny postęp** zamiast wrażenia zawieszenia."

What exists today, in full:

- `ChannelProfileForm.tsx:24,52,68-70` — a `saving` boolean set before `fetch`, reset in `finally`.
- `SubmitButton.tsx:16-34` — disables the button and swaps in an `animate-spin` span.
- `ServerError.tsx:7-15` — renders an error string, or `null`.

A repo-wide grep finds **zero** occurrences of `AbortController`, `signal:`, client-side timeout, `ReadableStream`, or `EventSource`. There is no polling, no job table, no streaming.

This is where `yt-api-docs.md` bites hardest, and it is worth reading its two Open Questions in this light. Q8 (paging depth for Shorts-heavy channels) is framed as a quota question; internally it is _also_ the latency question, because the document establishes that **Shorts are only identifiable after `videos.list`** — so a channel that posts mostly Shorts forces more pages to reach the same long-form sample. Runtime is therefore data-dependent and not knowable up front.

`yt-library-research.md` correctly notes Workers place no wall-clock limit on HTTP-triggered requests, so a multi-second blocking POST is _architecturally_ fine. The gap is purely the UI contract: a spinner satisfies "not hung" only weakly at 30 s. The plan must either cap paging hard enough that a spinner is honest, or introduce a progress mechanism — which would be new architecture in a repo whose sole hydration directive is `client:load` (three uses: `Topbar.astro:25`, `signin.astro:23`, `signup.astro:23`).

### 6. CPU budget: the free plan is a documented assumption

`context/foundation/infrastructure.md:31` states _"Free tier (100k req/day) comfortably covers stated scale"_, and its risk register already anticipates this slice:

> "Free-tier 10ms CPU cap trips under heavier scoring computation as usage grows … **Mitigation: Keep the outlier-scoring formula lightweight and synchronous-cheap**; if it grows heavier, move to the $5/mo Workers Paid plan."

That partially answers Open Question 2 in `yt-library-research.md` — the _documented intent_ is the free plan, though nothing in the repo verifies the actual Cloudflare account, and `wrangler.jsonc` sets no `limits.cpu_ms`. Awaiting `fetch()` costs no CPU, so the exposure is exactly what the external research identified: JSON parsing plus zod validation of ~250 video records, which under an unbounded competitor list (finding 1) is likewise unbounded.

`wrangler.jsonc` currently configures only the `ASSETS` binding and `observability.enabled: true` — **no KV, no D1, no rate-limit binding, no AI binding**. Any caching or per-user rate limiting floated in the external research would be new infrastructure, not a config tweak.

### 7. Data contract: what S-02 reads, and what does not exist yet

`channel_profiles` is the **only** application table; `content_opportunities` does not exist anywhere in the repo. RLS is correctly locked down — four granular per-operation policies, all `to authenticated`, all `auth.uid() = user_id` (migration `:13-28`) — so a server-side read through the cookie-scoped client in `src/lib/supabase.ts` is automatically owner-isolated, satisfying FR-002 with no extra work in S-02.

Today the profile is read in exactly one place: `src/components/Topbar.astro:7-11`, via `.select("*").eq("user_id", user.id).maybeSingle()`, passed into `<ProfileDialog initialProfile={profile} client:load />` at `:25`. `dashboard.astro` does **not** load the profile itself. `/api/analyze` will therefore need its own read — and must handle the `maybeSingle()` → `null` case (signed in, no profile yet) with a readable message rather than an empty ranking.

`src/types.ts` currently exports one alias derived from the generated `Database` type. S-02 introduces the project's **first types that are not DB-derived** (YouTube response shapes, the ranked-opportunity DTO). The convention needs a deliberate extension: zod schemas as the source of truth, `z.infer` for the types, re-exported through `src/types.ts` per `CLAUDE.md`.

Note also that `CLAUDE.md` names `src/lib/services/` as the home for extracted business logic, but **the directory does not exist and has never been proposed in any plan**. All logic to date lives inline in route handlers. S-02 — YouTube client, Shorts filter, scoring, LLM call — is the first change that genuinely needs it.

### 8. UI: almost nothing is installed

`src/components/ui/` contains exactly three files: `LibBadge.astro` (starter branding), `button.tsx`, and `dialog.tsx` (added for S-01). **Missing**: `card`, `table`, `skeleton`, `alert`, `badge`, `input`, `label`, `toast`/`sonner`, `select`, `progress`, `separator`, `tooltip` — i.e. essentially everything a ranked results list with scores, loading states, and an error surface would use.

`channel-profile-crud/plan.md:103-109` records the exact procedure and its gotcha: add via `npx shadcn@latest add <name>`, then **fix the generated `cn` import to `@/lib/utils`** rather than the `cn` npm package the CLI pulls in, and remove that redundant dependency.

`dashboard.astro:11-21` is the natural attach point — a single centered welcome card inside a `flex flex-1 items-center justify-center` wrapper, with no lists or content regions yet. `src/components/hooks/` holds only `.gitkeep`, so any `useAnalysis`-style hook is also a first.

### 9. Testing: the scoring maths has nowhere to live

Three independent confirmations that **no test runner exists**: `package.json` has no `test` script and no vitest/jest/playwright dependency; zero `*.test.*` / `*.spec.*` files exist; `ci.yml` runs lint + build only. `context/foundation/stack-assessment.md` records this as the single failed quality gate.

Every prior change states the same and works around it identically — `channel-profile-data-model`, `channel-profile-crud`, and the archived `google-oauth-login` all record "no test runner exists in this repo", and all three use a **phase-gated manual protocol**:

> "After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase."

This collides with the recommendation in `yt-library-research.md` to hand-roll the statistics, which was justified _because_ "this arithmetic is the product's core hypothesis" and "needs unit tests regardless". It also collides with the PRD's determinism NFR — _"ta sama analiza … zwraca ten sam outlier_score i tę samą kolejność rankingu"_ — which is a property no manual click-through verifies well. The scoring function is the first genuinely pure, testable logic in the project. Either a test runner enters scope here, or the determinism NFR is verified by hand and that is stated openly.

## Code References

- [`src/pages/api/profile.ts:19-24`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/40e33b8be55ae778fe69c13ab06eac3583cb6a3b/src/pages/api/profile.ts#L19-L24) — the `jsonError` helper and `{ error: string }` envelope; local to this file
- [`src/pages/api/profile.ts:13-16`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/40e33b8be55ae778fe69c13ab06eac3583cb6a3b/src/pages/api/profile.ts#L13-L16) — competitor-ID validation: min 3, unique, **no max, no format check**
- [`src/pages/api/profile.ts:27-29`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/40e33b8be55ae778fe69c13ab06eac3583cb6a3b/src/pages/api/profile.ts#L27-L29) — the per-route auth guard S-02 must replicate
- [`src/middleware.ts:4`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/40e33b8be55ae778fe69c13ab06eac3583cb6a3b/src/middleware.ts#L4) — `PROTECTED_ROUTES = ["/dashboard"]`; `/api/*` is not middleware-protected
- [`src/lib/supabase.ts:7-9`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/40e33b8be55ae778fe69c13ab06eac3583cb6a3b/src/lib/supabase.ts#L7-L9) — the null-guard idiom for an unset `astro:env/server` secret
- [`src/lib/config-status.ts:11-19`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/40e33b8be55ae778fe69c13ab06eac3583cb6a3b/src/lib/config-status.ts#L11-L19) — the "service not configured" banner S-02 should extend
- [`src/components/Topbar.astro:7-11`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/40e33b8be55ae778fe69c13ab06eac3583cb6a3b/src/components/Topbar.astro#L7-L11) — the only existing read of `channel_profiles`, via `maybeSingle()`
- [`src/components/profile/ChannelProfileForm.tsx:52-70`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/40e33b8be55ae778fe69c13ab06eac3583cb6a3b/src/components/profile/ChannelProfileForm.tsx#L52-L70) — the entire async-UI vocabulary of this repo: `saving` flag, `serverError`, `finally`
- [`supabase/migrations/20260909213911_create_channel_profiles.sql:6`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/40e33b8be55ae778fe69c13ab06eac3583cb6a3b/supabase/migrations/20260909213911_create_channel_profiles.sql#L6) — `competitor_channel_ids text[] not null`, unconstrained
- [`supabase/migrations/20260909213911_create_channel_profiles.sql:13-28`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/40e33b8be55ae778fe69c13ab06eac3583cb6a3b/supabase/migrations/20260909213911_create_channel_profiles.sql#L13-L28) — the four-policy RLS pattern to replicate for S-03
- [`astro.config.mjs:19-20`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/40e33b8be55ae778fe69c13ab06eac3583cb6a3b/astro.config.mjs#L19-L20) — the `envField` secret pattern, `optional: true`
- [`.github/workflows/ci.yml:22-30`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/40e33b8be55ae778fe69c13ab06eac3583cb6a3b/.github/workflows/ci.yml#L22-L30) — build-step secrets, then ungated auto-deploy to Cloudflare on push to master
- [`eslint.config.js:15-18`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/40e33b8be55ae778fe69c13ab06eac3583cb6a3b/eslint.config.js#L15-L18) — `strictTypeChecked` + `projectService`, which makes unvalidated `res.json()` access a lint error
- [`wrangler.jsonc:5-14`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/40e33b8be55ae778fe69c13ab06eac3583cb6a3b/wrangler.jsonc#L5-L14) — `nodejs_compat`, no `limits`, no KV/D1/AI/rate-limit bindings
- [`src/types.ts:5`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/40e33b8be55ae778fe69c13ab06eac3583cb6a3b/src/types.ts#L5) — the sole exported type, `Database`-derived

## Architecture Insights

**The codebase has no service layer, and S-02 is the change that forces one.** `CLAUDE.md` names `src/lib/services/`, but no plan has ever proposed it and business logic currently lives inline in route handlers. S-02 brings four separable concerns — YouTube client, Shorts filter, scoring, LLM justification — into one slice. Keeping the scoring function pure and framework-free is what makes it testable at all, and testability is what the external research's "hand-roll the maths" recommendation depends on.

**Every external-API constraint in `yt-api-docs.md` is amplified by one unenforced internal constraint.** The document's quota table, its Shorts-paging warning (Q8), and its minimum-sample-size question (Q7) are all stated per-competitor. Multiply any of them by an unbounded competitor count and the per-run cost, latency, and CPU all become unbounded. Capping competitors _at analysis time_ is the cheapest single lever on all three at once — cheaper than caching, cheaper than a rate-limit binding, cheaper than upgrading the Workers plan.

**The repo's graceful-degradation idiom already exists and should be reused rather than reinvented.** `supabase.ts` returns `null` → `config-status.ts` renders a banner → `profile.ts` returns a typed 500. FR-009 needs the same three-layer shape for four new failure modes: key not configured, quota exceeded (HTTP 403 with `quotaExceeded`), a competitor ID that resolves to nothing, and too few long-form videos to compute a defensible baseline. The last two are _data_ failures with HTTP 200 responses — they will not surface unless the code looks for them.

**The pattern-consistency findings from `google-oauth-login`'s impl-review predict S-02's review.** That review's one accepted warning (F2) was that an error path redirected to the wrong page — a consistency defect, not a functional one. With `jsonError` currently private to `profile.ts` and the error envelope unshared, S-02 is set up to repeat that class of finding unless the helper is extracted first.

**A language decision is overdue.** API messages and UI copy are English throughout (`"You must be signed in"`, `"Competitor channel IDs (min. 3)"`); `src/lib/config-status.ts:15-17` is the lone Polish outlier (_"Supabase nie jest skonfigurowany…"_), while the PRD and roadmap are Polish. S-02 adds both user-facing error copy (FR-009) and LLM-generated justification text — the largest injection of user-visible prose so far. Pick one before generating a prompt in it.

## Historical Context (from prior changes)

- `context/changes/channel-profile-crud/plan.md:28` — the min-3/no-max deviation, explicitly by user direction, with the note that `channel-profile-data-model` had deliberately deferred the count check to this slice. The chain of deferrals ends at S-02.
- `context/changes/channel-profile-crud/plan.md:29` — React 19 function form actions (`<form action={asyncFn}>`) are **broken inside Radix `Dialog`**; the fix was plain `onSubmit` + `e.preventDefault()` plus an optional `pending` prop on `SubmitButton`. Directly relevant if Analyze results render in a dialog.
- `context/changes/channel-profile-crud/plan.md:30` — request bodies moved from `FormData` to JSON after a browser extension clobbered the global `FormData` constructor. `/api/analyze` should be JSON for the same reason.
- `context/changes/channel-profile-data-model/plan.md:75-91,136` — the four-policy RLS pattern and the `db:types` → `database.types.ts` → `src/types.ts` flow; the template for S-03's `content_opportunities`.
- `context/archive/2026-09-08-google-oauth-login/reviews/impl-review.md` — APPROVED with 1 warning fixed (F2, error-redirect consistency), 1 skipped (F1, Google's `?error=access_denied` still falls through to a generic message). The skipped one is a live precedent: a third-party provider's own error code going unsurfaced is exactly the shape of `quotaExceeded` going unsurfaced in S-02.
- `context/archive/2026-09-08-google-oauth-login/change.md:14-16` — local dev needs its own provider wiring in `supabase/config.toml`, separate from the hosted project. The analogue for S-02 is `.dev.vars`, which does not exist yet.
- `context/changes/bootstrap-verification/verification.md` — records 1 CRITICAL + several HIGH transitive npm audit findings from the initial scaffold, never revisited. Worth a glance before adding the first new runtime dependency.

## Related Research

- [`yt-api-docs.md`](./yt-api-docs.md) — the external API contract under review here. Open Questions 7-8.
- [`yt-library-research.md`](./yt-library-research.md) — library selection, quota economics, runtime limits, outlier-scoring methodology. Open Questions 1-6; **Q1 (mean vs median) remains the only blocking question for `/10x-plan`** and is untouched by internal research, being a PRD-level definition (FR-008).
- `context/foundation/infrastructure.md` — Cloudflare Workers selection, the free-tier assumption, and a risk register that already names the 10 ms CPU cap against "the outlier-scoring formula run inline".
- `context/foundation/lessons.md` — **does not exist**. Nothing in `/10x-lesson` has been captured yet, so the recurring pitfalls above live only inside individual change folders.

## Open Questions

Numbered to continue `yt-api-docs.md`, which ends at Q8.

9. **RESOLVED 2026-09-11 → cap at 5, see [Follow-up](#follow-up-research-2026-09-11t2130-decisions). Competitor-count cap at analysis time** — Owner: user. Block: no, but it must be decided in `/10x-plan`. S-01 deliberately allows unbounded competitors; every quota, latency, and CPU estimate in both external documents assumes 3-5. Decide whether `/api/analyze` caps the list (and to what, and whether the user is told), or whether S-01's rule is revisited. Interacts with `yt-api-docs.md` Q8 (paging depth) and `yt-library-research.md` Q2 (Workers plan).
10. **Channel-ID validation and unresolved-ID handling** — Owner: user. Block: no. Nothing validates that a competitor entry is a YouTube channel ID, and `channels.list` omits unknown IDs silently. Decide where the check lives (S-01 form, S-02 route, or both) and what the user sees when 3 of 5 competitors resolve.
11. **RESOLVED 2026-09-11 → scoped to the Analyze flow only, see [Follow-up](#follow-up-research-2026-09-11t2130-decisions). What "ciągły, widoczny postęp" means concretely** — Owner: user. Block: no, but it shapes the architecture. No streaming, polling, or abort pattern exists in the repo. Options: cap the work so a spinner is honest; stream progress; or a two-phase request. Cheapest honest option first.
12. **Test runner in scope for S-02?** — Owner: user. Block: no. Sharpens `yt-library-research.md` Q6 with internal evidence: three consecutive changes recorded "no test runner exists" and verified manually with a human-confirmation pause. The determinism NFR and the hand-rolled scoring maths both argue for Vitest entering scope here; `main_goal: speed` argues against.
13. **Language of S-02's user-facing strings** — Owner: user. Block: no, but the LLM prompt cannot be written without it. Code is English, PRD is Polish, one config banner is Polish.
14. **Does `YOUTUBE_API_KEY` come from the existing `yt-niche-adviser` Google Cloud project?** — Owner: user. Block: no. If yes, the 10,000 units/day bucket is shared with F-01's OAuth client's project; if no, a second project isolates it. Either is fine, but the plan should say which.

## Follow-up Research 2026-09-11T21:30 — decisions

Four decisions taken by the user after reading the findings above. Recorded here so `/10x-plan` reads them as settled input, not open questions.

### D1 — Competitor list is capped at 5, enforced in the profile (resolves Q9)

> "let's cap it here to 5 maximum, we might increase it but let's cap it for now"

The cap is **provisional and explicitly revisitable**. It restores the bound that every quota, latency, and CPU estimate in `yt-api-docs.md` and `yt-library-research.md` already assumes, which is what makes those numbers usable in the plan.

**Enforced in the profile, not in the analysis path** — user decision: _"cap is enforced in the profile, that's our source of truth for analysis."_ This is the better half of the fork: it keeps a single definition of a valid profile, means `/api/analyze` can trust its input rather than re-deriving a subset, and removes the risk of the analysis silently ignoring curated competitors the user can still see in their profile. It also **restores conformance with PRD FR-003** (_"3–5 ID konkurentów"_), so it is not a new deviation — it retires an old one.

**Consequence: this reopens S-01, which is still `in-progress`.** `channel-profile-crud` deliberately shipped min-3/no-max by explicit user direction (`context/changes/channel-profile-crud/plan.md:28`); that decision is now superseded and three places need the bound, plus one annotation:

| Location                                              | Change                                                                             |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `src/pages/api/profile.ts:13-16`                      | add `.max(5, ...)` to the `competitor_channel_ids` array schema                    |
| `src/components/profile/ChannelProfileForm.tsx:26-42` | mirror the max in `validate()`                                                     |
| `src/components/profile/ChannelProfileForm.tsx:78-80` | stop `addCompetitorRow()` at 5 (disable the button rather than erroring on submit) |
| `src/components/profile/ChannelProfileForm.tsx:113`   | label reads "Competitor channel IDs (min. 3)" → "(3–5)"                            |
| `context/changes/channel-profile-crud/plan.md:28`     | annotate the recorded deviation as superseded on 2026-09-11                        |

A DB-level `check (array_length(competitor_channel_ids, 1) between 3 and 5)` is **not** recommended: `channel-profile-data-model` deliberately kept count rules out of the schema, and re-introducing one would need a fresh migration for a constraint the app already enforces on both sides. Existing rows are unaffected — no profile in the wild can exceed 5 yet, since the app has one user and the form is the only writer.

Q10 (channel-ID format validation and unresolved-ID handling) remains open and is now the larger of the two input-integrity risks — and it lands in the same three files, so it is worth deciding before touching them rather than after.

### D2 — `outlier_score` uses the median (resolves the blocking Q1 in `yt-library-research.md`)

> "for an analysis lets go with median"

This unblocks `/10x-plan`. It adopts the recommendation in `yt-library-research.md` Architecture Insights §2 — the mean has a breakdown point of 0, so any competitor worth curating has already produced outliers that permanently inflate their own baseline, causing the metric to under-detect exactly what the product exists to find.

**This now conflicts with two foundation documents that still specify the mean**, both of which must be reconciled before or during `/10x-plan`:

- `context/foundation/prd.md` — FR-008 (_"outlier_score = wyświetlenia filmu / średnia wyświetleń kanału z okna czasowego"_), restated in the Business Logic section.
- `context/foundation/roadmap.md:32` — the vision recap (_"wyświetlenia filmu względem średniej danego kanału"_).

Two ways to close the gap, both with precedent: amend FR-008 in the PRD, or record it as a deliberate deviation in the plan the way `channel-profile-crud/plan.md:28` recorded the 3–5 relaxation. Amending is preferable here because the formula _is_ the product hypothesis and two foundation docs currently assert the opposite — a future agent reading either would implement the mean.

**Both foundation documents were amended on 2026-09-11** rather than carrying the conflict into the plan:

- `context/foundation/prd.md` — FR-008 now reads `mediana`, with a dated `> Poprawka` annotation in the document's existing Socrates style recording the decision, its rationale, and the evidence trail. The Vision, scale-note, and Business Logic restatements were updated to match. `version: 1` / `status: draft` left untouched — bump them if you want the change to read as a formal revision rather than a draft edit.
- `context/foundation/roadmap.md` — the vision recap at line 32 now reads `mediany`, and S-02 gained a `Rozstrzygnięcia (2026-09-11)` block recording both this and D1.

**Compute both, score on the median.** Per the user: _"eventually we will calculate both."_ The scoring helper should return mean **and** median from the same sorted array — it is a handful of extra lines, costs nothing at runtime, and turns the future statistics view (D3) into a display change rather than a recomputation. Only the median feeds `outlier_score`.

Sub-decision still deferred to `/10x-plan`: the minimum-sample rule (`yt-api-docs.md` Q7) matters **more** under a median, not less — a median over n=2 is more degenerate than a mean over n=2. The low-sample floor needs a real answer.

### D3 — Richer stats for the user are a post-MVP idea, not S-02 scope

> "we should probably in the future show to the user a bunch of stats"

Parked deliberately. S-02 ships `outlier_score` plus a one-sentence justification per FR-009. Note this is adjacent to two items already parked in `roadmap.md` ("Śledzenie / analityka własnego kanału", "Zaawansowany, uczony model trafności niszy") but is not the same thing — it is presentation of the competitor statistics S-02 already computes (channel median, sample size, window), not new analysis. Cheap to add later precisely because the scoring module will already have the numbers in hand; worth keeping them on the returned DTO even if unrendered.

### D4 — Progress indication is scoped to the Analyze flow only (resolves Q11)

> "we can do this solely on the analysis part right?"

Yes. Nothing else in the app is slow enough to need it: the only other async path is the profile upsert, which is a single round trip already served by the existing `saving`-flag spinner.

D1 materially improves the options here, because bounded competitors means bounded work. Recommended order of preference:

1. **Single blocking POST + spinner, with the work capped** so p95 stays comfortably under the PRD's ~30 s target. Zero new architecture; reuses `ChannelProfileForm.tsx:52-70` and `SubmitButton.tsx` exactly. Honest _if_ the analysis is genuinely fast, which D1 plus a paging cap makes achievable.
2. **Streamed progress** — the Astro route returns a `ReadableStream` of NDJSON stage events (`resolving channels` → `fetching uploads` → `scoring` → `generating justifications`) that the island renders. Native to `workerd`, no new infrastructure, but it is new architecture in a repo with no streaming anywhere, and `@astrojs/cloudflare`'s streaming behaviour should be verified before committing to it.
3. **Two-phase job + polling** — needs storage (KV, D1, or a Supabase table). Overkill for MVP; reject unless 1 and 2 both fail.

Decide by measuring: build option 1, observe real p95 against 5 competitors, escalate to 2 only if it exceeds roughly 10 s. Note that the LLM justification step is the least predictable segment and runs last, which is the natural place for a stage label if option 2 is reached.

**Errors surface as a toast** — user decision. No toast component exists: `src/components/ui/` holds only `button` and `dialog`, so this means `npx shadcn@latest add sonner` (or `toast`) plus the fix recorded in `channel-profile-crud/plan.md:103-109` — repoint the generated `cn` import at `@/lib/utils` and drop the `cn` npm package the CLI pulls in.

Keep the two error surfaces distinct, because they answer different questions:

- **Toast** — per-interaction, ephemeral: "this analysis run failed" (quota exceeded, a competitor that resolved to nothing, an LLM timeout). Replaces the inline `ServerError` pattern for this flow.
- **Banner** (`src/lib/config-status.ts` → `Layout.astro`) — persistent, environment-level: "this deployment has no YouTube key". A toast cannot do this job, since it only fires if someone clicks Analyze — which is precisely the silent-deploy failure from Finding 3.

### Correction to Finding 3 — `config-status` makes the failure visible; it cannot prevent it

Per Astro's documentation, secret server variables are **not included in the final bundle** and are "validated upon import from the `astro:env/server` module" — i.e. at runtime. Build-time secret checking is opt-in via `env.validateSecrets: true` (default `false`), which this repo does not set.

That has a consequence worth stating plainly, because it narrows what any build-time fix can achieve: **CI's build environment and the Cloudflare Worker's runtime secrets are different places.** The GitHub Actions `env:` block at `.github/workflows/ci.yml:22-24` feeds the build; production values come from `wrangler secret put`. So turning on `validateSecrets` and dropping `optional: true` would catch a missing _GitHub repository secret_ — it would **not** catch a forgotten `wrangler secret put`, which is the actual failure mode that ships a silently broken Analyze button. It would also cost: every secret gets validated on import even when unused (Astro's docs note dummy values may be needed to satisfy builds), local `astro dev` would demand a YouTube key, and a missing key would _throw on import_ instead of degrading — which is strictly worse for FR-009's readable-message requirement.

So the recommendation stands but for a sharper reason: keep `optional: true`, null-guard at the source like `src/lib/supabase.ts:7-9`, return a readable `jsonError(...)` like `src/pages/api/profile.ts:47-49`, and add a `configStatuses` entry so a missing key is visible on every page load rather than only on click. The banner does not prevent the bad deploy — it makes it loud within seconds instead of silent until a user clicks Analyze, which matters because the repo has no logger, no Sentry, and `wrangler tail` is live-only.

The only real prevention is a post-deploy smoke check, which `context/foundation/infrastructure.md` already prescribes as a mitigation in its risk register: _"Do an early smoke-test deploy to Workers (not just local `astro dev`) as soon as auth + first API route are wired up, not at the end of the build."_ S-02 is that first API route with external dependencies.

**Source**: Astro documentation via Context7 (`/withastro/docs`) — `guides/environment-variables` (secret server variables, validation on import) and `reference/configuration-reference` (`env.validateSecrets`, default `false`, "useful in some continuous integration (CI) pipelines to make sure all your secrets are correctly set before deploying").
