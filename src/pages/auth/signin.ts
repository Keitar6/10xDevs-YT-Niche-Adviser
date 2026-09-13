import type { APIRoute } from "astro";
import { safeNextPath } from "@/lib/services/safe-next";

// Redirect shim. Auth lives in the dialog now; this path stays resolvable so
// bookmarks and any stale link keep working.
export const GET: APIRoute = (context) => {
  const requestedNext = context.url.searchParams.get("next");
  const params = new URLSearchParams({ auth: "signin" });
  if (requestedNext !== null) {
    params.set("next", safeNextPath(requestedNext));
  }

  return context.redirect(`/?${params.toString()}`);
};
