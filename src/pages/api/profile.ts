import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";

const profileSchema = z.object({
  niche: z.string().trim().min(1, "Niche is required"),
  sub_niche: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  competitor_channel_ids: z
    .array(z.string().trim().min(1, "Competitor channel ID cannot be empty"))
    .min(3, "At least 3 competitor channel IDs are required")
    .refine((ids) => new Set(ids).size === ids.length, "Competitor channel IDs must be unique"),
});

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return jsonError("You must be signed in", 401);
  }

  const body = (await context.request.json()) as {
    niche?: unknown;
    subNiche?: unknown;
    competitorChannelIds?: unknown;
  };
  const parsed = profileSchema.safeParse({
    niche: body.niche,
    sub_niche: body.subNiche,
    competitor_channel_ids: body.competitorChannelIds,
  });

  if (!parsed.success) {
    return jsonError(parsed.error.issues[0].message, 400);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonError("Supabase is not configured", 500);
  }

  const { data, error } = await supabase
    .from("channel_profiles")
    .upsert({ user_id: context.locals.user.id, ...parsed.data }, { onConflict: "user_id" })
    .select()
    .single();

  if (error) {
    return jsonError(error.message, 400);
  }

  return new Response(JSON.stringify({ profile: data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
