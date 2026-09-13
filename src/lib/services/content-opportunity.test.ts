import { describe, expect, it } from "vitest";
import { saveOpportunitySchema } from "./content-opportunity";

const VALID = {
  video_id: "abc123",
  title: "How to speedrun a niche",
  channel_id: "UC1234567890",
  channel_title: "Some Channel",
  published_at: "2026-08-01T00:00:00Z",
  view_count: 12_345,
  outlier_score: 1.7796,
  channel_median: 4_000,
  sample_size: 12,
  justification: "This video outperforms the channel median by a wide margin.",
};

describe("saveOpportunitySchema", () => {
  it("accepts a real AnalyzeOpportunity shape", () => {
    expect(saveOpportunitySchema.safeParse(VALID).success).toBe(true);
  });

  it("accepts a null justification — the degraded-Anthropic case", () => {
    const result = saveOpportunitySchema.safeParse({ ...VALID, justification: null });
    expect(result.success).toBe(true);
  });

  it("accepts a null channel_title", () => {
    const result = saveOpportunitySchema.safeParse({ ...VALID, channel_title: null });
    expect(result.success).toBe(true);
  });

  it("rejects a non-finite outlier_score", () => {
    expect(saveOpportunitySchema.safeParse({ ...VALID, outlier_score: Infinity }).success).toBe(false);
    expect(saveOpportunitySchema.safeParse({ ...VALID, outlier_score: NaN }).success).toBe(false);
  });

  it("rejects a zero channel_median", () => {
    expect(saveOpportunitySchema.safeParse({ ...VALID, channel_median: 0 }).success).toBe(false);
  });

  it("rejects a negative view_count", () => {
    expect(saveOpportunitySchema.safeParse({ ...VALID, view_count: -1 }).success).toBe(false);
  });

  it("rejects an empty video_id", () => {
    expect(saveOpportunitySchema.safeParse({ ...VALID, video_id: "" }).success).toBe(false);
  });

  it("rejects an over-long title", () => {
    expect(saveOpportunitySchema.safeParse({ ...VALID, title: "a".repeat(501) }).success).toBe(false);
  });

  it("rejects an unparseable published_at", () => {
    expect(saveOpportunitySchema.safeParse({ ...VALID, published_at: "not-a-date" }).success).toBe(false);
  });

  it("rejects a zero outlier_score", () => {
    expect(saveOpportunitySchema.safeParse({ ...VALID, outlier_score: 0 }).success).toBe(false);
  });

  it("rejects a non-integer sample_size", () => {
    expect(saveOpportunitySchema.safeParse({ ...VALID, sample_size: 1.5 }).success).toBe(false);
  });
});
