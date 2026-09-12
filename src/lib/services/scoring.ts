/**
 * The product's core hypothesis, as pure functions.
 *
 * No `fetch`, no `astro:env/server`, no framework coupling — everything here is
 * synchronous and deterministic so the repeatability NFR ("identical scores and
 * identical ordering for identical input data") is verifiable by unit test
 * rather than by clicking around. It also keeps this module cheap against the
 * Worker's 10ms CPU budget: one sort per channel plus one sort at the end.
 *
 * Naming: the exported DTOs use snake_case because they cross the wire as the
 * `/api/analyze` response and become `content_opportunities` rows in S-03.
 * Internal helpers follow the repo's camelCase.
 */

/**
 * Videos at or under this duration are treated as Shorts and excluded.
 *
 * There is no Shorts flag anywhere in the Data API, so duration is the only
 * signal. Since 2025-03-31 Shorts views are counted from start/replay events
 * with no minimum watch time, which inflates them by design — one Short that
 * leaks through raises the channel median and suppresses every genuine outlier
 * on that channel. Hence exclusion happens *before* the baseline is computed.
 */
export const SHORTS_MAX_SECONDS = 300;

/**
 * A video must be this old to be returned as an opportunity. Younger videos
 * still count toward the channel baseline — they just have not had time to
 * accumulate a representative view count, so ranking them would be noise.
 */
export const MIN_RANKABLE_AGE_DAYS = 7;

/** Fewer long-form videos than this and the channel has no usable baseline. */
export const MIN_SAMPLE_SIZE = 5;

/** Cap on a channel's sample, applied after durations are known. */
export const TARGET_LONGFORM_PER_CHANNEL = 20;

/** Paging stops once `playlistItems` reaches an upload older than this. */
export const MAX_WINDOW_DAYS = 180;

/** Hard cap on `playlistItems` pages per channel (50 items each). */
export const MAX_PAGES = 2;

const MS_PER_DAY = 86_400_000;

/** One video, as the scoring pipeline needs it. Built by `./youtube.ts`. */
export interface ScorableVideo {
  video_id: string;
  title: string;
  channel_id: string;
  /** Absent for channels whose `snippet` part came back without a title. */
  channel_title: string | null;
  /** RFC 3339 timestamp, exactly as `snippet.publishedAt` supplies it. */
  published_at: string;
  duration_seconds: number;
  view_count: number;
}

/** A channel and the candidate videos collected for it. */
export interface ChannelSample {
  channel_id: string;
  channel_title: string | null;
  videos: ScorableVideo[];
}

/** A scored, rankable video. */
export interface ScoredOpportunity {
  video_id: string;
  title: string;
  channel_id: string;
  channel_title: string | null;
  published_at: string;
  view_count: number;
  /** `view_count / channel_median`. 1.0 means "typical for this channel". */
  outlier_score: number;
  channel_median: number;
  sample_size: number;
}

export type SkipReason = "insufficient_sample" | "zero_median";

export type ChannelScoreResult =
  | {
      kind: "scored";
      channel_id: string;
      channel_title: string | null;
      sample_size: number;
      channel_median: number;
      /** Videos old enough to rank. Younger ones moved the median and stop there. */
      rankable: ScoredOpportunity[];
    }
  | {
      kind: "skipped";
      channel_id: string;
      channel_title: string | null;
      /** Long-form videos found, which is the number worth reporting back. */
      sample_size: number;
      reason: SkipReason;
      message: string;
    };

/**
 * Sorted middle; mean of the two middles for an even count.
 *
 * Returns `0` for an empty array. That case is unreachable in the pipeline —
 * the minimum-sample floor runs first — but a total function is easier to
 * reason about than one that throws from inside a `.map()`.
 */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

export function isShort(durationSeconds: number): boolean {
  return durationSeconds <= SHORTS_MAX_SECONDS;
}

const ISO_DURATION_PATTERN = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

/**
 * An unmatched regex group is `undefined` at runtime even though
 * `RegExpExecArray` types every element as `string`, so the widening happens
 * here rather than at each call site.
 */
function groupToNumber(group: string | undefined): number {
  return group === undefined ? 0 : Number(group);
}

