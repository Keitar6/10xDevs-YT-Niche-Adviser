/**
 * What the run may claim about its justifications.
 *
 * Pure and synchronous, like the rest of the suite — the LLM's failure modes
 * are `justify.test.ts`'s job, and this file only cares what the route does
 * with an answer once it has one.
 *
 * The case that matters most is the empty string: it is the one input where
 * "we have a justification" and "the user can see a justification" used to
 * disagree, and the run reported success while showing a blank card.
 */
import { describe, expect, it } from "vitest";
import { mergeJustifications } from "./justification-merge";
import type { ScoredOpportunity } from "./scoring";

function opportunity(overrides: Partial<ScoredOpportunity> & Pick<ScoredOpportunity, "video_id">): ScoredOpportunity {
  return {
    title: `Video ${overrides.video_id}`,
    channel_id: "UCaaaaaaaaaaaaaaaaaaaaaa",
    channel_title: "Test Channel",
    published_at: "2026-08-13T12:00:00Z",
    view_count: 30_000,
    outlier_score: 3,
    channel_median: 10_000,
    sample_size: 12,
    ...overrides,
  };
}

const RANKED = [opportunity({ video_id: "vid1" }), opportunity({ video_id: "vid2" })];

/** A successful provider answer carrying exactly these justifications. */
function answered(justifications: { video_id: string; justification: string }[]) {
  return { ok: true as const, justifications };
}

describe("mergeJustifications", () => {
  describe("when every row was justified", () => {
    it("attaches each justification and claims availability", () => {
      const merged = mergeJustifications(
        RANKED,
        answered([
          { video_id: "vid1", justification: "First reason." },
          { video_id: "vid2", justification: "Second reason." },
        ]),
      );

      expect(merged.opportunities.map((o) => o.justification)).toEqual(["First reason.", "Second reason."]);
      expect(merged.justifications_available).toBe(true);
      expect(merged.justifications_error).toBeNull();
    });

    it("matches by video_id rather than position", () => {
      // A reordered answer must not be zipped onto the wrong video — the whole
      // reason `video_id` is round-tripped through the prompt.
      const merged = mergeJustifications(
        RANKED,
        answered([
          { video_id: "vid2", justification: "Belongs to two." },
          { video_id: "vid1", justification: "Belongs to one." },
        ]),
      );

      expect(merged.opportunities.map((o) => o.justification)).toEqual(["Belongs to one.", "Belongs to two."]);
    });
  });

  describe("the presence rule", () => {
    it("treats an empty string as absent, not as available", () => {
      // The live defect this extraction exists to close. `""` used to survive
      // `?? null`, pass the `!== null` check, and then render as nothing: a run
      // claiming full success with an unexplained blank card.
      const merged = mergeJustifications(
        RANKED,
        answered([
          { video_id: "vid1", justification: "First reason." },
          { video_id: "vid2", justification: "" },
        ]),
      );

      expect(merged.opportunities[1].justification).toBeNull();
      expect(merged.justifications_available).toBe(false);
      expect(merged.justifications_error).toBe("Justifications were only available for some of the ranked videos.");
    });

    it("treats a whitespace-only justification as absent", () => {
      const merged = mergeJustifications(
        RANKED,
        answered([
          { video_id: "vid1", justification: "First reason." },
          { video_id: "vid2", justification: "   \n\t " },
        ]),
      );

      expect(merged.opportunities[1].justification).toBeNull();
      expect(merged.justifications_available).toBe(false);
    });

    it("accepts a single character as present", () => {
      // Presence is "has visible text", not "is long enough to be good" — any
      // length floor would be a number invented here rather than derived from
      // the PRD, and judging quality is explicitly not this function's job.
      const merged = mergeJustifications(
        RANKED,
        answered([
          { video_id: "vid1", justification: "." },
          { video_id: "vid2", justification: "Second reason." },
        ]),
      );

      expect(merged.opportunities[0].justification).toBe(".");
      expect(merged.justifications_available).toBe(true);
    });

    it("stores the model's text unchanged, trimming only to decide presence", () => {
      const merged = mergeJustifications(RANKED, answered([{ video_id: "vid1", justification: "  Padded.  " }]));

      expect(merged.opportunities[0].justification).toBe("  Padded.  ");
    });
  });

  describe("when the answer was partial or failed", () => {
    it("nulls a row the model omitted and says so", () => {
      const merged = mergeJustifications(RANKED, answered([{ video_id: "vid1", justification: "Only one." }]));

      expect(merged.opportunities.map((o) => o.justification)).toEqual(["Only one.", null]);
      expect(merged.justifications_available).toBe(false);
      expect(merged.justifications_error).toBe("Justifications were only available for some of the ranked videos.");
    });

    it("carries the provider's own message through on failure", () => {
      // The user is told what actually broke, not a generic substitute.
      const merged = mergeJustifications(RANKED, { ok: false, message: "The justification service is rate limited." });

      expect(merged.opportunities.map((o) => o.justification)).toEqual([null, null]);
      expect(merged.justifications_available).toBe(false);
      expect(merged.justifications_error).toBe("The justification service is rate limited.");
    });

    it("ignores a justification for a video that is not in the ranking", () => {
      const merged = mergeJustifications(
        [opportunity({ video_id: "vid1" })],
        answered([
          { video_id: "vid1", justification: "Mine." },
          { video_id: "ghost", justification: "Not in the ranking." },
        ]),
      );

      expect(merged.opportunities).toHaveLength(1);
      expect(merged.opportunities[0].justification).toBe("Mine.");
      expect(merged.justifications_available).toBe(true);
    });
  });

  describe("the ranking itself", () => {
    it("carries every scored field through untouched when justifications fail", () => {
      // Risk #1's actual requirement. Asserting that nothing threw would pass
      // even if the scores had been dropped on the way out; this asserts they
      // survived into the payload the user receives.
      const merged = mergeJustifications(RANKED, { ok: false, message: "gone" });

      expect(merged.opportunities).toEqual([
        { ...RANKED[0], justification: null },
        { ...RANKED[1], justification: null },
      ]);
    });

    it("preserves row order", () => {
      const merged = mergeJustifications(RANKED, answered([{ video_id: "vid2", justification: "Second." }]));

      expect(merged.opportunities.map((o) => o.video_id)).toEqual(["vid1", "vid2"]);
    });

    it("handles an empty ranking", () => {
      const merged = mergeJustifications([], answered([]));

      expect(merged.opportunities).toEqual([]);
      // Vacuously true, and harmless: with no rows there is nothing to promise.
      expect(merged.justifications_available).toBe(true);
      expect(merged.justifications_error).toBeNull();
    });
  });
});
