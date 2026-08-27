---
project: "yt-niche-adviser"
researched_at: 2026-08-26
recommended_platform: "Cloudflare Workers"
runner_up: "Vercel"
context_type: mvp
tech_stack:
  language: "TypeScript/JavaScript"
  framework: "Astro 6 (SSR) + React 19 islands"
  runtime: "Cloudflare Workers (workerd)"
---

## Recommendation

**Deploy on Cloudflare Workers**, via the official `@astrojs/cloudflare` adapter and `wrangler`.

Cloudflare Workers scored 5/5 Pass across all agent-friendliness criteria (CLI-first, managed/serverless, agent-accessible docs, stable deployment API, MCP integration) — the only platform researched to do so. It is also the project's existing, already-wired deployment target (`wrangler.jsonc`, CI auto-deploy on merge to `main`, documented in `CLAUDE.md`), and the developer confirmed hands-on familiarity with Cloudflare in the interview. Given low QPS, small user scale, no persistent-connection requirement, and external Supabase + OpenRouter for data/LLM (Q5), no other platform offers a compelling reason to migrate away from a setup that already works.

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent-accessible docs | Stable deploy API | MCP/Integration | Total |
|---|---|---|---|---|---|---|
| **Cloudflare Workers** | Pass | Pass | Pass | Pass | Pass | 5 Pass |
| Vercel | Pass | Pass | Pass | Pass | Partial (MCP public beta) | 4 Pass / 1 Partial |
| Netlify | Partial (no CLI rollback) | Pass | Pass | Pass | Pass | 4 Pass / 1 Partial |
| Railway | Partial (dashboard-only rollback) | Pass | Partial (no llms.txt) | Partial | Pass | 2 Pass / 3 Partial |
| Fly.io | Partial (rollback = manual image redeploy) | Partial (VM-based, heavier ops surface) | Partial (GitHub-editable, no llms.txt) | Partial | Partial (MCP status unlabeled) | ~1 Partial-dominant |
| Render | Partial (rollback via API/dashboard only) | Pass | Fail (no markdown docs found) | Partial | Partial (MCP preview-grade) | 1 Pass / 3 Partial / 1 Fail |

