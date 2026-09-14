/**
 * Merging LLM output onto the ranked rows, and deciding what the run may claim
 * about it.
 *
 * Extracted from the route so the decision is testable: the route can only be
 * exercised through `astro:env/server` and `cloudflare:workers`, and this is the
 * one piece of the degradation ladder with a rule worth pinning rather than
 * wiring worth reading.
 *
 * The rule: a justification counts as present only when it carries visible
 * text. Anything else is `null`, and `null` is what the summary and the
 * interface both key on.
 */
import type { JustifyResult } from "./justify";
import type { ScoredOpportunity } from "./scoring";
import type { AnalyzeOpportunity } from "@/types";

export interface JustificationMerge {
  opportunities: AnalyzeOpportunity[];
  justifications_available: boolean;
  /** Why justifications are missing, when they are. `null` otherwise. */
  justifications_error: string | null;
}

/**
 * An empty or whitespace-only justification is *absent*, not present-but-blank.
 *
 * The model occasionally returns `""`, and three individually reasonable links
 * used to combine into a silent failure: `?? null` substitutes only on
 * null/undefined so `""` passed through, `!== null` then counted it as
 * available, and the card's truthy check rendered nothing. The run claimed full
 * success while showing the user an unexplained gap — the precise thing the PRD
 * guardrail forbids.
 *
 * Presence is decided on the trimmed value; the original is what gets stored,
 * because trimming is a judgement about whether text exists, not licence to
 * rewrite what the model said.
 */
function presentOrNull(justification: string | undefined): string | null {
  if (justification === undefined) return null;
  return justification.trim().length > 0 ? justification : null;
}

/**
 * Attach justifications to the ranking, and report honestly on what is missing.
 *
 * Matching is by `video_id` rather than position so a reordered or partial
 * answer still lands on the right row instead of being zipped onto the wrong
 * video. Every scored field is carried through untouched: the ranking is the
 * Primary success criterion and must survive a justification failure intact.
 */
export function mergeJustifications(ranked: ScoredOpportunity[], result: JustifyResult): JustificationMerge {
  if (!result.ok) {
    return {
      opportunities: ranked.map((opportunity) => ({ ...opportunity, justification: null })),
      justifications_available: false,
      justifications_error: result.message,
    };
  }

  const byVideoId = new Map(result.justifications.map((j) => [j.video_id, j.justification]));
  const opportunities = ranked.map((opportunity) => ({
    ...opportunity,
    justification: presentOrNull(byVideoId.get(opportunity.video_id)),
  }));

  // Only a claim we can back: a partial answer leaves some rows null, and the
  // interface would otherwise promise justifications it does not have.
  const available = opportunities.every((o) => o.justification !== null);

  return {
    opportunities,
    justifications_available: available,
    justifications_error: available ? null : "Justifications were only available for some of the ranked videos.",
  };
}
