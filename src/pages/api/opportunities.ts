import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { jsonError } from "@/lib/http";
import { saveOpportunitySchema } from "@/lib/services/content-opportunity";

function json(row: unknown) {
  return new Response(JSON.stringify(row), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const idSchema = z.uuid();

export const POST: APIRoute = async (context) => {
  // `PROTECTED_ROUTES` in src/middleware.ts covers pages only, never `/api/*`,
  // so every route repeats this check for itself.
  if (!context.locals.user) {
    return jsonError("You must be signed in", 401);
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const parsed = saveOpportunitySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0].message, 400);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonError("Supabase is not configured", 500);
  }

  // user_id comes from the session, never from the body.
  const { data, error } = await supabase
    .from("content_opportunities")
    .insert({ ...parsed.data, user_id: context.locals.user.id })
    .select()
    .single();

  if (error) {
    // Idempotent on (user_id, video_id): a repeat save is a no-op that hands
    // back the row already stored, so the first-saved score wins.
    if (error.code === "23505") {
      const { data: existing } = await supabase
        .from("content_opportunities")
        .select()
        .eq("user_id", context.locals.user.id)
        .eq("video_id", parsed.data.video_id)
        .maybeSingle();
      if (!existing) {
        return jsonError("Could not read back the saved opportunity", 400);
      }
      return json(existing);
    }
    return jsonError(error.message, 400);
  }

  return json(data);
};

export const DELETE: APIRoute = async (context) => {
  if (!context.locals.user) {
    return jsonError("You must be signed in", 401);
  }

  const rawId = context.url.searchParams.get("id");
  const parsedId = idSchema.safeParse(rawId);
  if (!parsedId.success) {
    return jsonError("A valid opportunity id is required", 400);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonError("Supabase is not configured", 500);
  }

  // RLS already refuses another user's row; the explicit user_id filter is
  // the house rule from src/pages/api/analyze.ts:73-76.
  const { data, error } = await supabase
    .from("content_opportunities")
    .delete()
    .eq("id", parsedId.data)
    .eq("user_id", context.locals.user.id)
    .select();

  if (error) {
    return jsonError(error.message, 400);
  }

  if (data.length === 0) {
    // Same response for an already-deleted row and for another user's row —
    // a 404 rather than a 403 so the route never confirms someone else's id exists.
    return jsonError("That saved opportunity no longer exists", 404);
  }

  return json({ id: parsedId.data });
};
