# Rules for AI

This file provides guidance to AI Agent when working with code in this repository.

## Commands

- `npm run dev` — start dev server (Cloudflare workerd runtime)
- `npm run build` — production build (SSR via `@astrojs/cloudflare`)
- `npm run preview` — preview production build
- `npm run typecheck` — `astro check` over the whole tree, tests included (~14s)
- `npm run lint` — ESLint with type-checked rules
- `npm run lint:fix` — auto-fix lint issues
- `npm run format` — Prettier (includes prettier-plugin-astro + prettier-plugin-tailwindcss)
- `npm run format:check` — Prettier in check mode; this is the CI gate
- `npm test` — Vitest (services, route guards, middleware, source scans); no database needed
- `npm run test:db` — pgTAP policy suite under `supabase/tests/`; needs Docker + `npx supabase start`

Pre-commit hooks: husky + lint-staged runs `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}`.

## Architecture

**Astro 6 SSR app** with React 19 islands, Tailwind 4, Supabase auth, and shadcn/ui components. Deployed to Cloudflare Workers.

### Rendering mode

Full server-side rendering (`output: "server"` in astro.config.mjs). All pages and API routes are server-rendered by default, so `export const prerender = false` is redundant and no route in this project declares it.

**API route auth:** `PROTECTED_ROUTES` in `src/middleware.ts` only redirects _page_ requests; it does not cover `/api/*`. Every API route that touches user data must check `context.locals.user` itself and return a 401 when absent (see `src/pages/api/profile.ts`).

### Auth flow

- `src/lib/supabase.ts` — creates a Supabase SSR client using `@supabase/ssr` with cookie-based sessions. Uses `astro:env/server` for `SUPABASE_URL` and `SUPABASE_KEY` (server-only secrets declared in astro.config.mjs `env.schema`).
- `src/middleware.ts` — runs on every request, resolves the current user, attaches to `context.locals.user`. Redirects unauthenticated users away from routes listed in `PROTECTED_ROUTES`.
- API endpoints: `src/pages/api/auth/{signin,signup,signout}.ts`
- Auth pages: `src/pages/auth/{signin,signup,confirm-email}.astro`
- Protected page example: `src/pages/dashboard.astro`

### Key conventions

- **Path alias**: `@/*` maps to `./src/*` (tsconfig paths).
- **Tailwind class merging**: use the `cn()` helper from `@/lib/utils` (clsx + tailwind-merge) for conditional/merged class names. Do not concatenate class strings manually.
- **shadcn/ui**: components live in `src/components/ui/`, "new-york" style variant. Install new ones with `npx shadcn@latest add [name]`.
- **API routes**: validate input with zod.
- **Supabase migrations**: live in `supabase/migrations/`, named `YYYYMMDDHHmmss_short_description.sql`. Always enable RLS with granular per-operation, per-role policies — four policies (`select` / `insert` / `update` / `delete`) scoped `to authenticated` with an `auth.uid()` ownership test, never one `for all`. Every `update` policy needs **both** `using` and `with check`; a `using`-only one lets an owner reassign their row to somebody else.
- **React**: no Next.js directives ("use client" etc.). Extract hooks to `src/components/hooks/`.
- **Services/helpers** go in `src/lib/` (or `src/lib/services/` for extracted business logic).
- **Shared types** (entities, DTOs) go in `src/types.ts`.

### Access control is enforced by the database, and proved by test

There is **no service-role client anywhere in `src/`**, and there must not be.
Every Supabase client comes from the single cookie-scoped anon-key factory at
`src/lib/supabase.ts`, so RLS is not defence-in-depth here — it is the only
thing standing between two users. The `.eq("user_id", …)` filters in the routes
exist to make intent legible, not to enforce. A service-role client would demote
RLS from guarantee to decoration in one line, which is why
`src/lib/no-privileged-client.test.ts` fails the build if one appears.

