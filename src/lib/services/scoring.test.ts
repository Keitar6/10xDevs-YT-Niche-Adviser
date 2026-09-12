import { describe, expect, it } from "vitest";
import {
  MIN_SAMPLE_SIZE,
  type ChannelSample,
  type ChannelScoreResult,
  type ScorableVideo,
  isShort,
  median,
  parseIsoDuration,
  rankOpportunities,
  scoreChannel,
} from "./scoring";

const NOW = new Date("2026-09-12T12:00:00Z");

function daysBefore(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

function video(overrides: Partial<ScorableVideo> & Pick<ScorableVideo, "video_id">): ScorableVideo {
  return {
    title: `Video ${overrides.video_id}`,
    channel_id: "UCaaaaaaaaaaaaaaaaaaaaaa",
    channel_title: "Test Channel",
    published_at: daysBefore(30),
    duration_seconds: 600,
    view_count: 1000,
    ...overrides,
  };
}

function sample(videos: ScorableVideo[], overrides: Partial<ChannelSample> = {}): ChannelSample {
  return {
    channel_id: "UCaaaaaaaaaaaaaaaaaaaaaa",
    channel_title: "Test Channel",
    videos,
    ...overrides,
  };
}

/** The rankable video IDs of a result, or `[]` if the channel was skipped. */
function rankedIds(result: ChannelScoreResult): string[] {
  return result.kind === "scored" ? result.rankable.map((o) => o.video_id) : [];
}

describe("median", () => {
  it("returns the middle of an odd-length set", () => {
    expect(median([1, 2, 3])).toBe(2);
  });

  it("returns the mean of the two middles of an even-length set", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("returns the only element of a single-element set", () => {
    expect(median([7])).toBe(7);
  });

  it("sorts numerically, not lexicographically, before picking the middle", () => {
    // The lexicographic default would order these [10, 100, 9] and answer 100.
    expect(median([100, 9, 10])).toBe(10);
  });

  it("does not mutate its input", () => {
    const values = [3, 1, 2];
    median(values);
    expect(values).toEqual([3, 1, 2]);
  });

  it("returns 0 for an empty set, as documented", () => {
    expect(median([])).toBe(0);
  });
});

describe("parseIsoDuration", () => {
  it("parses the shapes YouTube emits", () => {
    expect(parseIsoDuration("PT15M51S")).toBe(951);
    expect(parseIsoDuration("PT1H2M3S")).toBe(3723);
    expect(parseIsoDuration("PT45S")).toBe(45);
    expect(parseIsoDuration("PT2H")).toBe(7200);
    // Multi-day livestream archives are the one place days appear.
    expect(parseIsoDuration("P1DT1H")).toBe(90_000);
  });

  it("returns 0 for anything unparseable, so the record is dropped as a Short", () => {
    expect(parseIsoDuration("15:51")).toBe(0);
    expect(parseIsoDuration("")).toBe(0);
    expect(isShort(parseIsoDuration("not a duration"))).toBe(true);
  });
});

describe("isShort", () => {
  it("excludes a video of exactly 300 seconds and includes one of 301", () => {
    expect(isShort(300)).toBe(true);
    expect(isShort(301)).toBe(false);
    expect(isShort(parseIsoDuration("PT5M"))).toBe(true);
    expect(isShort(parseIsoDuration("PT5M1S"))).toBe(false);
  });
});

describe("scoreChannel", () => {
  it("excludes Shorts before counting the sample, so a Shorts-padded channel is skipped", () => {
    const result = scoreChannel(
      sample([
        video({ video_id: "a" }),
        video({ video_id: "b" }),
        video({ video_id: "c" }),
        video({ video_id: "d" }),
        video({ video_id: "s1", duration_seconds: 45 }),
        video({ video_id: "s2", duration_seconds: 300 }),
        video({ video_id: "s3", duration_seconds: 120 }),
      ]),
      NOW,
    );

    expect(result.kind).toBe("skipped");
    if (result.kind !== "skipped") return;
    expect(result.reason).toBe("insufficient_sample");
    // Four long-form videos, not seven: the three Shorts never counted.
    expect(result.sample_size).toBe(4);
    expect(result.sample_size).toBeLessThan(MIN_SAMPLE_SIZE);
    expect(result.channel_title).toBe("Test Channel");
  });

  it("excludes Shorts from the baseline itself, not merely from the ranking", () => {
    const longform = [10, 20, 30, 40, 50].map((view_count, i) =>
      video({ video_id: `L${i}`, view_count, duration_seconds: 600 }),
    );
    const result = scoreChannel(
      sample([
        ...longform,
        // Shorts view counts are inflated by design (counted from start/replay
        // events with no minimum watch time), which is why they cannot be
        // allowed anywhere near the baseline.
        video({ video_id: "S1", view_count: 1_000_000, duration_seconds: 30 }),
        video({ video_id: "S2", view_count: 1_000_000, duration_seconds: 45 }),
      ]),
      NOW,
    );

    expect(result.kind).toBe("scored");
    if (result.kind !== "scored") return;
    expect(result.sample_size).toBe(5);
    // Median over the five long-form videos is 30. Had the two Shorts been left
    // in, the seven-element median would have been 40 and every genuine
    // outlier on this channel would have been suppressed.
    expect(result.channel_median).toBe(30);
    expect(result.rankable.map((o) => o.video_id)).toEqual(["L0", "L1", "L2", "L3", "L4"]);
  });

  it("skips a channel whose median is 0 rather than scoring Infinity or NaN", () => {
    const result = scoreChannel(
      sample([
        video({ video_id: "a", view_count: 0 }),
        video({ video_id: "b", view_count: 0 }),
        video({ video_id: "c", view_count: 0 }),
        video({ video_id: "d", view_count: 10 }),
        video({ video_id: "e", view_count: 20 }),
      ]),
      NOW,
    );

    expect(result.kind).toBe("skipped");
    if (result.kind !== "skipped") return;
    expect(result.reason).toBe("zero_median");
    expect(result.sample_size).toBe(5);
    // And nothing from it can reach the ranking.
    expect(rankOpportunities([result])).toEqual([]);
  });

  it("withholds a video younger than 7 days from the ranking while keeping it in the baseline", () => {
    const result = scoreChannel(
      sample([
        video({ video_id: "a", view_count: 100, published_at: daysBefore(40) }),
        video({ video_id: "b", view_count: 200, published_at: daysBefore(30) }),
        video({ video_id: "c", view_count: 300, published_at: daysBefore(20) }),
        video({ video_id: "d", view_count: 400, published_at: daysBefore(10) }),
        video({ video_id: "young", view_count: 1000, published_at: daysBefore(2) }),
      ]),
      NOW,
    );

    expect(result.kind).toBe("scored");
    if (result.kind !== "scored") return;
    // Median over all five long-form videos is 300. Over the four rankable
    // ones alone it would be 250 — so this asserts the young video counted.
    expect(result.channel_median).toBe(300);
    expect(result.sample_size).toBe(5);
    expect(result.rankable.map((o) => o.video_id)).toEqual(["a", "b", "c", "d"]);
    expect(result.rankable.find((o) => o.video_id === "c")?.outlier_score).toBe(1);
    expect(result.rankable.find((o) => o.video_id === "d")?.outlier_score).toBeCloseTo(400 / 300);
  });

  it("treats the 7-day boundary as rankable at exactly 7 days", () => {
    const videos = [
      video({ video_id: "a", view_count: 100 }),
      video({ video_id: "b", view_count: 100 }),
      video({ video_id: "c", view_count: 100 }),
      video({ video_id: "d", view_count: 100 }),
      video({ video_id: "edge", view_count: 100, published_at: daysBefore(7) }),
    ];
    expect(rankedIds(scoreChannel(sample(videos), NOW))).toContain("edge");

    const justInside = sample([
      ...videos.slice(0, 4),
      video({ video_id: "edge", view_count: 100, published_at: daysBefore(6.9) }),
    ]);
    expect(rankedIds(scoreChannel(justInside, NOW))).not.toContain("edge");
  });
});

describe("rankOpportunities", () => {
  const channelA = sample(
    [
      video({ video_id: "a1", view_count: 100 }),
      video({ video_id: "a2", view_count: 100 }),
      video({ video_id: "a3", view_count: 100 }),
      video({ video_id: "a4", view_count: 100 }),
      video({ video_id: "a5", view_count: 900 }),
    ],
    { channel_id: "UCaaaaaaaaaaaaaaaaaaaaaa", channel_title: "Channel A" },
  );

  const channelB = sample(
    [
      video({ video_id: "b1", channel_id: "UCbbbbbbbbbbbbbbbbbbbbbb", view_count: 1000 }),
      video({ video_id: "b2", channel_id: "UCbbbbbbbbbbbbbbbbbbbbbb", view_count: 1000 }),
      video({ video_id: "b3", channel_id: "UCbbbbbbbbbbbbbbbbbbbbbb", view_count: 1000 }),
      video({ video_id: "b4", channel_id: "UCbbbbbbbbbbbbbbbbbbbbbb", view_count: 1000 }),
      video({ video_id: "b5", channel_id: "UCbbbbbbbbbbbbbbbbbbbbbb", view_count: 3000 }),
    ],
    { channel_id: "UCbbbbbbbbbbbbbbbbbbbbbb", channel_title: "Channel B" },
  );

  it("ranks across channels by score, not by raw view count", () => {
    const ranked = rankOpportunities([scoreChannel(channelA, NOW), scoreChannel(channelB, NOW)], 5);

    // b5 has 3000 views against a5's 900, but a5 is 9x its channel median
    // while b5 is only 3x — the whole point of a per-channel baseline.
    expect(ranked[0].video_id).toBe("a5");
    expect(ranked[0].outlier_score).toBe(9);
    expect(ranked[1].video_id).toBe("b5");
    expect(ranked[1].outlier_score).toBe(3);
  });

  it("honours the limit", () => {
    expect(rankOpportunities([scoreChannel(channelA, NOW), scoreChannel(channelB, NOW)], 3)).toHaveLength(3);
    expect(rankOpportunities([scoreChannel(channelA, NOW), scoreChannel(channelB, NOW)])).toHaveLength(5);
  });

  it("breaks a score tie by publication date descending, then by video ID ascending", () => {
    const tied = sample([
      video({ video_id: "older", view_count: 100, published_at: daysBefore(30) }),
      video({ video_id: "zz", view_count: 100, published_at: daysBefore(10) }),
      video({ video_id: "aa", view_count: 100, published_at: daysBefore(10) }),
      video({ video_id: "pad1", view_count: 100, published_at: daysBefore(40) }),
      video({ video_id: "pad2", view_count: 100, published_at: daysBefore(50) }),
    ]);

    const ranked = rankOpportunities([scoreChannel(tied, NOW)], 5);

    // Every score is exactly 1.0, so ordering is entirely tie-break driven.
    expect(new Set(ranked.map((o) => o.outlier_score))).toEqual(new Set([1]));
    expect(ranked.map((o) => o.video_id)).toEqual(["aa", "zz", "older", "pad1", "pad2"]);
  });

  it("is deterministic: identical input data yields identical scores and ordering", () => {
    const results = [scoreChannel(channelA, NOW), scoreChannel(channelB, NOW)];
    expect(rankOpportunities(results, 5)).toEqual(rankOpportunities(results, 5));

    // Same data, channels supplied in the opposite order: the comparator is
    // total, so the ranking must not depend on input order either.
    const reversed = [scoreChannel(channelB, NOW), scoreChannel(channelA, NOW)];
    expect(rankOpportunities(reversed, 5)).toEqual(rankOpportunities(results, 5));
  });

  it("ignores skipped channels", () => {
    const skipped = scoreChannel(sample([video({ video_id: "only" })]), NOW);
    expect(rankOpportunities([skipped, scoreChannel(channelA, NOW)], 5).map((o) => o.video_id)).toEqual([
      "a5",
      "a1",
      "a2",
      "a3",
      "a4",
    ]);
  });

  it("returns an empty ranking when every channel was skipped", () => {
    expect(rankOpportunities([scoreChannel(sample([]), NOW)], 5)).toEqual([]);
  });
});
