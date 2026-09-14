/**
 * The route-layer half of the per-user isolation proof.
 *
 * The pgTAP suite under `supabase/tests/` proves the database refuses a
 * stranger. This file proves the layer above it never gets the chance to ask on
 * a stranger's behalf: every data-touching handler refuses a caller with no
 * session, and the two handlers that read a JSON body take ownership from that
 * session rather than from the body.
 *
 * **Exhaustiveness is the point.** `context/foundation/test-plan.md` §2 names
 * "testing one representative route and assuming the rest follow" as the
 * anti-pattern for this risk, and it is a live one here: `PROTECTED_ROUTES` in
 * `src/middleware.ts` covers *pages* only, so `/api/*` is unguarded unless each
 * handler guards itself. There is no shared wrapper to test once. The table
 * below therefore carries every data-touching handler, and a new route that
 * forgets its guard is caught by adding a row rather than by remembering to
 * write a test.
 *
 * `/api/auth/*` is deliberately absent: those five handlers *establish* the
 * session rather than consume it, and share no contract with the seven below.
 *
 * **Scope is `/api/*` only.** SSR pages and components read user data too —
 * `src/pages/dashboard.astro`, `src/components/Topbar.astro` and
 * `src/components/Welcome.astro` all call a loader in frontmatter, and the last
 * two render on `/`, which is not in `PROTECTED_ROUTES`. Their guard is a
 * `user ? … : …` ternary rather than a 401, so they share no contract with the
 * handlers below and nothing here pins them. The residual risk is small — the
 * user id is session-derived and RLS backstops it — but "every data-touching
 * handler" above means every *API* handler, and that limit is stated rather
 * than left to be inferred.
 *
 * **The leading underscore is load-bearing.** This file has to live inside
 * `src/pages/api/` — `handlersOnDisk()` below walks its own directory, which is
 * what makes the coverage assertion exhaustive rather than a list somebody has
 * to remember to update. But every `.ts` under `src/pages/` is a route to
 * Astro, and without the `_` prefix this one was built and deployed as a live
 * `/api/routes.test` endpoint, dragging Vitest's internals into the production
 * Worker bundle with it. The prefix is Astro's documented opt-out from routing;
 * it is invisible to the Vitest glob (`src/**\/*.test.ts`) and to the walk,
 * which skips `.test.ts` either way.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { APIContext } from "astro";

// Recording fake, installed in place of the one Supabase client factory. Route
// handlers reach the database only through `createClient`, so replacing it is
// enough to observe exactly what row a handler would have written.
const createClient = vi.fn<() => unknown>();
vi.mock("@/lib/supabase", () => ({ createClient: () => createClient() }));

import { POST as analyzePost } from "./analyze";
import { POST as profilePost } from "./profile";
import { POST as opportunitiesPost, DELETE as opportunitiesDelete } from "./opportunities";
import { POST as avatarPost, DELETE as avatarDelete } from "./avatar";
import { POST as avatarGeneratePost } from "./avatar/generate";

const USER_A = "aaaaaaaa-0000-0000-0000-000000000001";
const STRANGER = "bbbbbbbb-0000-0000-0000-000000000002";

type Handler = (context: APIContext) => Response | Promise<Response>;

function makeContext(options: { userId?: string | null; body?: unknown; url?: string }): APIContext {
  const url = new URL(options.url ?? "https://example.test/api/x");
  const request = new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return {
    request,
    url,
    cookies: { get: () => undefined, set: () => undefined },
    locals: { user: options.userId ? { id: options.userId } : null },
  } as unknown as APIContext;
}

/**
 * Chainable stand-in for the PostgREST query builder, recording the row handed
 * to `insert` / `upsert` and the filters applied. Only the shapes the seven
 * handlers actually use are implemented; anything else should fail loudly.
 */
function makeSupabaseFake(result: { data: unknown; error: unknown }) {
  const recorded: {
    table?: string;
    written?: Record<string, unknown>;
    filters: [string, unknown][];
  } = { filters: [] };

  const terminal = {
    single: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };

  const builder = {
    insert(row: Record<string, unknown>) {
      recorded.written = row;
      return builder;
    },
    upsert(row: Record<string, unknown>) {
      recorded.written = row;
      return builder;
    },
    delete() {
      return builder;
    },
    eq(column: string, value: unknown) {
      recorded.filters.push([column, value]);
      return builder;
    },
    select() {
      return terminal;
    },
  };

  return {
    client: {
      from(table: string) {
        recorded.table = table;
        return builder;
      },
    },
    recorded,
  };
}

