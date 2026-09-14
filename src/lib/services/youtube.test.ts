/**
 * The YouTube boundary, faked at the transport and nowhere else.
 *
 * `getJson` is deliberately not exported, which is the right shape: a test has
 * to fake `fetch` itself, so the real zod schemas, the real status/reason
 * classification and the real `allSettled` fan-out all stay in the exercised
 * path. Faking the parsing instead would leave the code that actually decides
 * what the user sees untested.
 *
 * The claim under test is not "errors are handled" but the sharper one the
 * module's own comments make: errors are *classified rather than collapsed*,
 * and the fatal/local split is chosen per failure kind — quota and auth are
 * properties of the run, everything else is local to one competitor.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_WINDOW_DAYS, TARGET_LONGFORM_PER_CHANNEL } from "./scoring";
import { YouTubeError, fetchCompetitorVideos } from "./youtube";

const NOW = new Date("2026-09-12T12:00:00Z");
const KEY = "test-key";

const CHANNEL_A = "UCaaaaaaaaaaaaaaaaaaaaaa";
const CHANNEL_B = "UCbbbbbbbbbbbbbbbbbbbbbb";
const CHANNEL_C = "UCcccccccccccccccccccccc";

function daysBefore(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

/* -------------------------------------------------------------------------- *
 * Payload factories — one per endpoint in the three-call chain.
 * -------------------------------------------------------------------------- */

function channelsPayload(ids: string[]) {
  return {
    items: ids.map((id) => ({
      id,
      snippet: { title: `Channel ${id.slice(-1).toUpperCase()}` },
      contentDetails: { relatedPlaylists: { uploads: `UU${id.slice(2)}` } },
    })),
  };
}

function playlistItemsPayload(videoIds: string[]) {
  return {
    items: videoIds.map((videoId) => ({
      contentDetails: { videoId, videoPublishedAt: daysBefore(30) },
    })),
  };
}

function videosPayload(videoIds: string[], channelId: string) {
  return {
    items: videoIds.map((videoId) => ({
      id: videoId,
      snippet: {
        title: `Video ${videoId}`,
        channelId,
        channelTitle: `Channel ${channelId.slice(-1).toUpperCase()}`,
        publishedAt: daysBefore(30),
      },
      // A string, as the API sends it — `z.coerce.number()` is load-bearing here.
      statistics: { viewCount: "1000" },
      contentDetails: { duration: "PT10M" },
    })),
  };
}

/* -------------------------------------------------------------------------- *
 * The transport fake.
 * -------------------------------------------------------------------------- */

interface Answer {
  body: unknown;
  status?: number;
  raw?: string;
}

/**
 * Routes each call by endpoint, and for the per-channel endpoints by which
 * channel is being asked about.
 *
 * A `Response` body is single-use, so every answer is *constructed on demand*
 * rather than captured — the chain issues three sequential calls per channel,
 * and reusing one instance would fail the second read with "body already used".
 */
function stubFetch(handler: (path: string, params: URLSearchParams) => Answer | Error): { calls: () => string[] } {
  const calls: string[] = [];

  vi.stubGlobal("fetch", (input: URL | string) => {
    const url = new URL(String(input));
    const path = url.pathname.split("/").pop() ?? "";
    calls.push(path);

    const answer = handler(path, url.searchParams);
    if (answer instanceof Error) return Promise.reject(answer);

    return Promise.resolve(
      new Response(answer.raw ?? JSON.stringify(answer.body), {
        status: answer.status ?? 200,
        headers: { "content-type": "application/json" },
      }),
    );
  });

  return { calls: () => calls };
}

/** A transport where every channel answers cleanly, save for the overrides. */
function stubHealthyChain(
  resolvedIds: string[],
  overrides: (path: string, params: URLSearchParams) => Answer | Error | null = () => null,
) {
  return stubFetch((path, params) => {
    const override = overrides(path, params);
    if (override !== null) return override;

    if (path === "channels") return { body: channelsPayload(resolvedIds) };
    if (path === "playlistItems") {
      const channelId = channelForPlaylist(params.get("playlistId") ?? "", resolvedIds);
      return { body: playlistItemsPayload([`vid-${channelId}`]) };
    }
    const requestedVideo = params.get("id") ?? "";
    return { body: videosPayload([requestedVideo], requestedVideo.replace("vid-", "")) };
  });
}

/** The uploads playlist id is `UU…` over the channel's own suffix. */
function channelForPlaylist(playlistId: string, resolvedIds: string[]): string {
  return resolvedIds.find((id) => `UU${id.slice(2)}` === playlistId) ?? "unknown";
}

