import { z } from "zod";
import type { Database } from "@/lib/database.types";

/**
 * Client-safe schema and row narrowing for a saved opportunity, mirroring
 * what `channel-profile.ts` does for profiles. No `astro:env/server` import —
 * the dashboard island imports the row type.
 */

/** Cap on the saved list, applied by the server-only read. */
export const SAVED_LIST_LIMIT = 200;

/** The three states FR-012 will transition between. TypeScript side of the
 * mirror; the SQL side is the CHECK in
 * `supabase/migrations/20260913160933_create_content_opportunities.sql`.
 * Nothing enforces agreement between the two — each carries a comment naming
 * the other so a future edit finds its counterpart. */
export const OPPORTUNITY_STATUSES = ["new", "in_production", "done"] as const;

/** Bounds keep garbage out of the table and out of `Intl.NumberFormat`. */
export const saveOpportunitySchema = z.object({
  video_id: z.string().min(1).max(64),
  title: z.string().min(1).max(500),
  channel_id: z.string().min(1).max(64),
  channel_title: z.string().max(500).nullable(),
  published_at: z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "published_at must be a parseable date",
  }),
  view_count: z.number().int().nonnegative(),
  outlier_score: z.number().gt(0),
  channel_median: z.number().gt(0),
  sample_size: z.number().int().positive(),
  justification: z.string().max(2000).nullable(),
});

export type SaveOpportunityInput = z.infer<typeof saveOpportunitySchema>;

type ContentOpportunityRow = Database["public"]["Tables"]["content_opportunities"]["Row"];

/** The row as the app uses it. */
export type SavedOpportunity = ContentOpportunityRow;
