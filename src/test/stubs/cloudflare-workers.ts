/**
 * Stand-in for `cloudflare:workers` under Vitest.
 *
 * `src/pages/api/analyze.ts:15` and `src/pages/api/avatar/generate.ts:13` read
 * their Workers bindings off the module-level `env` export (the Astro 6 /
 * @astrojs/cloudflare v13 replacement for `context.locals.runtime.env`). The
 * module is provided by the workerd runtime and does not resolve under Node, so
 * both handlers are unimportable without this alias.
 *
 * The bindings are absent rather than faked. Both handlers read `env` only
 * after their 401 guard has already returned, so the route tests never touch
 * it — and a test that did would fail on a missing binding, which is the honest
 * outcome for a suite that does not stand up a Workers runtime.
 */
export const env: Record<string, unknown> = {};
