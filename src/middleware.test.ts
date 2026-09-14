/**
 * One assertion protecting all seven route guards.
 *
 * Every `/api/*` handler decides whether to refuse a caller by reading
 * `context.locals.user`, and `src/middleware.ts` is the only thing that ever
 * sets it. So the question "are the routes guarded?" reduces to "is
 * `locals.user` trustworthy?", and that reduces to *which* Supabase call
 * produced it.
 *
 * `getUser()` makes a round trip that verifies the JWT against the auth server.
 * `getSession()` decodes the cookie locally and trusts what it finds. Swapping
 * one for the other changes nothing observable — same shape, same user object,
 * every test still green — while silently making all seven guards trust a token
 * nobody checked. That is why this file asserts on *which method was called*
 * rather than on the resulting behaviour: the behaviour is identical, and the
 * difference is the whole point.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn<() => unknown>();
vi.mock("@/lib/supabase", () => ({ createClient: () => createClient() }));

import { onRequest } from "./middleware";

const getUser = vi.fn();
const getSession = vi.fn();

function makeSupabaseFake() {
  return { auth: { getUser, getSession } };
}

function makeContext(pathname = "/") {
  const url = new URL(`https://example.test${pathname}`);
  return {
    request: new Request(url),
    url,
    cookies: { get: () => undefined, set: () => undefined },
    locals: {} as { user: unknown },
    redirect: (location: string) => new Response(null, { status: 302, headers: { location } }),
  };
}

const next = () => Promise.resolve(new Response("ok"));

// `onRequest` is typed against Astro's real middleware context; the hand-built
// one above carries only the fields the middleware reads.
type Invoke = (context: unknown, next: () => Promise<Response>) => Promise<Response>;
const invoke = onRequest as unknown as Invoke;

beforeEach(() => {
  createClient.mockReset();
  getUser.mockReset();
  getSession.mockReset();
  createClient.mockReturnValue(makeSupabaseFake());
});

describe("the session is verified, not merely decoded", () => {
  it("resolves locals.user through getUser() and never through getSession()", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "aaaaaaaa-0000-0000-0000-000000000001" } } });

    const context = makeContext("/");
    await invoke(context, next);

    expect(getUser).toHaveBeenCalled();
    expect(getSession).not.toHaveBeenCalled();
    expect(context.locals.user).toEqual({ id: "aaaaaaaa-0000-0000-0000-000000000001" });
  });

  it("leaves locals.user null when the auth server recognises nobody", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const context = makeContext("/");
    await invoke(context, next);

    // Null rather than undefined: every route guard is `if (!context.locals.user)`,
    // and an unset property would satisfy it by accident rather than by decision.
    expect(context.locals.user).toBeNull();
  });

  it("leaves locals.user null when Supabase is not configured", async () => {
    createClient.mockReturnValue(null);

    const context = makeContext("/");
    await invoke(context, next);

    expect(context.locals.user).toBeNull();
    expect(getUser).not.toHaveBeenCalled();
  });
});

describe("PROTECTED_ROUTES covers pages only", () => {
  it("redirects an unauthenticated caller away from /dashboard", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await invoke(makeContext("/dashboard"), next);

    expect(response.status).toBe(302);
  });

  it("does NOT redirect an unauthenticated /api/* request", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await invoke(makeContext("/api/opportunities"), next);

    // This is the load-bearing negative result behind `routes.test.ts`: the
    // middleware lets a sessionless API request through, so each handler's own
    // 401 is the only thing standing between a stranger and the data. If this
    // assertion ever flips, the route guards have silently become belt-and-braces
    // and the exhaustiveness of that table matters less — but until then it is
    // the whole defence.
    expect(response.status).toBe(200);
  });
});
