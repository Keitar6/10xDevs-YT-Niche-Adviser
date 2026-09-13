import type { AstroCookies } from "astro";
import { createClient } from "@/lib/supabase";
import { parseChannelProfile, type ChannelProfile } from "@/lib/services/channel-profile";

/**
 * Server-only companion to `channel-profile.ts`.
 *
 * The query lives here rather than next to `parseChannelProfile` because that
 * module is imported by React components too — pulling `astro:env/server` into
 * it breaks the client build.
 */

/**
 * Read the signed-in user's channel profile.
 *
 * Both the top bar and the landing hero need to know whether a profile exists,
 * so the query is written once.
 *
 * `loadFailed` means the query itself errored — callers show "unavailable"
 * rather than pretending the user simply has no profile yet. A row whose
 * competitors fail to parse comes back as `profile: null` (see
 * `parseChannelProfile`), the same "nothing usable" signal.
 */
export async function loadChannelProfile(
  headers: Headers,
  cookies: AstroCookies,
  userId: string,
): Promise<{ profile: ChannelProfile | null; loadFailed: boolean }> {
  const supabase = createClient(headers, cookies);
  if (!supabase) return { profile: null, loadFailed: false };

  const { data, error } = await supabase.from("channel_profiles").select("*").eq("user_id", userId).maybeSingle();
  if (error) return { profile: null, loadFailed: true };

  return { profile: parseChannelProfile(data), loadFailed: false };
}
