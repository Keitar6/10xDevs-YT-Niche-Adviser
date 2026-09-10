import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

const ALLOWED_ORIGINS = new Set(["signin", "signup"]);

export const GET: APIRoute = async (context) => {
  const requestedOrigin = context.url.searchParams.get("origin");
  const origin = requestedOrigin && ALLOWED_ORIGINS.has(requestedOrigin) ? requestedOrigin : "signin";

  const code = context.url.searchParams.get("code");
  if (!code) {
    return context.redirect(`/auth/${origin}?error=${encodeURIComponent("Missing OAuth code")}`);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/${origin}?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return context.redirect(`/auth/${origin}?error=${encodeURIComponent(error.message)}`);
  }

  return context.redirect("/");
};
