# Cloudflare Workers Integration & Deployment Plan

## Context

`context/foundation/infrastructure.md` already recommends and locks in **Cloudflare Workers** as the deploy target, and the repo is already scaffolded for it (`@astrojs/cloudflare` adapter, `wrangler.jsonc`, `README.md` deploy instructions). But three things are out of sync with what infrastructure.md assumes or with known platform gotchas:

1. **CI has no deploy step at all.** `.github/workflows/ci.yml` only runs `lint` + `build` on push/PR to `master`. infrastructure.md's Operational Story says "CI currently auto-deploys to production on merge to `main`" — that's aspirational, not true yet. This plan wires up the actual deploy step (production-only — no PR previews for now).
2. **A known, exact-match production bug is not yet mitigated.** This project's stack (Astro 6.3.1 + `@astrojs/cloudflare` 13.5.0 + `nodejs_compat` + `src/middleware.ts` + `compatibility_date` past 2025-09-15) matches a documented Astro/Cloudflare interaction bug: with `nodejs_compat` enabled, workerd exposes a newer `process` global that makes Astro's Node-detection logic misfire, so SSR responses render as `[object Object]` instead of HTML on any route touched by middleware ([withastro/astro#15434](https://github.com/withastro/astro/issues/15434), corroborated by [MetaBureau's writeup](https://metabureau.com.au/blog/astro-deployment-mystery-nodejs-compat)). The fix is a one-line compatibility flag. This is not in infrastructure.md's risk register and should be applied proactively rather than discovered after a broken prod deploy.
3. **`tech-stack.md` still says `deployment_target: cloudflare-pages`**, which infrastructure.md already flagged as stale (Pages is in maintenance mode; this repo actually targets Workers). Low-risk but easy to fix now.

Goal: get the repo to a state where `git push` to `master` reliably and safely deploys to Cloudflare Workers, with the known SSR bug pre-empted, secrets correctly wired, and manual verification steps for the human (Cloudflare account setup, GitHub secrets, first deploy) clearly called out since those can't be done by the agent.

## Phase 1 — Fix stale/config gaps (agent-executable)

- [ ] **`wrangler.jsonc`**: add `"disable_nodejs_process_v2"` to `compatibility_flags` alongside the existing `"nodejs_compat"`. This is the confirmed fix for the `[object Object]` SSR bug described above — cheap, no known downside, and directly applicable to this repo's exact config (middleware + nodejs_compat + recent compatibility_date).
- [ ] **`context/foundation/tech-stack.md`**: update `hints.deployment_target` from `cloudflare-pages` to `cloudflare-workers`, matching infrastructure.md's already-noted correction (line 31 of infrastructure.md, risk register row on `tech-stack.md`).
- [ ] **`.github/workflows/ci.yml`**: add a `deploy` job (or step) that runs only on `push` to `master` (not on `pull_request`), after lint+build succeed:
  - Use `cloudflare/wrangler-action@v4` with `apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}`.
  - Pass `SUPABASE_URL` / `SUPABASE_KEY` through as build-time env (same as the existing build step) so the SSR build embeds them correctly, since Astro's `astro:env/server` reads them at build time via `envField`.
  - Command: `deploy` (default `wrangler deploy`), no `versions upload` preview path since PR previews are out of scope.
  - Keep this job dependent on (or merged into) the existing `ci` job so a failing lint/build never triggers a deploy.

## Phase 2 — Manual setup (cannot be done by the agent — human gate)

These require Cloudflare account access and GitHub repo admin rights, both outside agent reach. Track as checkboxes for the developer to complete alongside/after Phase 1 lands:

- [ ] Create a **scoped** Cloudflare API token (not the global API key): Workers Scripts:Edit + Account Settings:Read for this account only, no DNS/billing/other-zone access — matches infrastructure.md's "tokens are scoped, not master keys" posture.
- [ ] Add repo secrets in GitHub (`Settings → Secrets and variables → Actions`): `CLOUDFLARE_API_TOKEN` (new), confirm `SUPABASE_URL` / `SUPABASE_KEY` already exist (CI build already references them, so they likely do — verify, don't assume).
- [ ] Provision the same secrets as **Worker runtime secrets** (separate from GitHub Actions secrets — these are what the deployed Worker reads at request time): `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY`, once, from the developer's machine after `wrangler login`.
- [ ] Do **one manual `npx wrangler deploy`** from the developer's machine before merging the CI change, to confirm the token/account/project wiring works outside CI first — cheaper to debug locally than via a failed Actions run.

## Phase 3 — Verification (agent + human)

- [ ] After the `disable_nodejs_process_v2` flag is added, run `npm run build && npx wrangler dev --remote` (or a manual `wrangler deploy` to a scratch/staging check) and load a page that goes through `src/middleware.ts` (e.g. `/dashboard` — protected route) — confirm real HTML renders, not `[object Object]`.
- [ ] After Phase 2's manual deploy, confirm the live Worker URL serves the signin/dashboard flow correctly (Supabase cookies round-trip through SSR).
- [ ] Once CI deploy is wired and a real push to `master` runs it, check the Actions run log for the deploy step succeeding, then re-confirm the live URL.
- [ ] Sanity-check `wrangler.jsonc`'s `compatibility_date` is still current-ish (informational only, no action needed unless it's stale by months).

## Files touched

- `wrangler.jsonc` — add compat flag
- `context/foundation/tech-stack.md` — fix stale hint
- `.github/workflows/ci.yml` — add deploy step

## Out of scope (per infrastructure.md and current code state)

- `OPENROUTER_API_KEY` wiring — no code currently references OpenRouter (`src/lib/supabase.ts` and `astro.config.mjs` only declare Supabase env fields), so adding a secret/schema entry now would be speculative. Revisit when the LLM-justification feature is actually implemented.
- PR preview deployments (`wrangler versions upload`) — explicitly deferred.
- Log alerting/Logpush, multi-environment (staging) secrets — already tracked in infrastructure.md's risk register as post-MVP.
