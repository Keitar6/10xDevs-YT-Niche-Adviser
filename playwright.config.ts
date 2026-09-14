// playwright.config.ts
import { defineConfig } from "@playwright/test";

/** `astro dev` binds this by default; `use.baseURL` and `webServer` must agree. */
const PORT = 4321;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: BASE_URL },
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    // The dev server needs a remote Cloudflare proxy session before it is
    // ready, so the default 60s is not enough on a cold start.
    timeout: 120_000,
    /**
     * `env` here reaches the *Node process that launches Astro* — it does not
     * reach the app. Verified on 2026-09-14: with `YOUTUBE_API_KEY=""` and
     * `ANTHROPIC_BASE_URL=…` exported into `npm run dev`, the running app still
     * used the real key and still called the real Anthropic endpoint. Under
     * `@astrojs/cloudflare` v13 the SSR runs in workerd via
     * `@cloudflare/vite-plugin`, so `astro:env/server` *and* the Anthropic
     * SDK's own `process.env` lookup both read the Worker's env, not ours.
     *
     * `CLOUDFLARE_ENV` is the one variable that does cross, because the plugin
     * reads it in Node while building its config: with it set, the plugin also
     * loads `.dev.vars.<value>`. That file is where the stub wiring goes, and
     * setting it here is what makes the switch e2e-only — `npm run dev` on its
     * own still reads plain `.dev.vars`.
     *
     * Confirmed end-to-end: `ANTHROPIC_BASE_URL` in `.dev.vars.e2e` reaches the
     * SDK, and the app degrades exactly as Risk #1 describes
     * (`justifications_available: false`).
     *
     * One limit worth knowing before adding a key: a key already present in
     * `.dev.vars` keeps that value — `.dev.vars.e2e` adds, it does not
     * override. The stub seams therefore have to be *new* names
     * (`ANTHROPIC_BASE_URL`, and `YOUTUBE_API_BASE` once `youtube.ts` reads
     * one), never a redefinition of `ANTHROPIC_API_KEY` or `YOUTUBE_API_KEY`.
     */
    env: { CLOUDFLARE_ENV: "e2e" },
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { storageState: "playwright/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],
});
