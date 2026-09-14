// @ts-check
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  output: "server",
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
    // Resolve dependencies the way the Worker runtime actually is — a
    // browser-like environment — rather than as Node.
    //
    // Without this, Vite's SSR resolver hands `@anthropic-ai/sdk` its Node
    // entry, which pulls in `internal/node.mjs`: a module whose only job is to
    // re-export `node:child_process`, `node:crypto`, `node:os` and friends.
    // workerd has no `node:child_process` at all, and the bundler dropped the
    // import while keeping the reference, shipping a chunk that threw
    // `ReferenceError: cp is not defined` on module evaluation. Rollup had
    // merged `src/lib/http.ts` into that same chunk, so every route importing
    // `jsonError` — profile, signin, analyze, avatar, opportunities — 500'd
    // with an empty body before its handler ever ran, while `/api/auth/signout`
    // (the one route that does not import it) kept working.
    //
    // The SDK already ships the fix in its own `browser` field, which maps
    // those Node shims to browser-safe twins; `mainFields` is what makes Vite
    // honour that field on the server build. Guard: a production build must
    // emit no `node:child_process` import — `grep -r "node:child_process" dist/`
    // comes back empty.
    ssr: {
      resolve: {
        mainFields: ["browser", "module", "jsnext:main", "jsnext"],
        conditions: ["workerd", "worker", "browser", "module", "import", "default"],
      },
    },
  },
  adapter: cloudflare(),
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      YOUTUBE_API_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      // Test seam only. Left unset everywhere except `.dev.vars.e2e`, where it
      // points the Data API calls at the local stub so an e2e run is
      // deterministic and costs no quota. `ANTHROPIC_BASE_URL` is the same idea
      // on the other boundary, but the SDK reads that one itself so it needs no
      // declaration here.
      YOUTUBE_API_BASE: envField.string({ context: "server", access: "secret", optional: true }),
      ANTHROPIC_API_KEY: envField.string({ context: "server", access: "secret", optional: true }),
    },
  },
});
