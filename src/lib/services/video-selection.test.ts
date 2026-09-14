import { describe, expect, it } from "vitest";
import { MAX_WINDOW_DAYS, TARGET_LONGFORM_PER_CHANNEL, type ScorableVideo } from "./scoring";
import { type PlaylistCandidate, selectCandidateIds, selectChannelSample } from "./video-selection";

const NOW = new Date("2026-09-12T12:00:00Z");

function daysBefore(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

/** A playlist entry, in window by default. */
function candidate(video_id: string, days = 30): PlaylistCandidate {
  return { video_id, published_at: daysBefore(days) };
}

function scorable(overrides: Partial<ScorableVideo> & Pick<ScorableVideo, "video_id">): ScorableVideo {
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

/** A map keyed the way `fetchVideoDetails` builds it. */
function detailsFor(videos: ScorableVideo[]): Map<string, ScorableVideo> {
  return new Map(videos.map((v) => [v.video_id, v]));
}

describe("selectCandidateIds", () => {
  it("keeps an item exactly at the staleness cutoff and drops one older", () => {
    // The guard is `publishedMs < cutoff`, so the boundary itself is inside.
    // Sized from the constant: the rule is what is pinned, not the 180.
    const items = [
      candidate("newer", MAX_WINDOW_DAYS - 1),
      candidate("exactly", MAX_WINDOW_DAYS),
      candidate("older", MAX_WINDOW_DAYS + 1),
    ];

    expect(selectCandidateIds(items, NOW)).toEqual(["newer", "exactly"]);
  });

  it("skips an out-of-window item in the middle and keeps everything behind it", () => {
    // The uploads playlist is meant to be newest-first, but it is not
    // guaranteed monotonic. This used to `break`, so `c` and `d` — both well
    // inside the window — were silently lost to one misplaced upload.
    const items = [
      candidate("a", 10),
      candidate("b", 20),
      candidate("stale", MAX_WINDOW_DAYS + 50),
      candidate("c", 30),
      candidate("d", 40),
    ];

    expect(selectCandidateIds(items, NOW)).toEqual(["a", "b", "c", "d"]);
  });

  it("skips an item whose timestamp is absent", () => {
    const items = [candidate("a"), { video_id: "no-timestamp", published_at: undefined }, candidate("b")];

    // Membership in the window cannot be established for it, and the old code
    // kept it — letting an arbitrarily old video move the channel median.
    expect(selectCandidateIds(items, NOW)).toEqual(["a", "b"]);
  });

  it("skips an item whose timestamp cannot be parsed", () => {
    const items = [candidate("a"), { video_id: "unreadable", published_at: "last Tuesday" }, candidate("b")];

    expect(selectCandidateIds(items, NOW)).toEqual(["a", "b"]);
  });

  it("collects an id repeated across the page boundary exactly once", () => {
    // Page one ends with `dup`; page two, fetched after a concurrent upload
    // shifted the playlist, begins with it again. Counted twice, it inflated
    // both the median's input and the reported `sample_size`.
    const pageOne = [candidate("a", 10), candidate("dup", 20)];
    const pageTwo = [candidate("dup", 20), candidate("b", 30)];

    expect(selectCandidateIds([...pageOne, ...pageTwo], NOW)).toEqual(["a", "dup", "b"]);
  });

  it("keeps the first occurrence, so playlist order still runs newest first", () => {
    const items = [candidate("newest", 1), candidate("middle", 50), candidate("newest", 1)];

    expect(selectCandidateIds(items, NOW)).toEqual(["newest", "middle"]);
  });

  it("returns an empty list when every item is stale", () => {
    const items = [candidate("a", MAX_WINDOW_DAYS + 1), candidate("b", MAX_WINDOW_DAYS + 2)];

    expect(selectCandidateIds(items, NOW)).toEqual([]);
  });
});

describe("selectChannelSample", () => {
  it("caps the sample at TARGET_LONGFORM_PER_CHANNEL, keeping the newest in playlist order", () => {
    // Sized from the constant, and deliberately one over it so the cap is what
    // truncates rather than the fixture running out.
    const overCap = TARGET_LONGFORM_PER_CHANNEL + 1;
    const videos = Array.from({ length: overCap }, (_, i) => scorable({ video_id: `v${i}` }));
    const ordered = videos.map((v) => v.video_id);

    const sample = selectChannelSample(ordered, detailsFor(videos));

    expect(sample).toHaveLength(TARGET_LONGFORM_PER_CHANNEL);
    // Playlist order is newest first, so the cap must drop the tail, not the head.
    expect(sample.map((v) => v.video_id)).toEqual(ordered.slice(0, TARGET_LONGFORM_PER_CHANNEL));
    expect(sample.map((v) => v.video_id)).not.toContain(`v${overCap - 1}`);
  });

  it("skips Shorts without consuming a cap slot", () => {
    // A Short between two long-form videos must not cost the sample a place —
    // otherwise a Shorts-heavy channel silently gets a smaller baseline than
    // the cap allows.
    const longform = Array.from({ length: TARGET_LONGFORM_PER_CHANNEL }, (_, i) => scorable({ video_id: `L${i}` }));
    const shorts = [
      scorable({ video_id: "S0", duration_seconds: 45 }),
      scorable({ video_id: "S1", duration_seconds: 300 }),
    ];
    // Shorts interleaved at the front, where a consumed slot would bite.
    const ordered = ["L0", "S0", "L1", "S1", ...longform.slice(2).map((v) => v.video_id)];

    const sample = selectChannelSample(ordered, detailsFor([...longform, ...shorts]));

    expect(sample).toHaveLength(TARGET_LONGFORM_PER_CHANNEL);
    expect(sample.map((v) => v.video_id)).toEqual(longform.map((v) => v.video_id));
  });

  it("skips an id missing from the details map without consuming a cap slot", () => {
    // `videos.list` omits deleted and private videos, and `fetchVideoDetails`
    // drops any record it cannot read — so the id list is always a superset.
    const longform = Array.from({ length: TARGET_LONGFORM_PER_CHANNEL }, (_, i) => scorable({ video_id: `L${i}` }));
    const ordered = ["L0", "deleted", "L1", "private", ...longform.slice(2).map((v) => v.video_id)];

    const sample = selectChannelSample(ordered, detailsFor(longform));

    expect(sample).toHaveLength(TARGET_LONGFORM_PER_CHANNEL);
    expect(sample.map((v) => v.video_id)).toEqual(longform.map((v) => v.video_id));
  });

  it("returns an empty sample when nothing survives", () => {
    expect(selectChannelSample([], new Map())).toEqual([]);
    expect(selectChannelSample(["gone"], new Map())).toEqual([]);
    expect(selectChannelSample(["s"], detailsFor([scorable({ video_id: "s", duration_seconds: 60 })]))).toEqual([]);
  });

  it("carries the whole video record through, not just the id", () => {
    const video = scorable({
      video_id: "keeper",
      title: "Carried Through",
      channel_title: "Selection Channel",
      view_count: 4242,
      duration_seconds: 601,
    });

    expect(selectChannelSample(["keeper"], detailsFor([video]))).toEqual([video]);
  });
});
