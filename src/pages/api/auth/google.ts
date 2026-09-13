import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { authErrorUrl, safeNextPath } from "@/lib/services/safe-next";

export const POST: APIRoute = async (context) => {
  const formData = await context.request.formData();
  const next = safeNextPath(formData.get("next"));

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(authErrorUrl(next, "Supabase is not configured"));
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${context.url.origin}/api/auth/callback?next=${encodeURIComponent(next)}`,
      queryParams: {
        // Load-bearing: without it Google's SSO cookie silently re-authenticates
        // the same account right after our sign-out.
        prompt: "select_account",
      },
    },
  });

  if (error || !data.url) {
    return context.redirect(authErrorUrl(next, error?.message ?? "Google sign-in failed to start"));
  }

  return context.redirect(data.url);
};