**`npm run test:db` is a required local gate before any change under
`supabase/migrations/` lands.** It runs the pgTAP suite in `supabase/tests/`,
which proves per-verb, per-role isolation across `channel_profiles`,
`content_opportunities` and the `avatars` bucket. It needs Docker and a running
local stack (`npx supabase start`); see `supabase/tests/README.md` for the
fixture and impersonation conventions before adding a file.

It also runs in CI, as its own `db` job in `.github/workflows/ci.yml`, but
**only when the change touches `supabase/**`** — a `changes` job diffs the event
against its base and the `db` job carries a job-level
`if: needs.changes.outputs.supabase == 'true'`. The scoping exists because this
is the only job that needs a container runtime; the start is trimmed with
`supabase start -x …` to the database container alone, which is all pgTAP
touches. Running it locally stays the fast path — it is the same five files and
the same 77 assertions, without waiting on a runner.

Two things about that wiring are easy to break and expensive to rediscover.
The scoping is a **job-level `if:`**, never a workflow-level `paths:` filter: a
workflow skipped by `paths:` leaves its checks Pending, and a Pending required
check blocks the merge forever. And the exclusion list is load-bearing — if a
pgTAP file ever goes red under the trimmed start, restore the container it needs
rather than weakening the assertion. Both are written up in
`context/foundation/test-plan.md` §6.7.

### Environment

- Node.js v22.14.0 (see `.nvmrc`)
- Env vars: `SUPABASE_URL`, `SUPABASE_KEY` (copy `.env.example` to `.env` for Node, or `.dev.vars` for Cloudflare local dev)
- Local Supabase: `npx supabase start` (requires Docker)
- Cloudflare local dev: secrets go in `.dev.vars` (gitignored)
- Deploy: `npx wrangler deploy` (requires Cloudflare account + `wrangler` auth)

## CI

GitHub Actions workflow (`.github/workflows/ci.yml`), on every push and PR to master. One job, `ci`, running in order:

`npm ci` → `npm run format:check` → `npx astro sync` → `npm run lint` → `npm run typecheck` → `npm test` → `npm run build` → deploy (master pushes only)

Two orderings are load-bearing rather than cosmetic. `format:check` runs first because it is the cheapest gate (~2s) and should not queue behind a typecheck. `typecheck` must run **after** `astro sync`, because `astro check` reads the types `sync` generates — put it earlier and it fails on missing generated types rather than on your code.

The build step needs the `SUPABASE_URL`, `SUPABASE_KEY`, `YOUTUBE_API_KEY` and `ANTHROPIC_API_KEY` repository secrets; `astro sync` and `astro build` additionally open a remote Cloudflare proxy session using `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`, which is why those two are set job-wide rather than on the deploy step.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 3, Lesson 4 (E2E Tests)

**For E2E tests, use the `/10x-e2e` skill.** It is the single source of truth
for the workflow — risk → seed test + rules → generate → review against the five
anti-patterns → re-prompt → verify. The skill's `references/` carry the full
rules, anti-patterns, seed pattern, and prompt-template.

A few hard rules that hold even before you invoke the skill:

- **Locators:** `getByRole` / `getByLabel` / `getByText` first; `getByTestId`
  only when accessibility attributes are ambiguous. Never CSS selectors, XPath,
  or DOM structure.
- **Never `page.waitForTimeout()`.** Wait for state: `toBeVisible()`,
  `waitForURL()`, `waitForResponse()`.
- **Test independence + cleanup.** Each test runs standalone — its own setup,
  action, assertion, and cleanup; unique ids (timestamp suffix) so parallel runs
  and re-runs don't collide.

Two boundaries to keep straight:

- **DOM (snapshot) is the default.** Vision (`--caps=vision`) is a supplement for
  visual-only risks (layout, z-index, animation); for pixel regression prefer
  deterministic tools (`toMatchSnapshot`, Argos, Lost Pixel). VLM model
  selection/cost is a debugging topic (Lesson 5), not testing.
- **Healer helps on selectors, harms on logic.** A changed selector → healer
  re-finds it (route through PR review). A changed business behavior → healer
  masks the bug; that failing-test-to-fix case is Lesson 5.

<!-- END @przeprogramowani/10x-cli -->
