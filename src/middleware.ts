import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";

const PROTECTED_ROUTES = ["/dashboard"];

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
  } else {
    context.locals.user = null;
  }

  if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (!context.locals.user) {
      // Remember where they were headed so signing in lands them there rather
      // than dropping them on the landing page.
      const next = `${context.url.pathname}${context.url.search}`;
      return context.redirect(`/?auth=signin&next=${encodeURIComponent(next)}`);
    }
  }

  return next();
});