/**
 * ISO-8601 duration to seconds.
 *
 * YouTube never emits years, months or weeks for a video, so days through
 * seconds covers every real value (days appear only on multi-day livestream
 * archives). Anything unparseable returns `0`, which `isShort` then excludes:
 * dropping a record we cannot read is safe, whereas guessing a duration would
 * let it pollute a channel's baseline.
 */
export function parseIsoDuration(iso: string): number {
  const match = ISO_DURATION_PATTERN.exec(iso.trim());
  if (!match) return 0;
  const days = groupToNumber(match[1]);
  const hours = groupToNumber(match[2]);
  const minutes = groupToNumber(match[3]);
  const seconds = groupToNumber(match[4]);
  return days * 86_400 + hours * 3_600 + minutes * 60 + seconds;
}

/**
 * Score one channel's videos against that channel's own median view count.
 *
 * The order of operations is the load-bearing part:
 *   exclude Shorts -> sample floor -> median -> zero-median guard -> score ->
 *   withhold videos younger than `MIN_RANKABLE_AGE_DAYS` from the ranking.
 *
 * `now` is injected rather than read from `Date.now()` so age-dependent
 * behaviour is testable.
 */
export function scoreChannel(sample: ChannelSample, now: Date): ChannelScoreResult {
  const longform = sample.videos.filter((video) => !isShort(video.duration_seconds));
  const identity = { channel_id: sample.channel_id, channel_title: sample.channel_title };

  if (longform.length < MIN_SAMPLE_SIZE) {
    return {
      kind: "skipped",
      ...identity,
      sample_size: longform.length,
      reason: "insufficient_sample",
      message: `Only ${longform.length} long-form video${longform.length === 1 ? "" : "s"} found; at least ${MIN_SAMPLE_SIZE} are needed to establish a baseline.`,
    };
  }

  const channelMedian = median(longform.map((video) => video.view_count));

  // The sample floor guarantees a non-empty array but not a non-zero median:
  // three of five long-form videos at 0 views is enough. Without this guard
  // every video scores `Infinity` (or `NaN` for 0/0) — `Infinity` sorts
  // straight to rank 1 and renders as the literal string "Infinity", while
  // `NaN` compares inconsistently and destroys the deterministic ordering the
  // NFR requires. A divide-by-zero must never reach the ranking.
  if (channelMedian <= 0) {
    return {
      kind: "skipped",
      ...identity,
      sample_size: longform.length,
      reason: "zero_median",
      message: `Median view count across ${longform.length} long-form videos is 0, so no meaningful comparison is possible.`,
    };
  }

  const rankableBefore = now.getTime() - MIN_RANKABLE_AGE_DAYS * MS_PER_DAY;
  const rankable: ScoredOpportunity[] = [];
  for (const video of longform) {
    // An unparseable timestamp yields NaN, which fails this comparison and
    // withholds the video from the ranking while leaving it in the baseline.
    if (!(Date.parse(video.published_at) <= rankableBefore)) continue;
    rankable.push({
      video_id: video.video_id,
      title: video.title,
      channel_id: video.channel_id,
      channel_title: video.channel_title,
      published_at: video.published_at,
      view_count: video.view_count,
      outlier_score: video.view_count / channelMedian,
      channel_median: channelMedian,
      sample_size: longform.length,
    });
  }

  return { kind: "scored", ...identity, sample_size: longform.length, channel_median: channelMedian, rankable };
}

/**
 * Flatten every channel's rankable videos into one global ranking.
 *
 * Ties are broken by publication date descending, then video ID ascending, so
 * identical input always produces identical ordering. `localeCompare` is
 * deliberately avoided — its result depends on the runtime's locale data.
 */
export function rankOpportunities(results: ChannelScoreResult[], limit = 5): ScoredOpportunity[] {
  const all: ScoredOpportunity[] = [];
  for (const result of results) {
    if (result.kind === "scored") all.push(...result.rankable);
  }

  all.sort((a, b) => {
    if (a.outlier_score !== b.outlier_score) return b.outlier_score - a.outlier_score;
    const publishedDiff = Date.parse(b.published_at) - Date.parse(a.published_at);
    if (publishedDiff !== 0) return publishedDiff;
    return a.video_id < b.video_id ? -1 : a.video_id > b.video_id ? 1 : 0;
  });

  return all.slice(0, limit);
}
