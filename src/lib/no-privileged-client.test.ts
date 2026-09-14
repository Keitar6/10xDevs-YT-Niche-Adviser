/**
 * A grep wearing a test's clothes — deliberately, and this comment exists so
 * the next reader does not "fix" it.
 *
 * Everything else in this change proves that row-level security refuses a
 * stranger. All of it is conditional on one thing: that the application only
 * ever talks to Postgres through a cookie-scoped anon-key client, whose
 * statements RLS actually evaluates. A `service_role` client **bypasses RLS
 * entirely, by design**. The moment one appears, every pgTAP assertion under
 * `supabase/tests/` stops describing production — the policies still pass their
 * own tests while the application walks around them.
 *
 * There is no behaviour to assert here, because the failure is an *absence* of
 * behaviour: nothing breaks, no test goes red, the app keeps working, and the
 * isolation guarantee is simply gone. The only way to catch that is to look at
 * the source. Hence this file.
 *
 * It mirrors in machine-checkable form an invariant currently stated in prose at
 * `src/lib/services/avatar-storage.ts:14-16`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("..", import.meta.url));

/** The one file allowed to build a Supabase client. */
const CLIENT_FACTORY = "lib/supabase.ts";

/**
 * Excluded because they are *about* the invariant rather than subject to it:
 * this file names the forbidden strings in order to search for them, and the
 * stub directory exists only under Vitest and reaches no database at all.
 */
const EXEMPT = ["lib/no-privileged-client.test.ts", "test/stubs/"];

const EXTENSIONS = [".ts", ".tsx", ".astro"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return EXTENSIONS.some((ext) => entry.endsWith(ext)) ? [full] : [];
  });
}

const FILES = sourceFiles(SRC).map((full) => ({
  path: relative(SRC, full).replaceAll("\\", "/"),
  text: readFileSync(full, "utf8"),
}));

const SCANNED = FILES.filter((file) => !EXEMPT.some((prefix) => file.path.startsWith(prefix)));

describe("no privileged Supabase client exists in src/", () => {
  it("finds source files to scan at all", () => {
    // Without this, a broken walk would make every assertion below pass by
    // scanning nothing — the same vacuous-green failure `00-harness.test.sql`
    // guards against on the database side.
    expect(SCANNED.length).toBeGreaterThan(20);
    expect(SCANNED.map((f) => f.path)).toContain(CLIENT_FACTORY);
  });

  it.each([
    // The env var and the JWT role claim, in both casings used in the wild.
    ["service_role", /service_role/],
    ["serviceRole", /serviceRole/],
    ["SERVICE_ROLE", /SERVICE_ROLE/],
    // The admin API: `supabase.auth.admin.*` runs with the service key and can
    // read or mutate any user.
    ["auth.admin", /auth\s*\.\s*admin\b/],
  ])("no file mentions %s", (_label, pattern) => {
    const offenders = SCANNED.filter((file) => pattern.test(file.text)).map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("only src/lib/supabase.ts imports a client constructor from @supabase/*", () => {
    // Type-only imports are fine and common (`import type { SupabaseClient }`),
    // so the pattern matches a value import of a constructor specifically.
    const constructorImport =
      /import\s+(?!type\b)\{[^}]*\b(createClient|createServerClient|createBrowserClient)\b[^}]*\}\s*from\s*["']@supabase\/(ssr|supabase-js)["']/;

    const offenders = SCANNED.filter((file) => file.path !== CLIENT_FACTORY && constructorImport.test(file.text)).map(
      (f) => f.path,
    );

    expect(offenders).toEqual([]);
  });

  it("the one permitted factory is still the cookie-scoped anon-key one", () => {
    const factory = SCANNED.find((f) => f.path === CLIENT_FACTORY);
    expect(factory).toBeDefined();

    // `SUPABASE_KEY` is documented as the anon key in `.env.example:6`. Reading
    // it from `astro:env/server` (declared `access: "secret"` in
    // astro.config.mjs) plus wiring `cookies` is what makes every statement this
    // client issues run as the signed-in user rather than as a superuser.
    expect(factory?.text).toMatch(/SUPABASE_KEY/);
    expect(factory?.text).toMatch(/cookies\s*:/);
  });
});
