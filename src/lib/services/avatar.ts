/**
 * The avatar rules, as pure functions.
 *
 * No `fetch`, no `astro:env/server`, no framework coupling — same contract as
 * `scoring.ts`. What makes this module load-bearing is not complexity but
 * *shared ownership*: the bounds below are imported by both `/api/avatar` and
 * `AvatarField.tsx`, so the client and server validation cannot drift apart.
 * S-01's impl-review (F1) found them hand-mirrored and out of step; here the
 * mirror is a single import instead of a convention.
 *
 * The same numbers are also declared in the `avatars` bucket
 * (`20260913134159_add_channel_profile_avatar.sql`), which is the real
 * enforcement point — a caller who bypasses the route still hits a 413/415 from
 * storage. These constants exist to fail earlier and with a better message, not
 * to be the only gate.
 */

/** 2 MiB. Mirrors `file_size_limit` on the `avatars` bucket. */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

/** Mirrors `allowed_mime_types` on the `avatars` bucket. */
export const ALLOWED_AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export type AllowedAvatarType = (typeof ALLOWED_AVATAR_TYPES)[number];

/**
 * Avatars are normalized to a 512×512 square before upload, and generation asks
 * for the same edge. 512 rather than 1024 because nothing renders the avatar
 * larger than ~40px, and because it halves the generation cost (43.2 vs 57.6
 * neurons). There is no server-side resize available to fix a wrong choice
 * later — Supabase transforms are Pro-only and the Worker has a 10ms CPU cap —
 * so the size is decided at the point the bytes are produced.
 */
export const AVATAR_EDGE_PX = 512;

/** File extension to store each accepted MIME type under. */
const EXTENSION_BY_TYPE: Record<AllowedAvatarType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export type AvatarValidation =
  { ok: true; type: AllowedAvatarType; extension: string } | { ok: false; message: string };

function isAllowedType(value: string): value is AllowedAvatarType {
  return (ALLOWED_AVATAR_TYPES as readonly string[]).includes(value);
}

/**
 * Validate what the caller claims to be sending.
 *
 * `contentType` comes off the request header and is therefore untrusted — a
 * caller can label a PDF `image/png`. That is deliberate and safe: the bucket's
 * own `allowed_mime_types` check is the backstop, and the bytes are never
 * executed, only stored and rendered in an `<img>`. What this function buys is a
 * clear, early rejection with a message worth showing a user.
 *
 * A `Content-Type` header may carry parameters (`image/png; charset=binary`), so
 * the media type is taken as the part before the first `;`.
 */
export function validateAvatarUpload({
  contentType,
  byteLength,
}: {
  contentType: string | null;
  byteLength: number;
}): AvatarValidation {
  const mediaType = (contentType ?? "").split(";")[0].trim().toLowerCase();

  if (!mediaType) {
    return { ok: false, message: "Missing Content-Type — send the image's MIME type with the request" };
  }

  if (!isAllowedType(mediaType)) {
    return { ok: false, message: `Unsupported image type ${mediaType}. Use PNG, JPEG or WebP.` };
  }

  if (byteLength === 0) {
    return { ok: false, message: "The uploaded file is empty" };
  }

  if (byteLength > MAX_AVATAR_BYTES) {
    const limitMb = Math.round(MAX_AVATAR_BYTES / (1024 * 1024));
    return { ok: false, message: `Image is too large. The limit is ${limitMb} MB.` };
  }

  return { ok: true, type: mediaType, extension: EXTENSION_BY_TYPE[mediaType] };
}

/**
 * How much user text is allowed into the prompt. Short enough that a niche
 * cannot become the prompt, long enough for any genuine niche ("competitive
 * sim racing setups") to survive intact.
 */
export const MAX_PROMPT_TERM_CHARS = 60;

/**
 * Strip everything that lets free text act like prompt syntax rather than a
 * subject: newlines (which would start a new instruction line), quotes and
 * braces (which close or open the slots around it), and runs of whitespace.
 */
function sanitizeTerm(value: string): string {
  const cleaned = value
    .replace(/[\r\n]+/g, " ")
    .replace(/["'`{}[\]<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length <= MAX_PROMPT_TERM_CHARS) return cleaned;

  // Cut on a word boundary when there is one, so an over-long niche reads as a
  // shorter phrase rather than a word sliced in half ("…in eastern e").
  const cut = cleaned.slice(0, MAX_PROMPT_TERM_CHARS);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim();
}

/**
 * Build the image prompt from a profile's niche and sub-niche.
 *
 * The user's text is *slotted into* a fixed template, never concatenated with
 * it: the niche names the subject and nothing else, while style, composition and
 * the no-text rule are fixed by this module. There is no moderation model in
 * front of `flux-1-schnell`, so containment here is the only guard — which is
 * why the terms are sanitized and truncated rather than trusted.
 *
 * Returns a prompt even when the niche is empty, so the caller never has to
 * handle a null; an empty profile simply yields the generic template. Whether
 * generation should run at all with no profile is the route's decision.
 */
export function buildAvatarPrompt(niche: string | null, subNiche: string | null): string {
  const terms = [niche, subNiche].map((t) => sanitizeTerm(t ?? "")).filter((t) => t.length > 0);

  const subject = terms.length > 0 ? terms.join(", ") : "a generic content creator channel";

  return [
    "A flat vector channel avatar icon.",
    `Subject: ${subject}.`,
    "Style: bold minimal geometric shapes, thick clean outlines, a limited palette of purple, blue and white, centered composition on a plain background.",
    "No text, no letters, no numbers, no watermarks, no human faces.",
  ].join(" ");
}

/**
 * Where a user's avatar object lives.
 *
 * The leading segment must be the user's id: the four `storage.objects` policies
 * compare `(storage.foldername(name))[1]` against `auth.uid()`, so ownership is
 * a property of this path. Get it wrong and RLS rejects the write — which is the
 * intended failure mode.
 *
 * Each call returns a *fresh* uuid rather than a stable `avatar.png`. A stable
 * name would be overwritten in place, and the old image would keep being served
 * from browser and CDN caches under the unchanged URL. A new path per write
 * makes a replaced avatar visible immediately, and is why the route deletes the
 * superseded object explicitly instead of relying on upsert.
 */
export function avatarObjectPath(userId: string, extension: string): string {
  return `${userId}/${crypto.randomUUID()}.${extension}`;
}
