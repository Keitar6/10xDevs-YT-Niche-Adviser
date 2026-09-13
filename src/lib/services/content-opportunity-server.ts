import type { AstroCookies } from "astro";
import { createClient } from "@/lib/supabase";
import { SAVED_LIST_LIMIT, type SavedOpportunity } from "@/lib/services/content-opportunity";

/**
 * Server-only companion to `content-opportunity.ts`.
 *
 * The query lives here rather than next to the schema because that module is
 * imported by React components too — pulling `astro:env/server` into it
 * breaks the client build (see `channel-profile-server.ts`).
 */

/**
 * Read the signed-in user's saved opportunities, newest-saved-first.
 *
 * `loadFailed` means the query itself errored — callers show "unavailable"
 * rather than pretending the user simply has nothing saved, mirroring
 * `loadChannelProfile`'s return shape.
 */
export async function loadSavedOpportunities(
  headers: Headers,
  cookies: AstroCookies,
  userId: string,
): Promise<{ opportunities: SavedOpportunity[]; loadFailed: boolean }> {
  const supabase = createClient(headers, cookies);
  if (!supabase) return { opportunities: [], loadFailed: false };

  // Filtered by user_id explicitly even though RLS already scopes the query,
  // per the house rule at src/pages/api/analyze.ts:73-76.
  const { data, error } = await supabase
    .from("content_opportunities")
    .select("*")
    .eq("user_id", userId)
    .order("saved_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(SAVED_LIST_LIMIT);
  if (error) return { opportunities: [], loadFailed: true };

  return { opportunities: data, loadFailed: false };
}
