// playwright.config.ts
import { defineConfig } from "@playwright/test";

/** `astro dev` binds this by default; `use.baseURL` and `webServer` must agree. */
const PORT = 4321;
const BASE_URL = `http://localhost:${PORT}`;

/** Must match `ANTHROPIC_BASE_URL` / `YOUTUBE_API_BASE` in `.dev.vars.e2e`. */
const STUB_PORT = 9999;

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: BASE_URL },
  webServer: [
    {
      /**
       * YouTube and Anthropic, served from one local process. Started before the
       * app so the first Analyze of a run never races the stub's boot.
       *
       * `reuseExistingServer` is off even locally: unlike the dev server, this
       * one carries the fixture, so silently reusing whatever happens to hold
       * the port would let a stale copy decide what the assertions see.
       */
      command: "node e2e/stubs/upstream.mjs",
      url: `http://127.0.0.1:${STUB_PORT}/__health`,
      reuseExistingServer: false,
      timeout: 10_000,
    },
    {
      command: "npm run dev",
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      // The dev server needs a remote Cloudflare proxy session before it is
      // ready, so the default 60s is not enough on a cold start.
      timeout: 120_000,
      /**
       * The stub wiring, and it takes **two** channels because the app reads
       * configuration through two that are not the same place. Measured on
       * 2026-09-14 against a probe route that printed both; do not collapse them.
       *
       * 1. `astro:env/server` — in dev this resolves from the **Node** process
       *    that launches Astro (and from `.env`), *not* from the Worker env. So
       *    `YOUTUBE_API_BASE`, which `youtube.ts` imports from `astro:env/server`,
       *    has to be set right here. Putting it in `.dev.vars.e2e` instead looks
       *    right and silently does nothing: the value lands in the Worker env,
       *    the import still reads `undefined`, and the run quietly goes to the
       *    real googleapis — a green-looking test against live data.
       *
       * 2. `.dev.vars.e2e`, selected by `CLOUDFLARE_ENV` — this is the Worker
       *    env, which is what `cloudflare:workers` and the Anthropic SDK's own
       *    `process.env` lookup *inside workerd* read. `ANTHROPIC_BASE_URL` has
       *    to live there, because the SDK resolves it itself and never goes
       *    through `astro:env`.
       *
       * `CLOUDFLARE_ENV` is what makes the switch e2e-only: `npm run dev` on its
       * own reads plain `.dev.vars` and talks to the real APIs. Note that
       * `.dev.vars.e2e` **replaces** `.dev.vars` rather than merging with it —
       * wrangler's `loadDotDevDotVars` tries `.dev.vars.<env>` first and only
       * falls back — so that file must stay a full copy plus the seams. The
       * "No environment found in configuration with name e2e" warning wrangler
       * prints is expected and harmless; the file is selected by name, not by a
       * `[env.e2e]` section.
       */
      env: {
        CLOUDFLARE_ENV: "e2e",
        YOUTUBE_API_BASE: `http://127.0.0.1:${STUB_PORT}/youtube/v3`,
      },
    },
  ],
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { storageState: "playwright/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],
});
