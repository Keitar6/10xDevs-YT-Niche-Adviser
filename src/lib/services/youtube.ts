import { z } from "zod";
import { MAX_PAGES, type ChannelSample, type ScorableVideo, parseIsoDuration } from "./scoring";
import { type PlaylistCandidate, selectCandidateIds, selectChannelSample } from "./video-selection";
import { type ChannelRef, parseChannelRef } from "./youtube-ids";

const API_BASE = "https://www.googleapis.com/youtube/v3";

// Per-call ceiling on the Data API. A whole 5-competitor run measures ~1.6s of
// YouTube time, so this bounds a hung connection without truncating a healthy
// call. Without it an unresponsive upstream has nothing stopping it from
// holding `/api/analyze` open indefinitely — `justify.ts` already bounds the
// Anthropic leg the same way.
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * `channels.list` response, modelling parts as *absent keys* rather than
 * nullable fields: a part the request did not ask for is simply missing from
 * the resource. `id` is always present regardless of `part`.
 */
const channelListSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        // `customUrl` is the `@handle` form. It is genuinely optional — a few
        // channels have never claimed one.
        snippet: z.object({ title: z.string(), customUrl: z.string().optional() }).optional(),
        contentDetails: z.object({ relatedPlaylists: z.object({ uploads: z.string() }) }).optional(),
      }),
    )
    .optional(),
});

const apiErrorSchema = z.object({
  error: z.object({
    code: z.number(),
    message: z.string(),
    errors: z.array(z.object({ reason: z.string().optional() })).optional(),
  }),
});

export type YouTubeFailure =
  | { kind: "quota"; message: string }
  | { kind: "auth"; message: string }
  | { kind: "transport"; message: string }
  | { kind: "malformed"; message: string };

export class YouTubeError extends Error {
  readonly failure: YouTubeFailure;

  constructor(failure: YouTubeFailure) {
    super(failure.message);
    this.name = "YouTubeError";
    this.failure = failure;
  }
}

/**
 * One GET against the Data API, with every failure classified rather than
 * collapsed — FR-009 requires the quota case to produce its own message.
 */
