import { z } from "zod";
import type { Database } from "@/lib/database.types";

/**
 * One curated competitor.
 *
 * `id` is the source of truth — it is what `channels.list` batches and what
 * survives a channel renaming its handle. `handle` and `title` exist only so
 * the UI can show something a human recognises; both are nullable because not
 * every channel has claimed a handle, and rows written before this shape
 * existed have neither.
 */
export const competitorSchema = z.object({
  id: z.string(),
  handle: z.string().nullable(),
  title: z.string().nullable(),
});

export const competitorsSchema = z.array(competitorSchema).min(3).max(5);

export type Competitor = z.infer<typeof competitorSchema>;

type ChannelProfileRow = Database["public"]["Tables"]["channel_profiles"]["Row"];

/** The row as the app uses it: `competitors` narrowed from `Json`. */
export type ChannelProfile = Omit<ChannelProfileRow, "competitors"> & {
  competitors: Competitor[];
};

/**
 * Narrow a raw row from Supabase. `competitors` is generated as `Json`, so it
 * is untrusted input as far as the type system is concerned and gets validated
 * like any other. Returns `null` for a row whose competitors do not parse,
 * which callers surface as a load failure rather than rendering garbage.
 */
export function parseChannelProfile(row: ChannelProfileRow | null): ChannelProfile | null {
  if (!row) return null;
  const parsed = competitorsSchema.safeParse(row.competitors);
  if (!parsed.success) return null;
  return { ...row, competitors: parsed.data };
}

/** What to show for a competitor, best label first. */
export function competitorLabel(competitor: Competitor): string {
  return competitor.handle ?? competitor.title ?? competitor.id;
}
