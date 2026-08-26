---
bootstrapped_at: 2026-08-26T00:00:00Z
starter_id: 10x-astro-starter
starter_name: 10x Astro Starter (Astro + Supabase + Cloudflare)
project_name: yt-niche-adviser
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: npm audit --json
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: yt-niche-adviser
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
```

### Why this stack

Solo creator building a small, after-hours MVP (3-week deadline) with must-have
email+password and Google OAuth login, per-user data isolation, a
deterministic outlier-scoring formula over YouTube API data, and an
LLM-generated one-sentence interpretive justification per content
opportunity — no payments, realtime, or background jobs in scope. This
repository is already scaffolded with the 10x Astro Starter (Astro + React
islands + TypeScript + Supabase for Postgres/auth + Cloudflare deploy), which
is also the recommended default for `(web-app, js)` and clears all four
agent-friendly gates, so the standard path was taken with no need to design a
custom stack. Supabase covers both auth flows and RLS-based per-user isolation
out of the box, directly matching the PRD's guardrails; the LLM call for the
justification sentence is a straightforward server-side fetch from an Astro
API route on Cloudflare Workers, no extra framework needed. Deployment stays
on cloudflare-pages (the starter's default, already wired in this repo's CI),
with GitHub Actions running lint + build and auto-deploying on merge to main —
the lowest-friction path for a solo, tight-timeline build.

## Pre-scaffold verification

| Signal      | Value                                        | Severity | Notes                                                             |
| ----------- | --------------------------------------------- | -------- | ------------------------------------------------------------------ |
| npm package | not run                                       | n/a      | `cmd_template` starts with `git clone`, no npm package to resolve |
| GitHub repo | not run                                       | n/a      | `gh` CLI unavailable in this environment; network check skipped  |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 1 (`node_modules/` — did not previously exist in cwd, moved silently)
**Conflicts (.scaffold siblings)**: `.env.example`, `.github/workflows/ci.yml`, `.husky/pre-commit`, `.nvmrc`, `.prettierrc.json`, `.vscode/extensions.json`, `.vscode/launch.json`, `.vscode/settings.json`, `astro.config.mjs`, `CLAUDE.md`, `components.json`, `eslint.config.js`, `package-lock.json`, `package.json`, `public/.assetsignore`, `public/favicon.png`, `public/template.png`, `README.md`, `src/components/auth/FormField.tsx`, `src/components/auth/PasswordToggle.tsx`, `src/components/auth/ServerError.tsx`, `src/components/auth/SignInForm.tsx`, `src/components/auth/SignUpForm.tsx`, `src/components/auth/SubmitButton.tsx`, `src/components/Banner.astro`, `src/components/Topbar.astro`, `src/components/ui/button.tsx`, `src/components/ui/LibBadge.astro`, `src/components/Welcome.astro`, `src/env.d.ts`, `src/layouts/Layout.astro`, `src/lib/config-status.ts`, `src/lib/supabase.ts`, `src/lib/utils.ts`, `src/middleware.ts`, `src/pages/api/auth/signin.ts`, `src/pages/api/auth/signout.ts`, `src/pages/api/auth/signup.ts`, `src/pages/auth/confirm-email.astro`, `src/pages/auth/signin.astro`, `src/pages/auth/signup.astro`, `src/pages/dashboard.astro`, `src/pages/index.astro`, `src/styles/global.css`, `supabase/.gitignore`, `supabase/config.toml`, `tsconfig.json`, `wrangler.jsonc`
**.gitignore handling**: identical between cwd and scaffold — nothing to append; scaffold copy discarded
**.bootstrap-scaffold cleanup**: deleted (including `.bootstrap-scaffold/.git/`, removed before the move-up)

Note: this cwd was already an instance of the exact starter being scaffolded (from an earlier manual bootstrap), so every tracked file the CLI produced already existed at the identical relative path — the conflict policy therefore sidelined nearly the entire tree as `.scaffold` siblings rather than moving fresh content. The only net-new addition was `node_modules/` (dependencies were not yet installed in this cwd).

## Post-scaffold audit

**Tool**: npm audit --json
**Summary**: 1 CRITICAL, 13 HIGH, 7 MODERATE, 2 LOW
**Direct vs transitive**: 0/1 CRITICAL direct, 1/13 HIGH direct, 2/7 MODERATE direct, 0/2 LOW direct (of total: 1 CRITICAL, 13 HIGH, 7 MODERATE, 2 LOW)

#### CRITICAL findings

- **tar** (transitive) — node-tar: PAX size override causing tar parser interpretation differential (file smuggling), process crash via PAX numeric path type confusion, decompression/parse DoS via unlimited input, negative entry size infinite loop, uncaught exception DoS via NUL byte in PAX records, uncontrolled recursion DoS via crafted long-path tar. Pulled in transitively via `supabase` (dev dependency, CLI tool).

#### HIGH findings

- **astro** (direct) — multiple XSS advisories (unescaped attribute names in spread props, unescaped spread attribute names in `renderHTMLElement`, unescaped `transition:*` directive values, unescaped View Transition animation properties, unescaped slot name), Host header SSRF in prerendered error page fetch, plus inherited advisories from `esbuild` and `sharp`.
- **brace-expansion** (transitive) — multiple ReDoS/DoS advisories via exponential or unbounded expansion.
- **devalue** (transitive, via Svelte tooling) — DoS via sparse array deserialization.
- **fast-uri** (transitive) — host confusion via backslash authority delimiter/introducer, failed IDN canonicalization.
- **js-yaml** (transitive) — quadratic-complexity DoS in merge-key handling, unbacked CVE fix in `!!omap` resolution.
- **miniflare** (transitive) — inherits `sharp`, `undici`, `ws` advisories.
- **nanoid** (transitive) — non-secure/custom generators can loop indefinitely with negative or zero size.
- **postcss** (transitive) — incomplete fix for sourceMappingURL path traversal, arbitrary `.map` file disclosure.
- **sharp** (transitive) — inherited `libvips` CVEs.
- **svgo** (transitive) — `removeScripts` plugin leaves some executable scripts intact.
- **undici** (transitive) — multiple advisories: TLS cert validation bypass via SOCKS5 proxy, HTTP header injection via Set-Cookie percent-decoding, WebSocket DoS, cross-origin request routing, SameSite downgrade, cache poisoning/desync, CRLF injection, and more.
- **vite** (transitive) — NTLMv2 hash disclosure via UNC path handling on Windows (via `launch-editor`), `server.fs.deny` bypass on Windows.
- **ws** (transitive) — uninitialized memory disclosure, memory exhaustion DoS from tiny fragments.

#### MODERATE findings

- **@astrojs/language-server** (transitive, via `volar-service-yaml`)
- **@cloudflare/vite-plugin** (transitive, via `miniflare`/`wrangler`/`ws`)
- **supabase** (direct, dev dependency) — via `tar`
- **volar-service-yaml** (transitive, via `yaml-language-server`)
- **wrangler** (direct) — via `esbuild`/`miniflare`
- **yaml** (transitive) — stack overflow via deeply nested YAML collections
- **yaml-language-server** (transitive, via `yaml`)

#### LOW / INFO findings

- **@babel/core** (transitive) — arbitrary file read via sourceMappingURL comment
- **esbuild** (transitive) — arbitrary file read on Windows dev server

## Hints recorded but not acted on

| Hint                     | Value           |
| ------------------------ | ---------------- |
| bootstrapper_confidence  | first-class      |
| quality_override         | false            |
| path_taken               | standard         |
| self_check_answers       | null             |
| team_size                | solo             |
| deployment_target        | cloudflare-pages |
| ci_provider              | github-actions   |
| ci_default_flow          | auto-deploy-on-merge |
| has_auth                 | true             |
| has_payments             | false            |
| has_realtime             | false            |
| has_ai                   | true             |
| has_background_jobs      | false            |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history — this cwd already has a `.git/`, so this is likely already done.
- Review the `.scaffold` siblings this run created (nearly the full starter tree, since cwd was already this exact starter) and delete them once you've confirmed nothing newer landed in them — a quick `diff <file> <file>.scaffold` per file is enough, or bulk-check with `find . -name '*.scaffold'`.
- Most `.scaffold` files here are expected to be identical or near-identical to your existing files (same starter, same version at clone time) — worth a spot check on `package.json.scaffold` and `astro.config.mjs.scaffold` in particular in case the upstream starter has since diverged from what this repo started with.
- Address audit findings per your project's risk tolerance — 1 CRITICAL (`tar`, transitive via `supabase` dev dependency) and 1 direct HIGH (`astro`, several XSS + SSRF advisories) are worth prioritizing; run `npm audit fix` or `npm update astro` to check for available patches before shipping to production.
