import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

const ALLOWED_ORIGINS = new Set(["signin", "signup"]);

export const POST: APIRoute = async (context) => {
  const formData = await context.request.formData();
  const requestedOrigin = formData.get("origin");
  const origin =
    typeof requestedOrigin === "string" && ALLOWED_ORIGINS.has(requestedOrigin) ? requestedOrigin : "signin";

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/${origin}?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${context.url.origin}/api/auth/callback?origin=${origin}`,
      queryParams: {
        prompt: "select_account",
      },
    },
  });

  if (error || !data.url) {
    return context.redirect(
      `/auth/${origin}?error=${encodeURIComponent(error?.message ?? "Google sign-in failed to start")}`,
    );
  }

  return context.redirect(data.url);
};
