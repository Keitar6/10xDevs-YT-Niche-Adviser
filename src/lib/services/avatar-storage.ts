/**
 * The avatar write path: store bytes, repoint the profile, drop what was there.
 *
 * Unlike `avatar.ts` this module does I/O, so it follows the `youtube.ts` /
 * `justify.ts` shape instead of the pure-module one: the Supabase client is
 * passed in as a parameter, never constructed here, so nothing in `src/lib`
 * reaches for `astro:env/server`.
 *
 * Both `/api/avatar` and `/api/avatar/generate` go through `replaceAvatar` —
 * an uploaded image and a generated one differ only in where the bytes came
 * from, and duplicating the ordering below in two routes is exactly how one of
 * them would eventually get it wrong.
 *
 * Every write runs on the caller's own cookie-scoped client, so the four
 * `storage.objects` policies are what actually enforce ownership. This module
 * never needs — and must never acquire — a service-role client.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { avatarObjectPath } from "@/lib/services/avatar";

export const AVATAR_BUCKET = "avatars";

/**
 * Signed URLs are minted per SSR render, so this window is spent on how long a
 * tab stays open, not on how long the image is on screen. An hour outlasts any
 * realistic session without leaving a long-lived readable link lying around.
 */
export const AVATAR_URL_TTL_SECONDS = 3600;

type Supabase = SupabaseClient<Database>;

export interface StoredAvatar {
  avatar_path: string | null;
  avatar_url: string | null;
}

export type AvatarWriteResult = { ok: true; avatar: StoredAvatar } | { ok: false; status: number; message: string };

/**
 * Mint a readable URL for a stored object.
 *
 * Returns `null` rather than throwing, because the caller has to be able to
 * tell "this user has no avatar" apart from "the avatar exists but could not be
 * read" — conflating them is what impl-review F4 caught on the profile read, and
 * here it matters more: the write path replaces objects, so a misread must never
 * present as an empty slot inviting a destructive overwrite.
 */
export async function signAvatarUrl(supabase: Supabase, path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(AVATAR_BUCKET).createSignedUrl(path, AVATAR_URL_TTL_SECONDS);

  if (error) return null;
  return data.signedUrl;
}

/** Read the caller's profile row, which is where `avatar_path` lives. */
async function readProfileAvatar(
  supabase: Supabase,
  userId: string,
): Promise<{ ok: true; avatarPath: string | null } | { ok: false; status: number; message: string }> {
  const { data, error } = await supabase
    .from("channel_profiles")
    .select("avatar_path")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return { ok: false, status: 500, message: "Could not read your channel profile" };
  }
  if (!data) {
    // The avatar is a column on the profile, so there is nowhere to record it
    // yet. 409 rather than 404: the request is well-formed, the account just
    // isn't in a state that can accept it.
    return { ok: false, status: 409, message: "Save your channel profile before adding an avatar" };
  }

  return { ok: true, avatarPath: data.avatar_path };
}

/**
 * Store new avatar bytes and point the profile at them.
 *
 * The ordering is the whole point of this function:
 *
 *   1. upload the new object under a fresh path
 *   2. update `avatar_path` to name it
 *   3. only then delete the object it superseded
 *
 * Reversed, a failed upload after a successful delete would leave the user with
 * no avatar at all. A failure at step 3 leaves an orphaned object, which costs a
 * few KB and can be swept later; a failure that loses the pointer cannot be
 * undone. Orphan over amnesia, deliberately.
 *
 * Step 2 failing is the one case worth compensating: the pointer still names the
 * *old* object, so the just-uploaded one is unreachable garbage and is removed.
 */
export async function replaceAvatar(
  supabase: Supabase,
  userId: string,
  bytes: ArrayBuffer,
  contentType: string,
  extension: string,
): Promise<AvatarWriteResult> {
  const profile = await readProfileAvatar(supabase, userId);
  if (!profile.ok) return profile;

  const previousPath = profile.avatarPath;
  const path = avatarObjectPath(userId, extension);

  const { error: uploadError } = await supabase.storage.from(AVATAR_BUCKET).upload(path, bytes, { contentType });
  if (uploadError) {
    // Storage enforces the bucket's size and MIME limits independently of the
    // route, so this is where a caller bypassing the client lands.
    return { ok: false, status: 400, message: uploadError.message };
  }

  const { error: updateError } = await supabase
    .from("channel_profiles")
    .update({ avatar_path: path })
    .eq("user_id", userId);

  if (updateError) {
    await supabase.storage.from(AVATAR_BUCKET).remove([path]);
    return { ok: false, status: 500, message: "The image was stored but your profile could not be updated" };
  }

  if (previousPath && previousPath !== path) {
    // Best effort by design: a failure here must not roll back the successful
    // pointer update above.
    await supabase.storage.from(AVATAR_BUCKET).remove([previousPath]);
  }

  return { ok: true, avatar: { avatar_path: path, avatar_url: await signAvatarUrl(supabase, path) } };
}

/**
 * Clear the avatar and delete the object behind it.
 *
 * Mirror image of `replaceAvatar`'s ordering: the pointer is cleared *first*, so
 * a failed object delete leaves an orphan rather than a row naming an object
 * that no longer exists (which would render as a permanently broken image).
 */
export async function clearAvatar(supabase: Supabase, userId: string): Promise<AvatarWriteResult> {
  const profile = await readProfileAvatar(supabase, userId);
  if (!profile.ok) return profile;

  const previousPath = profile.avatarPath;
  if (!previousPath) {
    // Already clear. Idempotent rather than a 404 — the caller wanted no avatar
    // and there is no avatar.
    return { ok: true, avatar: { avatar_path: null, avatar_url: null } };
  }

  const { error: updateError } = await supabase
    .from("channel_profiles")
    .update({ avatar_path: null })
    .eq("user_id", userId);

  if (updateError) {
    return { ok: false, status: 500, message: "Could not clear your avatar" };
  }

  await supabase.storage.from(AVATAR_BUCKET).remove([previousPath]);

  return { ok: true, avatar: { avatar_path: null, avatar_url: null } };
}