/** An `AbortSignal.timeout` abort — a `TimeoutError`, not a generic failure. */
function timeoutError(): DOMException {
  return new DOMException("The operation timed out.", "TimeoutError");
}

afterEach(() => {
  // `unstubGlobals` defaults to false, so this is not automatic.
  vi.unstubAllGlobals();
});

/**
 * Narrows a caught value to `YouTubeError`, asserting the type on the way.
 *
 * Without the assertion a test that stopped rejecting would fail on an opaque
 * "cannot read properties of undefined" instead of naming what went wrong.
 */
function expectYouTubeError(error: unknown): YouTubeError {
  expect(error).toBeInstanceOf(YouTubeError);
  return error as YouTubeError;
}

describe("fetchCompetitorVideos", () => {
  describe("error classification", () => {
    it("names quota exhaustion as its own failure kind", async () => {
      // The one failure a user can act on by waiting, which is why FR-009
      // requires it to survive as a distinct kind rather than a generic 403.
      stubFetch(() => ({
        status: 403,
        body: { error: { code: 403, message: "quota", errors: [{ reason: "quotaExceeded" }] } },
      }));

      const error = await fetchCompetitorVideos([CHANNEL_A], KEY, NOW).catch((e: unknown) => e);

      expect(expectYouTubeError(error).failure.kind).toBe("quota");
    });

    it("treats a 403 without the quota reason as an auth failure", async () => {
      stubFetch(() => ({
        status: 403,
        body: { error: { code: 403, message: "forbidden", errors: [{ reason: "forbidden" }] } },
      }));

      const error = await fetchCompetitorVideos([CHANNEL_A], KEY, NOW).catch((e: unknown) => e);

      expect(expectYouTubeError(error).failure.kind).toBe("auth");
    });

    it.each([400, 401])("treats HTTP %i as an auth failure", async (status) => {
      stubFetch(() => ({ status, body: { error: { code: status, message: "bad key" } } }));

      const error = await fetchCompetitorVideos([CHANNEL_A], KEY, NOW).catch((e: unknown) => e);

      expect(expectYouTubeError(error).failure.kind).toBe("auth");
    });

    it("names the status on an unexpected server error", async () => {
      stubFetch(() => ({ status: 500, body: { error: { code: 500, message: "boom" } } }));

      const error = await fetchCompetitorVideos([CHANNEL_A], KEY, NOW).catch((e: unknown) => e);

      expect(expectYouTubeError(error).failure.kind).toBe("transport");
      expect(expectYouTubeError(error).message).toContain("500");
    });

    it("distinguishes a timeout from a generic transport failure", async () => {
      stubFetch(() => timeoutError());

      const error = await fetchCompetitorVideos([CHANNEL_A], KEY, NOW).catch((e: unknown) => e);

      expect(expectYouTubeError(error).failure.kind).toBe("transport");
      expect(expectYouTubeError(error).message).toContain("did not respond in time");
    });

    it("reports an unreachable API when the connection fails outright", async () => {
      stubFetch(() => new TypeError("fetch failed"));

      const error = await fetchCompetitorVideos([CHANNEL_A], KEY, NOW).catch((e: unknown) => e);

      expect(expectYouTubeError(error).failure.kind).toBe("transport");
      expect(expectYouTubeError(error).message).toContain("Could not reach");
    });

    it("classifies a 200 whose body is not JSON as malformed", async () => {
      stubFetch(() => ({ body: null, raw: "<!doctype html><html>proxy error</html>" }));

      const error = await fetchCompetitorVideos([CHANNEL_A], KEY, NOW).catch((e: unknown) => e);

      expect(expectYouTubeError(error).failure.kind).toBe("malformed");
    });

    it("classifies a 200 that fails the schema as malformed", async () => {
      stubFetch(() => ({ body: { items: "not an array" } }));

      const error = await fetchCompetitorVideos([CHANNEL_A], KEY, NOW).catch((e: unknown) => e);

      expect(expectYouTubeError(error).failure.kind).toBe("malformed");
    });

    it("treats a 200 with no items as a legitimate empty answer, not a failure", async () => {
      // The distinction Risk #2 is named after: an empty result means the
      // competitors published nothing, and must never be reachable by a failure.
      stubFetch((path) => {
        if (path === "channels") return { body: channelsPayload([CHANNEL_A]) };
        return { body: { items: [] } };
      });

      const result = await fetchCompetitorVideos([CHANNEL_A], KEY, NOW);

      expect(result.unresolved).toEqual([]);
      expect(result.channels).toEqual([{ channel_id: CHANNEL_A, channel_title: "Channel A", videos: [] }]);
    });
  });

  describe("the fatal / local split across the fan-out", () => {
    it("fails the whole run when one competitor hits quota", async () => {
      // Quota will hit every remaining call too, so reporting it as one unlucky
      // channel would be a lie — and would hand the user a ranking computed
      // over an arbitrary subset.
      stubHealthyChain([CHANNEL_A, CHANNEL_B, CHANNEL_C], (path, params) => {
        if (path === "playlistItems" && params.get("playlistId") === `UU${CHANNEL_B.slice(2)}`) {
          return {
            status: 403,
            body: { error: { code: 403, message: "quota", errors: [{ reason: "quotaExceeded" }] } },
          };
        }
        return null;
      });

      const error = await fetchCompetitorVideos([CHANNEL_A, CHANNEL_B, CHANNEL_C], KEY, NOW).catch((e: unknown) => e);

      expect(expectYouTubeError(error).failure.kind).toBe("quota");
    });

    it("fails the whole run when one competitor hits an auth error", async () => {
      stubHealthyChain([CHANNEL_A, CHANNEL_B], (path, params) => {
        if (path === "playlistItems" && params.get("playlistId") === `UU${CHANNEL_B.slice(2)}`) {
          return { status: 401, body: { error: { code: 401, message: "bad key" } } };
        }
        return null;
      });

      const error = await fetchCompetitorVideos([CHANNEL_A, CHANNEL_B], KEY, NOW).catch((e: unknown) => e);

      expect(expectYouTubeError(error).failure.kind).toBe("auth");
    });

    it("keeps the survivors and reason-codes the competitor whose fetch failed", async () => {
      // This is the Risk #2 assertion. Before reason codes existed, the entry
      // below was a bare id and the interface told the user the channel was
      // "not found on YouTube" — a confident, wrong statement about a channel
      // that exists and merely 5xx'd.
      stubHealthyChain([CHANNEL_A, CHANNEL_B, CHANNEL_C], (path, params) => {
        if (path === "playlistItems" && params.get("playlistId") === `UU${CHANNEL_B.slice(2)}`) {
          return { status: 500, body: { error: { code: 500, message: "boom" } } };
        }
        return null;
      });

      const result = await fetchCompetitorVideos([CHANNEL_A, CHANNEL_B, CHANNEL_C], KEY, NOW);

      expect(result.channels.map((c) => c.channel_id)).toEqual([CHANNEL_A, CHANNEL_C]);
      expect(result.unresolved).toEqual([{ channel_id: CHANNEL_B, reason: "transport" }]);
    });

    it("reason-codes a competitor whose payload was malformed", async () => {
      stubHealthyChain([CHANNEL_A, CHANNEL_B], (path, params) => {
        if (path === "playlistItems" && params.get("playlistId") === `UU${CHANNEL_B.slice(2)}`) {
          return { body: { items: "not an array" } };
        }
        return null;
      });

      const result = await fetchCompetitorVideos([CHANNEL_A, CHANNEL_B], KEY, NOW);

      expect(result.channels.map((c) => c.channel_id)).toEqual([CHANNEL_A]);
      expect(result.unresolved).toEqual([{ channel_id: CHANNEL_B, reason: "malformed" }]);
    });
  });

  describe("competitors that never resolved", () => {
    it("marks an id absent from the channels response as not found", async () => {
      stubHealthyChain([CHANNEL_A]);

      const result = await fetchCompetitorVideos([CHANNEL_A, CHANNEL_B], KEY, NOW);

      expect(result.unresolved).toEqual([{ channel_id: CHANNEL_B, reason: "not_found" }]);
    });

    it("marks a channel with no uploads playlist as not found", async () => {
      // Resolvable but unusable: the uploads playlist is read from
      // `relatedPlaylists`, never derived by string-munging the channel id.
      stubFetch((path) => {
        if (path === "channels") return { body: { items: [{ id: CHANNEL_A, snippet: { title: "Channel A" } }] } };
        return { body: { items: [] } };
      });

      const result = await fetchCompetitorVideos([CHANNEL_A], KEY, NOW);

      expect(result.channels).toEqual([]);
      expect(result.unresolved).toEqual([{ channel_id: CHANNEL_A, reason: "not_found" }]);
    });

    it("returns empty without calling the API when given no usable ids", async () => {
      const fake = stubHealthyChain([]);

      const result = await fetchCompetitorVideos(["", "   "], KEY, NOW);

      expect(result).toEqual({ channels: [], unresolved: [] });
      expect(fake.calls()).toEqual([]);
    });

    it("de-duplicates and trims requested ids before spending any quota", async () => {
      // Quota economics are the reason this matters: every duplicate would be a
      // wasted unit against a 10,000/day bucket shared by the whole project.
      const fake = stubHealthyChain([CHANNEL_A]);

      const result = await fetchCompetitorVideos([CHANNEL_A, ` ${CHANNEL_A} `, CHANNEL_A], KEY, NOW);

      expect(result.channels).toHaveLength(1);
      expect(fake.calls().filter((path) => path === "channels")).toHaveLength(1);
    });
  });

  /**
   * The selection rules themselves are proved in `video-selection.test.ts`;
   * this proves `youtube.ts` is actually wired to them. Until now no fixture in
   * this file ever emitted a `nextPageToken`, so `MAX_PAGES` never ran more
   * than one iteration and the cap, the dedupe and the Shorts drop had never
   * executed under test at all.
   */
  describe("selection through the real chain", () => {
    /** A `playlistItems` entry with an explicit publish time. */
    function entry(videoId: string, days = 30) {
      return { contentDetails: { videoId, videoPublishedAt: daysBefore(days) } };
    }

    /** A `videos.list` record with an explicit duration. */
    function record(videoId: string) {
      return {
        id: videoId,
        snippet: {
          title: `Video ${videoId}`,
          channelId: CHANNEL_A,
          channelTitle: "Channel A",
          publishedAt: daysBefore(30),
        },
        statistics: { viewCount: "1000" },
        contentDetails: { duration: videoId === "short-1" ? "PT30S" : "PT10M" },
      };
    }

    it("pages, de-duplicates across the page boundary, drops stale and short entries, and caps the sample", async () => {
      // Five more uploads than the cap allows, so the cap is what truncates.
      const unique = Array.from({ length: TARGET_LONGFORM_PER_CHANNEL + 5 }, (_, i) => `v${i}`);
      const firstPageCount = TARGET_LONGFORM_PER_CHANNEL - 5;
      const boundary = unique[firstPageCount - 1];

      const pageOne = unique.slice(0, firstPageCount).map((id) => entry(id));
      const pageTwo = [
        // The last id of page one, returned again: a concurrent upload shifts
        // the playlist between calls. It used to be collected twice and
        // double-counted in both the median and `sample_size`.
        entry(boundary),
        // Both of these sit inside the cap's reach, which is the point — a
        // skipped entry must not consume a slot.
        entry("short-1"),
        entry("stale-1", MAX_WINDOW_DAYS + 1),
        ...unique.slice(firstPageCount).map((id) => entry(id)),
      ];

      const fake = stubFetch((path, params) => {
        if (path === "channels") return { body: channelsPayload([CHANNEL_A]) };
        if (path === "playlistItems") {
          return params.get("pageToken") === null
            ? { body: { items: pageOne, nextPageToken: "page-2" } }
            : { body: { items: pageTwo } };
        }
        return { body: { items: (params.get("id") ?? "").split(",").map(record) } };
      });

      const result = await fetchCompetitorVideos([CHANNEL_A], KEY, NOW);

      expect(fake.calls().filter((path) => path === "playlistItems")).toHaveLength(2);

      const ids = result.channels[0].videos.map((video) => video.video_id);
      // Exactly the cap: a slot consumed by the Short or by the duplicate would
      // leave this one or two short.
      expect(ids).toHaveLength(TARGET_LONGFORM_PER_CHANNEL);
      // Playlist order is newest first, so the cap keeps the leading run.
      expect(ids).toEqual(unique.slice(0, TARGET_LONGFORM_PER_CHANNEL));
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).not.toContain("short-1");
      expect(ids).not.toContain("stale-1");
    });

    it("skips a stale entry mid-playlist without truncating the rest of the page", async () => {
      // A non-monotonic playlist: one old upload sits between two fresh ones.
      // The walk used to `break` here and lose everything behind it.
      const items = [entry("fresh-1", 10), entry("misplaced", MAX_WINDOW_DAYS + 30), entry("fresh-2", 20)];

      stubFetch((path, params) => {
        if (path === "channels") return { body: channelsPayload([CHANNEL_A]) };
        if (path === "playlistItems") return { body: { items } };
        return { body: { items: (params.get("id") ?? "").split(",").map(record) } };
      });

      const result = await fetchCompetitorVideos([CHANNEL_A], KEY, NOW);

      expect(result.channels[0].videos.map((video) => video.video_id)).toEqual(["fresh-1", "fresh-2"]);
    });
  });
});
