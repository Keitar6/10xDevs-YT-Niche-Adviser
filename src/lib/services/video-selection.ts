/**
 * The rules that decide FR-008's denominator, as pure functions.
 *
 * `outlier_score` is a video's views over its channel's median, so *which*
 * videos form that median is as load-bearing as the arithmetic in
 * `scoring.ts` — and until this module existed those rules lived inside two
 * module-private `async` helpers in `youtube.ts`, behind two awaits and a
 * faked transport, where nothing could reach them. Extracted here for the same
 * reason `justification-merge.ts` was: the layer that decides a number should
 * be the layer that is testable.
 *
 * `youtube.ts` keeps the paging and the HTTP. Everything below is synchronous
 * and owns no constants of its own — the numbers stay in `scoring.ts`, next to
 * the rest of the product's tuning.
 */
import { MAX_WINDOW_DAYS, TARGET_LONGFORM_PER_CHANNEL, type ScorableVideo, isShort } from "./scoring";

const MS_PER_DAY = 86_400_000;

/**
 * One `playlistItems` entry, narrowed to the two fields selection reads.
 *
 * Mirrors what `playlistItemsSchema` already models: the video's own id
 * (`contentDetails.videoId`, or `snippet.resourceId.videoId` when only
 * `snippet` came back) and when the video went public
 * (`contentDetails.videoPublishedAt`, falling back to `snippet.publishedAt`).
 * `published_at` is optional because a malformed page can omit both.
 */
export interface PlaylistCandidate {
  video_id: string;
  published_at: string | undefined;
}

/**
 * Ordered, deduplicated candidate video ids, bounded by the staleness cutoff.
 *
 * `MAX_WINDOW_DAYS` is a **per-item staleness bound**, not a paging stop. It
 * was the latter until this module existed, with three consequences that were
 * all reachable:
 *
 * - A non-monotonic uploads playlist truncated the sample. One old item near
 *   the front ended the walk and every newer item behind it was lost. Stale
 *   items are now skipped and the scan continues.
 * - An item whose timestamp was absent or unparseable fell through and was
 *   *kept*, so an arbitrarily old video could enter the sample and move the
 *   median. In-window membership cannot be established for such an item, so it
 *   is now skipped — the same drop-what-cannot-be-read stance
 *   `fetchVideoDetails` and `parseIsoDuration` already take.
 * - An id returned on two pages was collected twice and double-counted in both
 *   the median and `sample_size`. First occurrence wins, which preserves
 *   playlist order (newest first) so the cap downstream still keeps the newest.
 *
 * Paging is now bounded by `MAX_PAGES` alone. The trade is at most one extra
 * `playlistItems` call per channel — ~+5 units on a 5-competitor run against a
 * 10,000/day budget — in exchange for a sample that a single bad record cannot
 * truncate.
 */
export function selectCandidateIds(items: PlaylistCandidate[], now: Date): string[] {
  const cutoff = now.getTime() - MAX_WINDOW_DAYS * MS_PER_DAY;
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const publishedMs = item.published_at === undefined ? NaN : Date.parse(item.published_at);
    if (Number.isNaN(publishedMs) || publishedMs < cutoff) continue;
    if (seen.has(item.video_id)) continue;
    seen.add(item.video_id);
    ids.push(item.video_id);
  }

  return ids;
}

/**
 * The capped long-form sample, in playlist order.
 *
 * Durations are only known once `videos.list` has answered, so this is where
 * Shorts are dropped and where `TARGET_LONGFORM_PER_CHANNEL` applies — it caps
 * the sample, it never bounds the paging above. Playlist order is newest
 * first, so the cap keeps the newest. An id missing from the map (a deleted or
 * private video, or one whose record could not be read) skips without
 * consuming a cap slot.
 */
export function selectChannelSample(orderedIds: string[], byId: Map<string, ScorableVideo>): ScorableVideo[] {
  const videos: ScorableVideo[] = [];

  for (const videoId of orderedIds) {
    if (videos.length >= TARGET_LONGFORM_PER_CHANNEL) break;
    const video = byId.get(videoId);
    if (video === undefined || isShort(video.duration_seconds)) continue;
    videos.push(video);
  }

  return videos;
}
