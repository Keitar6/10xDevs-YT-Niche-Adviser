import type { APIRoute } from "astro";
import { z } from "zod";
import { YOUTUBE_API_KEY } from "astro:env/server";
import { createClient } from "@/lib/supabase";
import { jsonError } from "@/lib/http";
import { COMPETITOR_INPUT_MESSAGE, isChannelId, parseChannelRef } from "@/lib/services/youtube-ids";
import { resolveChannelRefs, YouTubeError } from "@/lib/services/youtube";
import { parseChannelProfile, type Competitor } from "@/lib/services/channel-profile";

const profileSchema = z.object({
  niche: z.string().trim().min(1, "Niche is required"),
  sub_niche: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  competitors: z
    .array(
      z
        .string()
        .trim()
        .min(1, "Competitor channel ID cannot be empty")
        .refine((v) => parseChannelRef(v) !== null, COMPETITOR_INPUT_MESSAGE),
    )
    .min(3, "At least 3 competitor channel IDs are required")
    .max(5, "At most 5 competitor channel IDs are allowed")
    .refine((ids) => new Set(ids).size === ids.length, "Competitor channel IDs must be unique"),
});

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return jsonError("You must be signed in", 401);
  }

  let body: { niche?: unknown; subNiche?: unknown; competitors?: unknown };
  try {
    body = await context.request.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }
  const parsed = profileSchema.safeParse({
    niche: body.niche,
    sub_niche: body.subNiche,
    competitors: body.competitors,
  });

  if (!parsed.success) {
    return jsonError(parsed.error.issues[0].message, 400);
  }

  // Competitors are stored as canonical channel IDs, never as the handle or URL
  // the user happened to type: handles can be renamed by their owner, and only
  // IDs can be batched into the single `channels.list` call /api/analyze relies
  // on. Resolving here also turns "no such channel" into a save-time error
  // instead of a quietly smaller ranking later.
  let competitors: Competitor[];
  if (YOUTUBE_API_KEY) {
    try {
      const { resolved, unresolved, invalid } = await resolveChannelRefs(parsed.data.competitors, YOUTUBE_API_KEY);
      const unknown = [...invalid, ...unresolved];
      if (unknown.length > 0) {
        return jsonError(`No YouTube channel found for: ${unknown.join(", ")}`, 400);
      }
      competitors = resolved.map((r) => ({ id: r.channelId, handle: r.handle, title: r.title }));
      // Two different inputs can name the same channel (a handle and its ID).
      // Uniqueness has to hold on the canonical ID, not on the typed text.
      if (new Set(competitors.map((c) => c.id)).size !== competitors.length) {
        return jsonError("Two of the competitors are the same channel", 400);
      }
    } catch (error) {
      if (error instanceof YouTubeError) {
        return jsonError(error.message, error.failure.kind === "quota" ? 429 : 502);
      }
      throw error;
    }
  } else {
    // Without a key we cannot resolve handles, so fall back to accepting only
    // well-formed IDs — and they stay label-less until the next save with a key.
    // Profile editing keeps working; the config banner already says why.
    const notIds = parsed.data.competitors.filter((v) => !isChannelId(v));
    if (notIds.length > 0) {
      return jsonError(
        `YouTube is not configured, so handles cannot be looked up. Enter full channel IDs (UC…) instead of: ${notIds.join(", ")}`,
        400,
      );
    }
    competitors = parsed.data.competitors.map((id) => ({ id, handle: null, title: null }));
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonError("Supabase is not configured", 500);
  }

  const { data, error } = await supabase
    .from("channel_profiles")
    .upsert(
      {
        user_id: context.locals.user.id,
        niche: parsed.data.niche,
        sub_niche: parsed.data.sub_niche,
        competitors,
      },
      { onConflict: "user_id" },
    )
    .select()
    .single();

  if (error) {
    // Same reasoning as `/api/analyze`: the raw PostgREST message names schema
    // internals, so it is logged rather than returned.
    // eslint-disable-next-line no-console -- deliberate: no logger exists yet
    console.error("channel_profiles upsert failed", error.message);
    return jsonError("Could not save your channel profile. Try again.", 400);
  }

  const profile = parseChannelProfile(data);
  if (!profile) {
    return jsonError("The saved profile could not be read back", 500);
  }

  return new Response(JSON.stringify({ profile }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
