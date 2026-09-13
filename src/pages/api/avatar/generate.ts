/**
 * Generate an avatar from the caller's saved niche and sub-niche.
 *
 * No request body is read: the prompt is built server-side from the profile, so
 * the client cannot choose what gets generated. That is the whole containment
 * story — there is no moderation model in front of `flux-1-schnell`, so the only
 * text that reaches it is the user's own niche, sanitized and slotted into a
 * fixed template by `buildAvatarPrompt`.
 */
import type { APIRoute } from "astro";
// `Astro.locals.runtime` was removed in @astrojs/cloudflare v13 / Astro 6, so
// bindings come off the module-level `env` (see src/pages/api/analyze.ts:15).
import { env } from "cloudflare:workers";
import { createClient } from "@/lib/supabase";
import { jsonError } from "@/lib/http";
import { buildAvatarPrompt } from "@/lib/services/avatar";
import { generateAvatar } from "@/lib/services/avatar-generate";
import { replaceAvatar } from "@/lib/services/avatar-storage";

/** Mirrors the `AVATAR_LIMITER` block in wrangler.jsonc. */
const RATE_LIMIT = 5;
const RATE_LIMIT_PERIOD_SECONDS = 60;

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return jsonError("You must be signed in", 401);
  }

  // After the auth check, because the budget being guarded is the Workers AI
  // neuron allocation and it is spent per user. Its own namespace, so an
  // Analyze burst cannot lock out generation (and vice versa).
  const { success } = await env.AVATAR_LIMITER.limit({ key: context.locals.user.id });
  if (!success) {
    return jsonError(
      `You can generate at most ${RATE_LIMIT} avatars per ${RATE_LIMIT_PERIOD_SECONDS} seconds. Wait ${RATE_LIMIT_PERIOD_SECONDS} seconds and try again.`,
      429,
    );
  }

  // Binding presence is a per-request fact, not a module-scope secret, which is
  // why this is not in src/lib/config-status.ts. The UI already hides the button
  // when the binding is absent; this is the backstop for a direct call.
  //
  // `wrangler types` generates `AI: Ai` as non-optional because the binding is
  // in wrangler.jsonc today, so the compiler believes it can never be missing.
  // At runtime it certainly can — dropping the `ai` block is exactly how FR-015's
  // degraded, upload-only mode is reached — hence the widened read.
  const ai = (env as { AI?: Ai }).AI;
  if (!ai) {
    return jsonError("Image generation is not configured on this deployment. You can still upload an image.", 503);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonError("Supabase is not configured", 500);
  }

  const { data: profile, error: profileError } = await supabase
    .from("channel_profiles")
    .select("niche, sub_niche")
    .eq("user_id", context.locals.user.id)
    .maybeSingle();

  if (profileError) {
    return jsonError("Could not read your channel profile", 500);
  }
  if (!profile) {
    // Generation is derived from the profile, so there is nothing to derive it
    // from. Same 409 the upload route returns for the same reason.
    return jsonError("Save your channel profile before generating an avatar", 409);
  }

  const generated = await generateAvatar(ai, buildAvatarPrompt(profile.niche, profile.sub_niche));
  if (!generated.ok) {
    // The existing avatar is untouched — nothing has been written yet.
    return jsonError(generated.message, 502);
  }

  // Same write path as an upload, so the replace ordering and the cleanup of the
  // superseded object live in exactly one place.
  const result = await replaceAvatar(
    supabase,
    context.locals.user.id,
    generated.bytes,
    generated.contentType,
    generated.extension,
  );

  if (!result.ok) {
    return jsonError(result.message, result.status);
  }

  return new Response(JSON.stringify(result.avatar), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
