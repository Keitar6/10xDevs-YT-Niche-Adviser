/**
 * Upload and removal for the channel profile avatar.
 *
 * The body is **raw image bytes**, not `multipart/form-data`. S-01 tried
 * `FormData` and abandoned it after a browser extension clobbered the global
 * constructor at runtime (`context/changes/channel-profile-crud/plan.md:32`),
 * and binary cannot ride along in the JSON the profile form fell back to. A raw
 * body sidesteps both: nothing constructs a `FormData` on either side, the MIME
 * type arrives in `Content-Type`, and the size is just the byte length.
 */
import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { jsonError } from "@/lib/http";
import { validateAvatarUpload } from "@/lib/services/avatar";
import { clearAvatar, replaceAvatar, type StoredAvatar } from "@/lib/services/avatar-storage";

function json(avatar: StoredAvatar) {
  return new Response(JSON.stringify(avatar), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export const POST: APIRoute = async (context) => {
  // `PROTECTED_ROUTES` in src/middleware.ts covers pages only, never `/api/*`,
  // so every route repeats this check for itself (CLAUDE.md; impl-review F8).
  if (!context.locals.user) {
    return jsonError("You must be signed in", 401);
  }

  // Guarded like every other body read in this codebase (impl-review F3): a
  // truncated or aborted upload must come back as the JSON error envelope the
  // client knows how to render, not as an unhandled throw.
  let bytes: ArrayBuffer;
  try {
    bytes = await context.request.arrayBuffer();
  } catch {
    return jsonError("Could not read the uploaded image. Try again.", 400);
  }

  // Same function the client calls before sending, imported rather than
  // re-stated, so the two cannot drift (impl-review F1). The header is the
  // caller's claim and is therefore re-checked here even though the browser
  // already checked it — and the bucket's own limits re-check it again after.
  const validation = validateAvatarUpload({
    contentType: context.request.headers.get("Content-Type"),
    byteLength: bytes.byteLength,
  });
  if (!validation.ok) {
    return jsonError(validation.message, 400);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonError("Supabase is not configured", 500);
  }

  const result = await replaceAvatar(supabase, context.locals.user.id, bytes, validation.type, validation.extension);

  if (!result.ok) {
    return jsonError(result.message, result.status);
  }

  return json(result.avatar);
};

export const DELETE: APIRoute = async (context) => {
  if (!context.locals.user) {
    return jsonError("You must be signed in", 401);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonError("Supabase is not configured", 500);
  }

  const result = await clearAvatar(supabase, context.locals.user.id);

  if (!result.ok) {
    return jsonError(result.message, result.status);
  }

  return json(result.avatar);
};
