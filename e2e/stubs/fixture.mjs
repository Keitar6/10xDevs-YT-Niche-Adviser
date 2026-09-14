/**
 * The competitor data every e2e run analyses.
 *
 * Shared by the stub server (which serves it as YouTube would) and by the specs
 * (which seed a channel profile pointing at these ids, and assert on these
 * titles). Identity only — ids, titles, view counts, durations. No expected
 * *score* lives here on purpose: a spec that imported its expectation from the
 * same file the fixture came from would be restating the implementation, which
 * is the "formula in the expectation" anti-pattern `test-plan.md` §6.5 removed
 * from the unit suite. Scores are hand-derived literals in the spec, with the
 * counterfactual written beside them.
 *
 * The shape is chosen so the arithmetic is checkable in your head:
 * four videos at `BASELINE_VIEWS` and one outlier, per channel. Sorted, that is
 * [400, 400, 400, 400, outlier] with outlier > 400, so the median is exactly
 * 400 and each channel contributes one distinct score plus four 1.00s.
 */

/** Every fixture video sits at four times the Shorts ceiling, so none is dropped. */
export const LONGFORM_DURATION = "PT12M30S";

/** The median of every channel's sample, by construction. */
export const BASELINE_VIEWS = 400;

/** How many baseline videos accompany each outlier. `MIN_SAMPLE_SIZE` is 5. */
const BASELINE_COUNT = 4;

/**
 * Fixture ages, in days before the run's clock.
 *
 * All comfortably inside both bounds that decide membership: older than
 * `MIN_RANKABLE_AGE_DAYS` (7), so nothing is withheld as too recent, and far
 * newer than `MAX_WINDOW_DAYS` (180), so nothing is dropped as stale. The gap
 * on either side is what keeps the fixture from going red the day someone tunes
 * a constant by one.
 */
const OUTLIER_AGE_DAYS = 10;

export const STUB_CHANNELS = [
  { slug: "alpha", id: "UCe2eStubAlpha000000001", title: "Stub Alpha", handle: "@stubalpha", outlierViews: 500 },
  { slug: "beta", id: "UCe2eStubBeta0000000002", title: "Stub Beta", handle: "@stubbeta", outlierViews: 700 },
  { slug: "gamma", id: "UCe2eStubGamma000000003", title: "Stub Gamma", handle: "@stubgamma", outlierViews: 600 },
];

/** What a profile row's `competitors` column needs. */
export const STUB_COMPETITORS = STUB_CHANNELS.map(({ id, title, handle }) => ({ id, title, handle }));

export const uploadsPlaylistId = (channel) => `UU${channel.id.slice(2)}`;

/**
 * One channel's five videos, newest first — the order an uploads playlist
 * returns, and therefore the order the sample cap would keep.
 *
 * `now` is passed in rather than read here so every video in a single run is
 * dated against one instant, mirroring the single-clock rule the route follows.
 */
export function videosFor(channel, now) {
  const at = (days) => new Date(now.getTime() - days * 86_400_000).toISOString();

  const outlier = {
    id: `${channel.slug}-outlier`,
    title: `${channel.title} breakout upload`,
    viewCount: channel.outlierViews,
    publishedAt: at(OUTLIER_AGE_DAYS),
  };

  const baselines = Array.from({ length: BASELINE_COUNT }, (_, index) => ({
    id: `${channel.slug}-baseline-${index + 1}`,
    title: `${channel.title} baseline ${index + 1}`,
    viewCount: BASELINE_VIEWS,
    publishedAt: at(OUTLIER_AGE_DAYS + index + 1),
  }));

  return [outlier, ...baselines];
}

/**
 * The justification answer the stub returns: HTTP 200, correct envelope,
 * truncated body — a payload that stops mid-token.
 *
 * Exported so a spec can assert this text never reaches the page. That is the
 * "never a fabricated sentence" half of Risk #1: the run must not salvage a
 * half-sentence out of a broken answer and present it as advice.
 *
 * It lives here rather than in `upstream.mjs` because importing that module
 * starts a listening server.
 */
export const TRUNCATED_JUSTIFICATIONS = '{"justifications": [{"video_id": "beta-outlier", "justification": "This to';
