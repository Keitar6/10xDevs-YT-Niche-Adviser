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
    // Deliberately skewed: the arithmetic mean of this set is 101. [1, 2, 3]
    // would have been degenerate — its median and its mean are both 2 — so
    // the 2026-09-11 średnia→mediana correction would survive the very test
    // named for it.
    expect(median([1, 2, 300])).toBe(2);
  });

  it("returns the mean of the two middles of an even-length set", () => {
    // Median 2.5, mean 26.5. [1, 2, 3, 4] was degenerate the same way.
    expect(median([1, 2, 3, 100])).toBe(2.5);
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
    // Sized from the constant so the threshold stays tunable: one short of the
    // floor in long-form videos, padded past it with Shorts.
    const longform = Array.from({ length: MIN_SAMPLE_SIZE - 1 }, (_, i) => video({ video_id: `L${i}` }));
    const shorts = [45, 300, 120].map((duration_seconds, i) => video({ video_id: `S${i}`, duration_seconds }));
    const result = scoreChannel(sample([...longform, ...shorts]), NOW);

    expect(result.kind).toBe("skipped");
    if (result.kind !== "skipped") return;
    expect(result.reason).toBe("insufficient_sample");
    // The three Shorts never counted: had exclusion run after the count, the
    // MIN_SAMPLE_SIZE + 2 videos supplied would have cleared the floor.
    expect(result.sample_size).toBe(MIN_SAMPLE_SIZE - 1);
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
        video({ video_id: "c", view_count: 400, published_at: daysBefore(20) }),
        video({ video_id: "d", view_count: 450, published_at: daysBefore(10) }),
        video({ video_id: "young", view_count: 1000, published_at: daysBefore(2) }),
      ]),
      NOW,
    );

    expect(result.kind).toBe("scored");
    if (result.kind !== "scored") return;
    // Median over all five long-form videos is 400. Over the four rankable
    // ones alone it would be 300 — so this asserts the young video counted.
    expect(result.channel_median).toBe(400);
    expect(result.sample_size).toBe(5);
    expect(result.rankable.map((o) => o.video_id)).toEqual(["a", "b", "c", "d"]);
    expect(result.rankable.find((o) => o.video_id === "c")?.outlier_score).toBe(1);
    // 450 views over a median of 400 is exactly 1.125, written as a literal
    // rather than as `450 / 400` so the expectation is not the formula under
    // test. Exact, not `toBeCloseTo`: rounding the score to 2 dp anywhere
    // before the wire would read 1.13 and fail here. Presentation decides
    // precision (`format.ts`), computation does not.
    expect(result.rankable.find((o) => o.video_id === "d")?.outlier_score).toBe(1.125);
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

  it("emits every field of a scored opportunity, not just the id and the score", () => {
    // Every value in the expected object is distinct from every other, so a
    // transposition between two fields cannot pass. These fields cross the
    // wire as the `/api/analyze` response and become `content_opportunities`
    // rows, so nulling or zeroing any one of them is a real regression.
    const views = [100, 200, 800, 2000, 3200];
    const videos = views.map((view_count, i) =>
      video({
        video_id: `p${i}`,
        title: `Payload ${i}`,
        channel_id: "UCzzzzzzzzzzzzzzzzzzzzzz",
        channel_title: "Payload Channel",
        view_count,
      }),
    );
    const result = scoreChannel(sample(videos, { channel_id: "UCzzzzzzzzzzzzzzzzzzzzzz" }), NOW);

    expect(result.kind).toBe("scored");
    if (result.kind !== "scored") return;
    // Sorted [100, 200, 800, 2000, 3200] -> median 800 (the mean is 1260).
    // The target video has 2000 views, so 2000 / 800 = 2.5 exactly.
    expect(result.rankable.find((o) => o.video_id === "p3")).toEqual({
      video_id: "p3",
      title: "Payload 3",
      channel_id: "UCzzzzzzzzzzzzzzzzzzzzzz",
      channel_title: "Payload Channel",
      published_at: daysBefore(30),
      view_count: 2000,
      outlier_score: 2.5,
      channel_median: 800,
      sample_size: 5,
    });
  });

  it("takes the mean of the two middles when the long-form sample has an even count", () => {
    // Six long-form videos, so `median`'s even branch is reached through the
    // real path rather than only through the direct unit test. Sorted
    // [10, 20, 30, 50, 400, 500] -> (30 + 50) / 2 = 40; the mean is 168.33…,
    // and the two middles alone would give 30 or 50 if either index slipped.
    const views = [500, 20, 400, 10, 50, 30];
    const result = scoreChannel(sample(views.map((view_count, i) => video({ video_id: `e${i}`, view_count }))), NOW);

    expect(result.kind).toBe("scored");
    if (result.kind !== "scored") return;
    expect(result.sample_size).toBe(6);
    expect(result.channel_median).toBe(40);
    // 400 / 40 = 10 exactly.
    expect(result.rankable.find((o) => o.video_id === "e2")?.outlier_score).toBe(10);
  });

  it("scores a video below its channel median under 1", () => {
    // Sorted [100, 200, 400, 800, 1600] -> median 400. The weakest video is
    // 100 / 400 = 0.25 exactly. Without a sub-median fixture every scored
    // opportunity in this file lands at or above 1.
    const result = scoreChannel(
      sample([100, 200, 400, 800, 1600].map((view_count, i) => video({ video_id: `u${i}`, view_count }))),
      NOW,
    );

    expect(result.kind).toBe("scored");
    if (result.kind !== "scored") return;
    expect(result.channel_median).toBe(400);
    expect(result.rankable.find((o) => o.video_id === "u0")?.outlier_score).toBe(0.25);
  });

  it("returns exactly one rankable video when the rest of a valid sample is too young", () => {
    const result = scoreChannel(
      sample([
        video({ video_id: "old", view_count: 600, published_at: daysBefore(40) }),
        video({ video_id: "y1", view_count: 100, published_at: daysBefore(1) }),
        video({ video_id: "y2", view_count: 200, published_at: daysBefore(2) }),
        video({ video_id: "y3", view_count: 300, published_at: daysBefore(3) }),
        video({ video_id: "y4", view_count: 400, published_at: daysBefore(4) }),
      ]),
      NOW,
    );

    expect(result.kind).toBe("scored");
    if (result.kind !== "scored") return;
    // All five moved the median: sorted [100, 200, 300, 400, 600] -> 300.
    expect(result.channel_median).toBe(300);
    expect(result.sample_size).toBe(5);
    expect(result.rankable.map((o) => o.video_id)).toEqual(["old"]);
    // 600 / 300 = 2 exactly.
    expect(result.rankable[0].outlier_score).toBe(2);
  });

  it("withholds a video whose published_at cannot be parsed while keeping it in the baseline", () => {
    // The documented NaN behaviour at scoring.ts:197-199: `Date.parse` yields
    // NaN, the `<=` comparison is false, the video is withheld — but it has
    // already counted toward the median.
    const result = scoreChannel(
      sample([
        video({ video_id: "a", view_count: 100, published_at: daysBefore(40) }),
        video({ video_id: "b", view_count: 200, published_at: daysBefore(30) }),
        video({ video_id: "c", view_count: 300, published_at: daysBefore(20) }),
        video({ video_id: "d", view_count: 400, published_at: daysBefore(10) }),
        video({ video_id: "unreadable", view_count: 5000, published_at: "last Tuesday" }),
      ]),
      NOW,
    );

    expect(result.kind).toBe("scored");
    if (result.kind !== "scored") return;
    // Median over all five is 300; over the four rankable ones it would be
    // 250 — so this asserts the unreadable record still counted.
    expect(result.channel_median).toBe(300);
    expect(result.sample_size).toBe(5);
    expect(result.rankable.map((o) => o.video_id)).toEqual(["a", "b", "c", "d"]);
  });

  it("withholds a zero-view video from the ranking while keeping it in the baseline", () => {
    // A 0-view video scores exactly 0, which the save boundary rejects twice
    // over — `z.number().gt(0)` in content-opportunity.ts and the
    // `check (outlier_score > 0)` on content_opportunities. Ranking an item
    // that 400s on Save is the user-visible inconsistency this closes.
    const result = scoreChannel(
      sample([
        video({ video_id: "zero", view_count: 0 }),
        video({ video_id: "b", view_count: 100 }),
        video({ video_id: "c", view_count: 200 }),
        video({ video_id: "d", view_count: 300 }),
        video({ video_id: "e", view_count: 400 }),
      ]),
      NOW,
    );

    expect(result.kind).toBe("scored");
    if (result.kind !== "scored") return;
    // Median over all five is 200. Over the four rankable ones it would be
    // 250 — so this asserts the zero-view video still moved the baseline.
    expect(result.channel_median).toBe(200);
    expect(result.sample_size).toBe(5);
    expect(result.rankable.map((o) => o.video_id)).toEqual(["b", "c", "d", "e"]);
    // No opportunity may carry a score the save path cannot accept.
    expect(result.rankable.every((o) => o.outlier_score > 0)).toBe(true);
  });

  it("reports an empty sample as insufficient, with a sample size of 0", () => {
    const result = scoreChannel(sample([]), NOW);

    expect(result.kind).toBe("skipped");
    if (result.kind !== "skipped") return;
    // Not `zero_median`: the floor runs before the median, so a channel with
    // no videos at all is explained by the count, not by the divide-by-zero.
    expect(result.reason).toBe("insufficient_sample");
    expect(result.sample_size).toBe(0);
    expect(result.message).toContain("Only 0 long-form videos found");
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
    // A limit of 0 is a real ranking of nothing, not "no limit": both channels
    // scored, so an off-by-one or a falsy-limit default would return rows here.
    expect(rankOpportunities([scoreChannel(channelA, NOW), scoreChannel(channelB, NOW)], 0)).toEqual([]);
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
    // Same data, channels supplied in the opposite order: the comparator is
    // total, so the ranking must not depend on input order either. This is the
    // one self-referential comparison in the file that earns its place — it
    // detects a non-total comparator, which no value assertion would. A
    // straight `rank(results) === rank(results)` sat here too and could not
    // fail short of introducing `Math.random()`; it is gone.
    const results = [scoreChannel(channelA, NOW), scoreChannel(channelB, NOW)];
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