beforeEach(() => {
  createClient.mockReset();
});

const API_DIR = fileURLToPath(new URL(".", import.meta.url));

/**
 * Every exported HTTP verb under `src/pages/api/`, as `"<VERB> /api/<path>"`.
 *
 * Read from the source text rather than imported: this runs before the table
 * below and must not depend on any handler module loading successfully.
 */
function handlersOnDisk(): string[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) return walk(full);
      return entry.endsWith(".ts") && !entry.endsWith(".test.ts") ? [full] : [];
    });

  return walk(API_DIR)
    .map((full) => relative(API_DIR, full).replaceAll("\\", "/"))
    .filter((path) => !path.startsWith("auth/"))
    .flatMap((path) => {
      const text = readFileSync(join(API_DIR, path), "utf8");
      const verbs = [...text.matchAll(/^export const (GET|POST|PUT|PATCH|DELETE)\b/gm)].map((m) => m[1]);
      const route = `/api/${path.replace(/\.ts$/, "").replace(/\/index$/, "")}`;
      return verbs.map((verb) => `${verb} ${route}`);
    })
    .sort();
}

/**
 * Every handler under `/api/` that touches user data.
 *
 * `ownerField` records where a client could plausibly try to plant an owner
 * identifier. The five `null` entries are not omissions — they are the reason
 * those handlers need no ownership test: `analyze` and `avatar/generate` read
 * no request body at all (both are defined entirely by the caller's saved
 * profile), and `avatar` POST reads raw image bytes rather than JSON. There is
 * no field to plant.
 */
const DATA_ROUTES: { name: string; handler: Handler; ownerField: string | null }[] = [
  { name: "POST /api/analyze", handler: analyzePost as Handler, ownerField: null },
  { name: "POST /api/profile", handler: profilePost as Handler, ownerField: "user_id" },
  { name: "POST /api/opportunities", handler: opportunitiesPost as Handler, ownerField: "user_id" },
  { name: "DELETE /api/opportunities", handler: opportunitiesDelete as Handler, ownerField: null },
  { name: "POST /api/avatar", handler: avatarPost as Handler, ownerField: null },
  { name: "DELETE /api/avatar", handler: avatarDelete as Handler, ownerField: null },
  { name: "POST /api/avatar/generate", handler: avatarGeneratePost as Handler, ownerField: null },
];

