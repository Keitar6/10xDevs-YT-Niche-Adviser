// Shared entity and DTO types go here.
//
// Convention: zod schemas are the source of truth in their owning service
// module; this file re-exports the inferred types so consumers import one path.

import type { ScoredOpportunity, SkipReason } from "@/lib/services/scoring";

export type { ChannelProfile, Competitor } from "@/lib/services/channel-profile";
export type { ScoredOpportunity, SkipReason } from "@/lib/services/scoring";
export type { Justification } from "@/lib/services/justify";

/* -------------------------------------------------------------------------- *
 * `/api/analyze` response
 *
 * The first DTOs in this project that are not derived from a database row. They
 * are plain interfaces rather than zod schemas because the server *constructs*
 * this payload — it never parses one. S-03 persists a subset of it as
 * `content_opportunities` rows.
 *
 * These types are imported by the dashboard island, so everything referenced
 * here has to come from a client-safe module.
 * -------------------------------------------------------------------------- */

/** A ranked opportunity as the wire carries it. */
export interface AnalyzeOpportunity extends ScoredOpportunity {
  /** `null` whenever justifications were unavailable for this run. */
  justification: string | null;
}

/** A competitor that resolved but produced no usable baseline. */
export interface SkippedChannel {
  channel_id: string;
  channel_title: string | null;
  /** Long-form videos found — the number worth reporting back. */
  sample_size: number;
  reason: SkipReason;
  message: string;
}

/**
 * What the run could and could not use. FR-009 and the PRD guardrail against
 * unexplained emptiness are both served from here: every competitor the user
 * saved is accounted for as resolved, unresolved, or skipped-with-a-reason.
 */
export interface AnalyzeSummary {
  /** Competitors read off the profile. */
  requested: number;
  /** Of those, the ones `channels.list` returned a usable channel for. */
  resolved: number;
  /** Raw `UC…` ids that matched no live channel — unresolved channels have no title. */
  unresolved: string[];
  /** Resolved competitors that cleared the sample floor and the zero-median guard. */
  scored: number;
  skipped: SkippedChannel[];
  justifications_available: boolean;
  /** Why justifications are missing, when they are. `null` otherwise. */
  justifications_error: string | null;
  /** Why the ranking is empty, when it is. `null` otherwise. */
  empty_reason: string | null;
}

export interface AnalyzeResponse {
  opportunities: AnalyzeOpportunity[];
  summary: AnalyzeSummary;
}
