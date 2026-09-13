/**
 * Turns an untrusted `next` query value into a safe same-origin relative path.
 *
 * `next` arrives from the query string, is threaded through Supabase's OAuth
 * `redirectTo`, and comes back on the callback — so it is read in several
 * places and must be guarded at every one of them. This is the single guard.
 *
 * Reject, do not sanitize: a value that fails is replaced wholesale by the
 * fallback. `//host` and `/\host` both navigate off-origin in browsers, so a
 * leading `/` alone is not enough.
 */
export function safeNextPath(value: unknown, fallback = "/"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}

/**
 * Builds the URL an OAuth failure redirects to: the return path with
 * `?auth_error=` appended, which is the read point that reopens the auth
 * dialog with the message. `next` may already carry a query string.
 *
 * Re-validates `next` itself rather than trusting the caller already did —
 * defense-in-depth so a future call site can't silently reopen the
 * open-redirect this module exists to close.
 */
export function authErrorUrl(next: string, message: string): string {
  const safeNext = safeNextPath(next);
  return `${safeNext}${safeNext.includes("?") ? "&" : "?"}auth_error=${encodeURIComponent(message)}`;
}
