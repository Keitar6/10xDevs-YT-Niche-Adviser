/**
 * The two external boundaries, served locally, so a browser-level run is
 * deterministic and spends nothing.
 *
 * Internal boundaries stay real in this suite — Supabase auth, the cookie
 * session, the middleware, the SSR route, the database, the React island. Only
 * YouTube and Anthropic are faked, because they are the two that cost money,
 * consume a shared daily quota, and answer differently every day. That split is
 * the point: a test that also mocked auth and the database would prove nothing
 * about the integration it exists to cover.
 *
 * Both boundaries share one port. They cannot collide: the Anthropic SDK posts
 * to `/v1/messages`, and `YOUTUBE_API_BASE` carries a `/youtube/v3` prefix.
 *
 * **Fake the transport, never the parsing.** This process speaks real HTTP and
 * returns real bodies, so `getJson`'s status classification, both zod schemas,
 * the paging, and the Anthropic SDK's own decoder all stay in the exercised
 * path. That is the same rule `test-plan.md` §6.2 sets for the integration
 * suite, applied one layer up.
 *
 * Stateless by construction — no mode flag, no per-test toggle, nothing a
 * previous request can leave behind. Shared mutable state here would make
 * parallel specs flaky in exactly the way the E2E rules forbid.
 */
import { createServer } from "node:http";
import {
  LONGFORM_DURATION,
  STUB_CHANNELS,
  TRUNCATED_JUSTIFICATIONS,
  uploadsPlaylistId,
  videosFor,
} from "./fixture.mjs";

const PORT = Number(process.env.STUB_PORT ?? 9999);

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    // Load-bearing for the Anthropic leg: the SDK decides between JSON and text
    // on this header alone, and without it the body arrives as a string and the
    // failure becomes confusing rather than informative (§6.2, hazard 3).
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

/**
 * The justification answer: HTTP 200, correct envelope, truncated body.
 *
 * This shape is chosen to hit Risk #1 where the missing-credential path
 * cannot reach. An absent key short-circuits *before* the call; this fails
 * *after* it, inside `messages.parse()`, which runs the zod parse over the
 * text block and throws `AnthropicError` on a body that stops mid-token.
 * `justify.ts` catches that as a degradation and the run continues without
 * justifications — precisely the behaviour the browser test pins.
 *
 * `stop_reason: "max_tokens"` is what a real truncation carries, so the
 * envelope tells the same story as the body.
 */
function anthropicMessages(res) {
  sendJson(res, 200, {
    id: "msg_e2e_stub",
    type: "message",
    role: "assistant",
    model: "claude-opus-5",
    content: [{ type: "text", text: TRUNCATED_JUSTIFICATIONS }],
    stop_reason: "max_tokens",
    stop_sequence: null,
    usage: { input_tokens: 128, output_tokens: 16 },
  });
}

/** `channels.list` — one call for the whole run, batched on a comma-joined `id`. */
function youtubeChannels(res, url) {
  const requested = new Set((url.searchParams.get("id") ?? "").split(",").filter(Boolean));

  sendJson(res, 200, {
    items: STUB_CHANNELS.filter((channel) => requested.has(channel.id)).map((channel) => ({
      id: channel.id,
      snippet: { title: channel.title, customUrl: channel.handle },
      contentDetails: { relatedPlaylists: { uploads: uploadsPlaylistId(channel) } },
    })),
  });
}

/**
 * `playlistItems.list` — a single page, newest first.
 *
 * No `nextPageToken`, so the walk stops after one page rather than running to
 * `MAX_PAGES`. The five videos are dated from the request's own clock, which
 * keeps the fixture permanently inside the staleness window without anyone
 * having to re-date it.
 */
function youtubePlaylistItems(res, url, now) {
  const playlistId = url.searchParams.get("playlistId");
  const channel = STUB_CHANNELS.find((c) => uploadsPlaylistId(c) === playlistId);

  if (!channel) {
    sendJson(res, 200, { items: [] });
    return;
  }

  sendJson(res, 200, {
    items: videosFor(channel, now).map((video) => ({
      snippet: { publishedAt: video.publishedAt, resourceId: { videoId: video.id } },
      contentDetails: { videoId: video.id, videoPublishedAt: video.publishedAt },
    })),
  });
}

/**
 * `videos.list` — hydrates candidate ids, 50 per call.
 *
 * `viewCount` goes out as a *string*, as the real API emits it. That is not
 * cosmetic: `z.coerce.number()` in `youtube.ts` exists for this, and sending a
 * number here would quietly stop exercising the coercion the production path
 * depends on.
 */
function youtubeVideos(res, url, now) {
  const requested = new Set((url.searchParams.get("id") ?? "").split(",").filter(Boolean));

  const items = STUB_CHANNELS.flatMap((channel) =>
    videosFor(channel, now)
      .filter((video) => requested.has(video.id))
      .map((video) => ({
        id: video.id,
        snippet: {
          title: video.title,
          channelId: channel.id,
          channelTitle: channel.title,
          publishedAt: video.publishedAt,
        },
        statistics: { viewCount: String(video.viewCount) },
        contentDetails: { duration: LONGFORM_DURATION },
      })),
  );

  sendJson(res, 200, { items });
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  if (url.pathname !== "/__health") {
    // Playwright folds this into the `[WebServer]` stream. It is the only way to
    // tell "the app called the stub and got no match" apart from "the app never
    // called the stub at all" — two failures that produce an identical empty
    // ranking in the browser.
    console.log(`[stub] ${req.method} ${url.pathname}${url.search}`);
  }
  // One clock per request, for the same reason the route keeps one per run: the
  // staleness cutoff and the recency cutoff must not straddle a boundary.
  const now = new Date();

  switch (url.pathname) {
    case "/__health":
      sendJson(res, 200, { ok: true });
      return;
    case "/v1/messages":
      anthropicMessages(res);
      return;
    case "/youtube/v3/channels":
      youtubeChannels(res, url);
      return;
    case "/youtube/v3/playlistItems":
      youtubePlaylistItems(res, url, now);
      return;
    case "/youtube/v3/videos":
      youtubeVideos(res, url, now);
      return;
    default:
      // Loud rather than empty: an unrecognised path means the app called
      // something this stub does not model, and a 200 with no items would hide
      // that behind a plausible-looking empty ranking.
      sendJson(res, 404, { error: { code: 404, message: `stub has no route for ${url.pathname}` } });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`upstream stub listening on http://127.0.0.1:${PORT}`);
});
