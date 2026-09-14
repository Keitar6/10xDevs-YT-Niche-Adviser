import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  resolve: {
    // Mirrors the `@/*` mapping in tsconfig.json. Route handlers import through
    // it (`@/lib/supabase`, `@/lib/http`), so the suite cannot resolve them
    // without this.
    alias: {
      "@": src,
      // Three virtual modules that only exist inside an Astro or workerd build.
      // Aliasing them to local stubs is what makes route handlers importable at
      // all — see the header comments in src/test/stubs/. This is deliberately
      // *not* `getViteConfig()` from astro/config: pulling in the Astro and
      // Cloudflare adapter pipelines would trade an instant test run for a full
      // build on every invocation, to resolve three modules the tests stub out
      // anyway.
      "astro:env/server": `${src}/test/stubs/astro-env-server.ts`,
      "cloudflare:workers": `${src}/test/stubs/cloudflare-workers.ts`,
      "astro:middleware": `${src}/test/stubs/astro-middleware.ts`,
    },
  },
  test: {
    // The scoring core was the original occupant: it is the one thing a manual
    // click-through cannot verify (the repeatability NFR). The scope has since
    // widened to the access-control boundary — the route guards, the session
    // resolution in the middleware, and the source scan that pins the
    // no-service-role-client invariant the whole pgTAP suite rests on.
    // One glob over all of `src/` rather than a list of the directories that
    // happen to hold tests today. An allowlist has the same failure mode this
    // suite exists to eliminate: a test written outside it is silently never
    // run — no error, no warning, green CI. Narrow this only with `exclude`,
    // where the omission is deliberate and visible.
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