async function getJson(path: string, params: Record<string, string>, apiKey: string): Promise<unknown> {
  const url = new URL(`${API_BASE}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("key", apiKey);

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    // A timeout aborts as `TimeoutError`; everything else here is a genuine
    // transport failure. Both degrade to the same classified failure, but the
    // message distinguishes them because they need different responses from
    // whoever reads it.
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    throw new YouTubeError({
      kind: "transport",
      message: timedOut ? "The YouTube API did not respond in time." : "Could not reach the YouTube API.",
    });
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    throw new YouTubeError({ kind: "malformed", message: "The YouTube API returned a response we could not read." });
  }

  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(payload);
    const reasons = parsed.success ? (parsed.data.error.errors?.map((e) => e.reason) ?? []) : [];
    if (res.status === 403 && reasons.includes("quotaExceeded")) {
      throw new YouTubeError({
        kind: "quota",
        message: "The daily YouTube API quota has been used up. Try again after it resets (midnight Pacific time).",
      });
    }
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      throw new YouTubeError({
        kind: "auth",
        message: "The YouTube API key was rejected. Check the key and that YouTube Data API v3 is enabled.",
      });
    }
    throw new YouTubeError({
      kind: "transport",
      message: `The YouTube API returned an unexpected error (HTTP ${res.status}).`,
    });
  }

  return payload;
}

function parseChannelList(payload: unknown): z.infer<typeof channelListSchema> {
  const parsed = channelListSchema.safeParse(payload);
  if (!parsed.success) {
    throw new YouTubeError({ kind: "malformed", message: "The YouTube API returned an unexpected channel payload." });
  }
  return parsed.data;
}

export interface ResolvedChannel {
  /** Exactly what the user typed, so an error can quote it back. */
  input: string;
  channelId: string;
  /** The `@handle` form, when the channel has claimed one. */
  handle: string | null;
  title: string | null;
}

export interface ResolveChannelsResult {
  resolved: ResolvedChannel[];
  /** Inputs that parsed as a reference but matched no live channel. */
  unresolved: string[];
  /** Inputs that could not be a channel reference at all. */
  invalid: string[];
}

type ChannelItem = NonNullable<z.infer<typeof channelListSchema>["items"]>[number];

function toResolved(input: string, item: ChannelItem): ResolvedChannel {
  return {
    input,
    channelId: item.id,
    handle: item.snippet?.customUrl ?? null,
    title: item.snippet?.title ?? null,
  };
}

/**
 * Turn user-supplied competitor references into canonical channel IDs.
 *
 * Quota shape matters here: `id=` accepts a comma-joined batch and costs one
 * unit for the whole set, while `forHandle` accepts exactly one handle per
 * call (a comma-joined list returns an empty `items` array with no error).
 * So IDs go out as a single call and handles cost one unit each. This runs at
 * profile-save time — a rare operation — which is what keeps the per-analysis
 * call chain at its contracted one unit.
 */
export async function resolveChannelRefs(inputs: string[], apiKey: string): Promise<ResolveChannelsResult> {
  const invalid: string[] = [];
  const refs: { input: string; ref: ChannelRef }[] = [];

  for (const input of inputs) {
    const ref = parseChannelRef(input);
    if (ref === null) {
      invalid.push(input.trim());
    } else {
      refs.push({ input: input.trim(), ref });
    }
  }

  const resolved: ResolvedChannel[] = [];
  const unresolved: string[] = [];

  // All bare IDs in one call.
  const idRefs = refs.filter((r) => r.ref.kind === "id");
  if (idRefs.length > 0) {
    const ids = idRefs.map((r) => (r.ref.kind === "id" ? r.ref.id : ""));
    const payload = await getJson("channels", { part: "snippet", id: ids.join(",") }, apiKey);
    const items = parseChannelList(payload).items ?? [];
    const byId = new Map(items.map((item) => [item.id, item]));
    for (const { input, ref } of idRefs) {
      const item = ref.kind === "id" ? byId.get(ref.id) : undefined;
      if (item) {
        resolved.push(toResolved(input, item));
      } else {
        unresolved.push(input);
      }
    }
  }

  // One call per handle. Capped at the competitor limit, so this stays well
  // inside Cloudflare's 6 simultaneous outgoing connections.
  const handleRefs = refs.filter((r) => r.ref.kind === "handle");
  const handleResults = await Promise.allSettled(
    handleRefs.map(async ({ input, ref }) => {
      const handle = ref.kind === "handle" ? ref.handle : "";
      const payload = await getJson("channels", { part: "snippet", forHandle: handle }, apiKey);
      const items = parseChannelList(payload).items ?? [];
      // `.at()` rather than `[0]`: without `noUncheckedIndexedAccess` an index
      // read is typed as always-defined, which would hide the not-found case.
      return { input, item: items.at(0) };
    }),
  );
  for (const [index, outcome] of handleResults.entries()) {
    if (outcome.status === "fulfilled") {
      const { input, item } = outcome.value;
      if (item) {
        resolved.push(toResolved(input, item));
      } else {
        unresolved.push(input);
      }
      continue;
    }

    // Quota and auth failures describe the key, not the handle, so they stay
    // fatal — silently reporting every handle as unresolved would send the user
    // hunting for a typo that isn't there.
    const reason: unknown = outcome.reason;
    if (reason instanceof YouTubeError && (reason.failure.kind === "quota" || reason.failure.kind === "auth")) {
      throw reason;
    }

    // Anything else is local to this one lookup: report it as unresolved so the
    // other handles in the same save still land.
    unresolved.push(handleRefs[index].input);
  }

  return { resolved, unresolved, invalid };
}

/* -------------------------------------------------------------------------- *
 * The analysis call chain: channels.list -> playlistItems.list -> videos.list
 *
 * Three calls per competitor, ~3 units each, ~15 units for a 5-competitor run
 * against the project's 10,000/day bucket. The search endpoint costs 100 units
 * on its own and would cap the product at ~20 runs/day, so it is never used
 * here — a grep for it over `src/` is a success criterion of this slice.
 * -------------------------------------------------------------------------- */

/**
 * One page of an uploads playlist. `contentDetails.videoId` is the video's own
 * id; `snippet.resourceId.videoId` carries the same value and exists as a
 * fallback for the case where only `snippet` came back.
 *
 * `contentDetails.videoPublishedAt` is when the *video* went public, whereas
 * `snippet.publishedAt` is when the item was added to the playlist. They
 * coincide on an uploads playlist, but the former is the meaningful one.
 */
const playlistItemsSchema = z.object({
  items: z
    .array(
      z.object({
        snippet: z
          .object({
            publishedAt: z.string().optional(),
            resourceId: z.object({ videoId: z.string().optional() }).optional(),
          })
          .optional(),
        contentDetails: z.object({ videoId: z.string(), videoPublishedAt: z.string().optional() }).optional(),
      }),
    )
    .optional(),
  nextPageToken: z.string().optional(),
});

/**
 * `videos.list` items. `statistics.viewCount` arrives as a JSON *string*, so
 * `z.coerce.number()` is load-bearing: arithmetic on the raw value would
 * concatenate instead of summing.
 *
 * `viewCount` is optional because a channel can hide its view counts. Such a
 * video is dropped rather than scored as 0 — a false zero drags the channel
 * median down and can trip the zero-median guard for the whole channel.
 */
const videoListSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        snippet: z
          .object({
            title: z.string(),
            channelId: z.string(),
            channelTitle: z.string().optional(),
            publishedAt: z.string(),
          })
          .optional(),
        statistics: z.object({ viewCount: z.coerce.number().optional() }).optional(),
        contentDetails: z.object({ duration: z.string() }).optional(),
      }),
    )
    .optional(),
});

/** `videos.list` accepts up to 50 comma-joined ids for the same single unit. */
const VIDEOS_PER_CALL = 50;

/**
 * Why a competitor produced no usable sample.
 *
 * The distinction is the whole point: `not_found` is a statement about the
 * user's profile that they can act on by fixing an id, while `transport` and
 * `malformed` are statements about this one run that say nothing about whether
 * the channel exists. Collapsing them — as a bare `string[]` did — makes the
 * interface tell a user their channel id is wrong when YouTube simply 5xx'd.
 */
export type UnresolvedReason = "not_found" | "transport" | "malformed";

export interface UnresolvedCompetitor {
  /**
   * The raw `UC…` string: an unresolved channel has no title by definition, and
   * a failed one never got far enough to have been given one.
   */
  channel_id: string;
  reason: UnresolvedReason;
}

export interface CompetitorVideosResult {
  /** One entry per competitor that resolved, in the order they were requested. */
  channels: ChannelSample[];
  /** Requested ids that produced no usable sample, each with the reason why. */
  unresolved: UnresolvedCompetitor[];
}

interface ChannelTarget {
  channelId: string;
  title: string | null;
  uploadsPlaylistId: string;
}

function parsePlaylistItems(payload: unknown): z.infer<typeof playlistItemsSchema> {
  const parsed = playlistItemsSchema.safeParse(payload);
  if (!parsed.success) {
    throw new YouTubeError({ kind: "malformed", message: "The YouTube API returned an unexpected playlist payload." });
  }
  return parsed.data;
}

function parseVideoList(payload: unknown): z.infer<typeof videoListSchema> {
  const parsed = videoListSchema.safeParse(payload);
  if (!parsed.success) {
    throw new YouTubeError({ kind: "malformed", message: "The YouTube API returned an unexpected video payload." });
  }
  return parsed.data;
}

/**
 * Page an uploads playlist and hand the accumulated items to the selector.
 *
 * Paging bounds on `MAX_PAGES` and the absence of a `nextPageToken` — the
 * staleness cutoff is a per-item filter in `./video-selection.ts`, not a stop
 * condition, so one out-of-window upload no longer truncates the walk. Every
 * decision about *which* items survive belongs to that module. It
 * deliberately does **not** stop on a confirmed long-form count: duration is
 * unknown at this step, and checking it would mean calling `videos.list`
 * inside the loop, turning the three-call chain into an interleaved one and
 * breaking the quota budget. A channel that posts nothing but Shorts therefore
 * terminates on the page cap rather than paging forever; the Shorts it paid
 * for are discarded once durations arrive.
 */
async function collectCandidateIds(playlistId: string, apiKey: string, now: Date): Promise<string[]> {
  const candidates: PlaylistCandidate[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const params: Record<string, string> = {
      part: "snippet,contentDetails",
      playlistId,
      maxResults: "50",
    };
    if (pageToken !== undefined) params.pageToken = pageToken;

    const parsed = parsePlaylistItems(await getJson("playlistItems", params, apiKey));

    for (const item of parsed.items ?? []) {
      const videoId = item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId;
      if (videoId === undefined) continue;
      candidates.push({
        video_id: videoId,
        published_at: item.contentDetails?.videoPublishedAt ?? item.snippet?.publishedAt,
      });
    }

    pageToken = parsed.nextPageToken;
    if (pageToken === undefined) break;
  }

  return selectCandidateIds(candidates, now);
}

/**
 * Hydrate candidate ids into scorable records, 50 ids per call.
 *
 * Returned as a map rather than an array because `videos.list` may omit ids
 * (a deleted or private video) and does not guarantee request order, while the
 * sample cap is defined in playlist order.
 */
async function fetchVideoDetails(
  videoIds: string[],
  fallbackChannelTitle: string | null,
  apiKey: string,
): Promise<Map<string, ScorableVideo>> {
  const byId = new Map<string, ScorableVideo>();

  for (let offset = 0; offset < videoIds.length; offset += VIDEOS_PER_CALL) {
    const batch = videoIds.slice(offset, offset + VIDEOS_PER_CALL);
    // Three parts cost the same single unit as one, so they are never split
    // across calls.
    const parsed = parseVideoList(
      await getJson("videos", { part: "snippet,statistics,contentDetails", id: batch.join(",") }, apiKey),
    );

    for (const item of parsed.items ?? []) {
      const { snippet, statistics, contentDetails } = item;
      // A record missing any of these cannot be scored, and guessing a value
      // would let it pollute the channel baseline. Dropping it is the safe half.
      if (!snippet || contentDetails === undefined || statistics?.viewCount === undefined) continue;

      byId.set(item.id, {
        video_id: item.id,
        title: snippet.title,
        channel_id: snippet.channelId,
        channel_title: snippet.channelTitle ?? fallbackChannelTitle,
        published_at: snippet.publishedAt,
        duration_seconds: parseIsoDuration(contentDetails.duration),
        view_count: statistics.viewCount,
      });
    }
  }

  return byId;
}

async function collectChannelSample(target: ChannelTarget, apiKey: string, now: Date): Promise<ChannelSample> {
  const candidates = await collectCandidateIds(target.uploadsPlaylistId, apiKey, now);
  const byId = await fetchVideoDetails(candidates, target.title, apiKey);

  return {
    channel_id: target.channelId,
    channel_title: target.title,
    videos: selectChannelSample(candidates, byId),
  };
}

/**
 * Fetch the long-form video sample for every competitor, plus the
 * reconciliation summary the route needs to explain what it could not use.
 *
 * `now` is injected so the `MAX_WINDOW_DAYS` cutoff is testable.
 */
export async function fetchCompetitorVideos(
  channelIds: string[],
  apiKey: string,
  now: Date = new Date(),
): Promise<CompetitorVideosResult> {
  const requested = [...new Set(channelIds.map((id) => id.trim()).filter((id) => id.length > 0))];
  if (requested.length === 0) return { channels: [], unresolved: [] };

  // One unit for the whole set. `snippet` is requested alongside
  // `contentDetails` at no extra cost because a channel skipped by the sample
  // floor still has to be named in the results, and `snippet.title` is the only
  // place that title exists.
  const payload = await getJson("channels", { part: "contentDetails,snippet", id: requested.join(",") }, apiKey);
  const items = parseChannelList(payload).items ?? [];
  const byId = new Map(items.map((item) => [item.id, item]));

  const targets: ChannelTarget[] = [];
  const unresolved: UnresolvedCompetitor[] = [];
  for (const channelId of requested) {
    const item = byId.get(channelId);
    // The uploads playlist is read from `relatedPlaylists`, never derived by
    // string-munging the channel id — that shortcut is not a documented
    // guarantee. A channel without one is unusable, so it counts as unresolved.
    const uploads = item?.contentDetails?.relatedPlaylists.uploads;
    if (item === undefined || uploads === undefined) {
      // `channels.list` answered and this id was not in the answer, so this is
      // the one case where "not found" is a claim we can actually back.
      unresolved.push({ channel_id: channelId, reason: "not_found" });
      continue;
    }
    targets.push({ channelId: item.id, title: item.snippet?.title ?? null, uploadsPlaylistId: uploads });
  }

  // Fan-out is per channel, never per video: at most 5 competitors keeps this
  // under Cloudflare's limit of 6 simultaneous outgoing connections.
  const settled = await Promise.allSettled(targets.map((target) => collectChannelSample(target, apiKey, now)));

  const channels: ChannelSample[] = [];
  for (const [index, outcome] of settled.entries()) {
    if (outcome.status === "fulfilled") {
      channels.push(outcome.value);
      continue;
    }

    // Quota and auth failures are properties of the run, not of one competitor:
    // they will hit every remaining call too, so reporting them as a single
    // unlucky channel would be a lie. They stay fatal.
    const failure: unknown = outcome.reason;
    if (failure instanceof YouTubeError && (failure.failure.kind === "quota" || failure.failure.kind === "auth")) {
      throw failure;
    }

    // Anything else is local to this competitor. Folding it into `unresolved`
    // keeps every competitor that did succeed, which is what the slice promises:
    // a failed competitor is named, not silently dropped together with the run.
    //
    // The reason travels with it so the caller can say *this run failed to load
    // them* rather than *they do not exist*. A rejection that is not a
    // `YouTubeError` never reached the classification in `getJson`, so
    // `transport` is the honest floor: something between here and YouTube broke.
    // Every call in this fan-out funnels through `getJson`, so that arm is a
    // defensive floor rather than a case seen in practice — which is why no test
    // covers it.
    const reason: UnresolvedReason =
      failure instanceof YouTubeError && failure.failure.kind === "malformed" ? "malformed" : "transport";
    unresolved.push({ channel_id: targets[index].channelId, reason });
  }

  return { channels, unresolved };
}
