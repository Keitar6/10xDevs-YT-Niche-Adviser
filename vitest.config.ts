import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Scoped to the pure service modules only: no jsdom, no React testing,
    // no setup files. The scoring core is the one thing a manual click-through
    // cannot verify (the repeatability NFR), so it is the one thing under test.
    include: ["src/lib/services/**/*.test.ts"],
  },
});
