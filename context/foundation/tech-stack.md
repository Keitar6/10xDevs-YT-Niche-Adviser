---
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
---

## Why this stack

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
