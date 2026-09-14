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
