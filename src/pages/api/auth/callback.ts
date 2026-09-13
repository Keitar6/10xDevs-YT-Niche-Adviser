import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { authErrorUrl, safeNextPath } from "@/lib/services/safe-next";

export const GET: APIRoute = async (context) => {
  const next = safeNextPath(context.url.searchParams.get("next"));

  // Google reports a declined consent as `?error=access_denied` with no `code`,
  // so this has to be read BEFORE the missing-code check — otherwise a user
  // simply saying no is reported to them as "Missing OAuth code".
  const providerError = context.url.searchParams.get("error");
  if (providerError) {
    const message =
      providerError === "access_denied"
        ? "Sign-in was cancelled"
        : (context.url.searchParams.get("error_description") ?? providerError);
    return context.redirect(authErrorUrl(next, message));
  }

  const code = context.url.searchParams.get("code");
  if (!code) {
    return context.redirect(authErrorUrl(next, "Missing OAuth code"));
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(authErrorUrl(next, "Supabase is not configured"));
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return context.redirect(authErrorUrl(next, error.message));
  }

  return context.redirect(next);
};