describe("every data-touching route refuses a caller with no session", () => {
  it("covers every data-touching handler that exists on disk", () => {
    // Derived from the filesystem, not from a hardcoded count. A count guards
    // the table against quietly shrinking, but only a walk guards the codebase
    // against growing: a new `/api/*` route that forgets its 401 guard and is
    // never added to `DATA_ROUTES` would otherwise produce no failure at all —
    // which is precisely the "remember to write a test" trap this file claims
    // to remove. `/api/auth/*` is excluded here for the reason given above.
    expect(handlersOnDisk()).toEqual(DATA_ROUTES.map((route) => route.name).sort());
  });

  it.each(DATA_ROUTES)("$name answers 401 with no data", async ({ handler }) => {
    const response = await handler(makeContext({ userId: null }));

    expect(response.status).toBe(401);

    // The body must be the `jsonError` envelope and nothing else. A handler that
    // leaked a row, a user id, or a stack trace alongside its 401 would still
    // have the right status — the shape is what makes it a refusal.
    // `Record<string, unknown>` and no narrower: the two assertions below are
    // what prove the envelope has exactly one key and that it is a string. A
    // `{ error: string }` annotation would assert that at the type level and
    // leave both checks tautological.
    const body: Record<string, unknown> = await response.json();
    expect(Object.keys(body)).toEqual(["error"]);
    expect(typeof body.error).toBe("string");
  });

  it("constructs no Supabase client when there is no session", async () => {
    // The 401 check is the first statement in every handler, so a sessionless
    // request must never reach the database layer at all.
    for (const { handler } of DATA_ROUTES) {
      await handler(makeContext({ userId: null }));
    }
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("ownership comes from the session, never from the request body", () => {
  it("POST /api/profile stores the session's user id even when the body names another", async () => {
    const fake = makeSupabaseFake({
      data: {
        id: "row-1",
        user_id: USER_A,
        niche: "woodworking",
        sub_niche: null,
        competitors: [
          { id: "UCaaaaaaaaaaaaaaaaaaaaaa", handle: null, title: null },
          { id: "UCbbbbbbbbbbbbbbbbbbbbbb", handle: null, title: null },
          { id: "UCcccccccccccccccccccccc", handle: null, title: null },
        ],
        avatar_path: null,
        created_at: "2026-09-14T00:00:00Z",
        updated_at: "2026-09-14T00:00:00Z",
      },
      error: null,
    });
    createClient.mockReturnValue(fake.client);

    const response = await profilePost(
      makeContext({
        userId: USER_A,
        body: {
          niche: "woodworking",
          competitors: ["UCaaaaaaaaaaaaaaaaaaaaaa", "UCbbbbbbbbbbbbbbbbbbbbbb", "UCcccccccccccccccccccccc"],
          // The planted field. Zod strips it before the handler ever sees it,
          // and the handler names `user_id` explicitly from the session
          // afterwards — two independent reasons this cannot work. The test
          // pins the outcome, so removing either one is caught.
          user_id: STRANGER,
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(fake.recorded.table).toBe("channel_profiles");
    expect(fake.recorded.written?.user_id).toBe(USER_A);
  });

  it("POST /api/opportunities stores the session's user id even when the body names another", async () => {
    const fake = makeSupabaseFake({
      data: { id: "row-1", user_id: USER_A, video_id: "vid-alpha" },
      error: null,
    });
    createClient.mockReturnValue(fake.client);

    const response = await opportunitiesPost(
      makeContext({
        userId: USER_A,
        body: {
          video_id: "vid-alpha",
          title: "Alpha",
          channel_id: "UCaaaaaaaaaaaaaaaaaaaaaa",
          channel_title: "Channel A",
          published_at: "2026-09-01T00:00:00Z",
          view_count: 120000,
          outlier_score: 4.5,
          channel_median: 26000,
          sample_size: 20,
          justification: null,
          user_id: STRANGER,
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(fake.recorded.table).toBe("content_opportunities");
    // `src/pages/api/opportunities.ts:43` spreads the parsed body *before*
    // setting `user_id`, so the session value wins by construction. This pins
    // that ordering: swapping the two would silently reintroduce the vector.
    expect(fake.recorded.written?.user_id).toBe(USER_A);
  });

  it("DELETE /api/opportunities scopes the delete to the session's user id", async () => {
    const fake = makeSupabaseFake({ data: [{ id: "11111111-1111-4111-8111-111111111111" }], error: null });
    createClient.mockReturnValue(fake.client);

    await opportunitiesDelete(
      makeContext({
        userId: USER_A,
        url: "https://example.test/api/opportunities?id=11111111-1111-4111-8111-111111111111",
      }),
    );

    // The row id is a *selector* inside an owner-scoped filter, never the
    // authority for the delete. Both filters must be present.
    expect(fake.recorded.filters).toEqual([
      ["id", "11111111-1111-4111-8111-111111111111"],
      ["user_id", USER_A],
    ]);
  });
});

describe("a stranger's row is indistinguishable from a row that never existed", () => {
  it("DELETE /api/opportunities answers 404, not 403, and names nothing", async () => {
    // An empty array is exactly what the double-scoped delete returns for
    // somebody else's row, because RLS filtered it away before the delete.
    const fake = makeSupabaseFake({ data: [], error: null });
    createClient.mockReturnValue(fake.client);

    const response = await opportunitiesDelete(
      makeContext({
        userId: USER_A,
        url: "https://example.test/api/opportunities?id=99999999-9999-4999-8999-999999999999",
      }),
    );

    // This reads like a bug and is not one: a 403 would confirm that the id
    // exists and belongs to someone, which is precisely what the route declines
    // to reveal. See src/pages/api/opportunities.ts:99-103. A well-meaning
    // "fix" to 403 turns this route into an existence oracle.
    expect(response.status).toBe(404);

    // `Record<string, unknown>` and no narrower, for the reason given at the
    // 401 site above: the key-set assertion is what proves the envelope, so a
    // `{ error: string }` annotation would make it tautological.
    const body: Record<string, unknown> = await response.json();
    expect(Object.keys(body)).toEqual(["error"]);
    // The message must not distinguish "someone else's row" from "already gone".
    expect(body.error).not.toMatch(/permission|forbidden|not yours|another user/i);
  });
});