**Notes per platform:**
- **Cloudflare Workers** — `wrangler deploy`/`rollback`/`tail` all GA and deterministic; publishes `llms.txt`/`llms-full.txt`; official MCP bindings server exists. Free tier (100k req/day) comfortably covers stated scale. **Cloudflare Pages is now in maintenance mode** — Cloudflare's own guidance directs new projects to Workers, which is what this repo already targets via `wrangler.jsonc` (note: `tech-stack.md` still labels this `cloudflare-pages`, which is stale).
- **Vercel** — Full markdown docs, GA CLI deploy/rollback/logs. Hobby (free) tier is **explicitly ToS-restricted to non-commercial use** — a real risk if this MVP is ever monetized, even though the current PRD has no payments in scope. MCP is public beta.
- **Netlify** — Official GA MCP server, good docs. Functions default to `us-east-1`, requiring manual config for EU-local latency; rollback has no CLI command (UI/API only).
- **Railway, Fly.io, Render** — All would require replacing `@astrojs/cloudflare` with `@astrojs/node` plus a Dockerfile/Nixpacks build. None offer a free tier suitable for always-on low-latency serving (Railway has no free tier; Fly.io removed its free tier in 2024; Render's free tier cold-starts after 15 min idle). Lower agent-friendly scores overall.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Already deployed, zero migration cost, best score across all five criteria, and matches the developer's stated platform familiarity. Free tier is more than sufficient for the PRD's small-scale, low-QPS target.

#### 2. Vercel

Best fallback if a Workers-specific limitation is hit (e.g. a `nodejs_compat` gap). Excellent CLI, docs, and deploy determinism, but the Hobby plan's non-commercial ToS restriction is a real gap for a product that may eventually charge users, and migration means swapping the Astro adapter and re-plumbing env vars.

#### 3. Netlify

Comparable overall strength to Vercel, official GA MCP server is a plus, but the default US function region and UI-only rollback are minor frictions an agent would have to work around, on top of the same adapter-migration cost as Vercel.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. `nodejs_compat` is not 100% Node API parity — a transitive dependency of the Supabase JS SDK or OpenRouter client could call an unsupported Node API and fail only in production/preview, not in local `astro dev` (which runs on Node, not `workerd`).
2. Free tier caps CPU at 10ms/invocation. The LLM call itself is I/O-bound and doesn't count against this, but any heavier in-request computation (e.g. the outlier-scoring formula run inline) could hit the cap under cold-start JIT warmup as usage grows.
3. `context/foundation/tech-stack.md` still records `deployment_target: cloudflare-pages`, but Pages is in maintenance mode. A future agent or contributor reading that file literally could scaffold a deprecated Pages setup instead of Workers.
4. Debugging is thinner than on Node-based PaaS: `wrangler tail` is live-only, with no persistent log storage/search without paying for Logpush or wiring a third-party sink — a real gap for a solo dev debugging an after-hours incident.
5. Vendor lock-in to `workerd` semantics (Web-standard Request/Response, no native `fs`) means the SSR entrypoint isn't a drop-in Node server if the project ever needs to leave Cloudflare.

### Pre-Mortem — How This Could Fail

The team assumed the free tier's 100k requests/day would always be enough and that `nodejs_compat` meant "basically Node." Six months in, a transitive dependency pulled in by a post-MVP admin/import feature called a Node API Workers doesn't support — it only broke in production because local dev ran on Node directly, not `workerd`. Meanwhile the outlier-scoring endpoint grew heavier as competitor lists expanded, tripping the 10ms free-tier CPU cap under load; requests started failing silently with no clear error surfaced to users. Because `wrangler tail` only streams logs live and no alerting was wired up (not included on the free tier), the solo dev didn't notice until users complained — by which point several days of failed requests had gone unnoticed.

### Unknown Unknowns

- Astro middleware or npm packages that assume `process`/`Buffer` exist unconditionally can fail differently at build time vs. runtime on Workers than in Node dev — worth a smoke-test deploy early in the build, not just at the end.
- `compatibility_date` in `wrangler.jsonc` pins runtime behavior; forgetting to bump it periodically silently forfeits newer `nodejs_compat` improvements.
- No built-in error alerting/monitoring ships on the free tier — failures surface only via user reports unless a third-party sink is wired up.
- `wrangler secret put` is per-environment; updating a "production" secret without also updating preview/staging environments leaves them silently stale.

**Decision**: proceed with Cloudflare Workers, risks noted. Given the low-QPS, external-Supabase, no-payments MVP scope, none of the surfaced risks are expected to bind before the 3-week deadline — they're tracked in the risk register below for awareness during and after build.

## Operational Story

- **Preview deploys**: Wrangler supports versioned/gradual deployments (`wrangler versions upload`) that generate preview URLs per version without shifting production traffic; CI currently auto-deploys to production on merge to `main` (per `tech-stack.md` hints: `ci_default_flow: auto-deploy-on-merge`) — no PR-preview step is wired up yet.
- **Secrets**: `SUPABASE_URL`/`SUPABASE_KEY` (and the OpenRouter API key) live as Worker secrets, set via `wrangler secret put <NAME>` per environment; locally they go in `.dev.vars` (gitignored). Only the developer (or CI with the Cloudflare API token) can set/rotate them — there is no dashboard-only path required.
- **Rollback**: `wrangler rollback [deployment-id]` reverts to a prior version instantly, no rebuild needed. No database migration rollback caveat applies here — Supabase Auth's `auth.users` table is the only table in use, no custom migrations to reverse.
- **Approval**: Routine deploys (build + `wrangler deploy`) can run unattended via CI. A human should approve: rotating the Supabase service-role/anon keys, changing `compatibility_date`, or any first-time secret provisioning.
- **Logs**: `wrangler tail` streams live production logs read-only from the CLI. There is no persistent log search on the free tier — for anything beyond live debugging, the developer must check request behavior interactively during the incident window.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| `nodejs_compat` gap breaks a Supabase/OpenRouter dependency only in production | Devil's advocate | L | M | Do an early smoke-test deploy to Workers (not just local `astro dev`) as soon as auth + first API route are wired up, not at the end of the build. |
| **Correction (2026-08-27)**: the specific `nodejs_compat` + SSR-middleware `[object Object]` bug ([withastro/astro#14511](https://github.com/withastro/astro/issues/14511)) is already resolved for this repo — `compatibility_date` in `wrangler.jsonc` (`2026-05-08`) is past the `2026-02-19` threshold where `fetch_iterable_type_support` auto-enables. No `disable_nodejs_process_v2` flag needed; only add it as a fallback if a smoke test ever shows `[object Object]` responses. | Research finding (verified via GitHub API) | — | — | No action; documented so a future agent doesn't add the flag speculatively. |
| Free-tier 10ms CPU cap trips under heavier scoring computation as usage grows | Devil's advocate / Pre-mortem | L | M | Keep the outlier-scoring formula lightweight and synchronous-cheap; if it grows heavier, move to the $5/mo Workers Paid plan (10M req + 30M CPU-ms included) rather than optimizing prematurely. |
| `tech-stack.md` says `cloudflare-pages` but Pages is in maintenance mode | Research finding | M | L | Update `context/foundation/tech-stack.md`'s `deployment_target` hint to `cloudflare-workers` to prevent a future agent from scaffolding a deprecated Pages setup. |
| No persistent log storage/alerting on free tier — failures go unnoticed until user reports | Pre-mortem / Unknown unknowns | M | M | Accept for MVP scope (solo dev, low QPS); if the app grows post-MVP, wire up Cloudflare Logpush or a lightweight third-party log sink. |
| Forgetting to bump `compatibility_date` misses `nodejs_compat` improvements | Unknown unknowns | L | L | Revisit `compatibility_date` in `wrangler.jsonc` during periodic dependency-update passes. |
| Secret updated in production but not preview/staging environment | Unknown unknowns | L | L | When rotating a secret, run `wrangler secret put` for every environment in use, not just production. |

## Getting Started

1. Confirm the adapter is current: `npx astro add cloudflare` is already applied in this repo (`@astrojs/cloudflare` in `package.json`); no adapter change needed.
2. Verify `wrangler.jsonc` has `compatibility_date` set to a recent date and `nodejs_compat` enabled if any Node APIs are used by dependencies (Supabase JS SDK).
3. Set local secrets: `cp .env.example .dev.vars` and fill in `SUPABASE_URL`, `SUPABASE_KEY`, and the OpenRouter API key.
4. For production, provision secrets once via `wrangler secret put SUPABASE_URL`, `wrangler secret put SUPABASE_KEY`, `wrangler secret put OPENROUTER_API_KEY` (or via the Cloudflare dashboard).
5. Deploy manually with `npx wrangler deploy` to validate the pipeline before relying on the CI auto-deploy-on-merge flow already configured in `.github/workflows/ci.yml`.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture (multi-region, HA, DR)
