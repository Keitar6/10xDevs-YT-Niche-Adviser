/**
 * Stand-in for `astro:middleware` under Vitest.
 *
 * `defineMiddleware` is an identity function at runtime — it exists to attach
 * types to the handler, not to wrap it. Reproducing that here lets
 * `src/middleware.test.ts` import `onRequest` and call it directly with a hand
 * built context.
 */
export function defineMiddleware<T>(handler: T): T {
  return handler;
}
