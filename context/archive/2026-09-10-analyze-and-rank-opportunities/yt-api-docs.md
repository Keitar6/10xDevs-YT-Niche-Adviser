---
date: 2026-09-11T21:05:00+02:00
researcher: Mateusz
git_commit: fc3c57d5639093b12db6723bfcde412311cd4adb
branch: master
repository: YT-Niche-Adviser
topic: "YouTube Data API v3 reference for S-02 (analyze-and-rank-opportunities): call chain, response contract, auth, and Shorts exclusion"
tags: [research, external, context7, s-02, youtube-data-api, api-contract, shorts, quota]
status: complete
research_type: external
last_updated: 2026-09-11
last_updated_by: Mateusz
---

# YouTube Data API v3 — reference contract for S-02

**Date**: 2026-09-11T21:05:00+02:00
**Researcher**: Mateusz
**Git Commit**: `fc3c57d`
**Branch**: master
**Repository**: YT-Niche-Adviser

**Source**: Context7 library `/websites/developers_google_youtube_v3` (3,015 snippets, Source Reputation: High, Benchmark 73.95) — an index of `developers.google.com/youtube/v3`. Queried via the `ctx7` CLI.

## Scope

This document records the **API contract** for roadmap slice S-02: exact endpoints, request parameters, and response shapes, sourced from Google's own documentation.

It deliberately does **not** cover library selection, runtime compatibility, or scoring methodology — those are in the companion document [`yt-library-research.md`](./yt-library-research.md), whose `fetch()` + `zod` recommendation this document assumes. Read that one for _what to build with_; read this one for _what the API actually returns_.

## Call chain

| #   | Request                                                                                          | Reads                                             | Notes                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1   | `GET /youtube/v3/channels?part=contentDetails&id=<id1,id2,...>`                                  | `contentDetails.relatedPlaylists.uploads`         | Accepts a comma-separated id list — all 3-5 competitors resolve in **one** call, not one per channel. |
| 2   | `GET /youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=<uploadsId>&maxResults=50` | video IDs                                         | Reverse-chronological. Page via `nextPageToken` until out of the window.                              |
| 3   | `GET /youtube/v3/videos?part=snippet,contentDetails,statistics&id=<up to 50 ids>`                | `statistics.viewCount`, `contentDetails.duration` | Batches 50 IDs per call.                                                                              |

Google's own revision history (2014-11-11) states the rationale for this chain over `search.list`: _"retrieving channel uploads via channels.list and playlistItems.list costs significantly less than using search.list."_ This corroborates the quota table in `yt-library-research.md`.

## Response contract

Verbatim from `developers.google.com/youtube/v3/getting-started`:

```json
"contentDetails": { "duration": "PT15M51S", "aspectRatio": "RATIO_16_9" },
"statistics":     { "viewCount": "3057", "likeCount": "25", "commentCount": "12" }
```

Details that affect the zod schemas:

- **`viewCount` is a JSON string, not a number.** The schema needs `z.coerce.number()` (or `z.string().regex(/^\d+$/).transform(Number)`) before any arithmetic. Feeding the raw value into a `mean`/`median` would concatenate rather than sum.
- `duration` is ISO-8601 (`PT15M51S` confirmed), matching the parsing options evaluated in `yt-library-research.md`.
- `statistics.dislikeCount` is private to the video owner and `favoriteCount` is deprecated (always `0`) — neither is usable, do not model them.
- A `part` the request did not ask for is **absent from the response object**, not `null`. Schemas must treat missing parts as absent keys.

## Auth: API key, no OAuth

Per `developers.google.com/youtube/v3/docs`: _"API keys are generally used for public data access"_, with OAuth 2.0 _"strictly required for any operations that modify user data or access private information."_

Competitor channels are public and the analysis never acts on behalf of the user, so S-02 needs only a server-side key. This is **unrelated to F-01's Google OAuth** — different credential, different purpose. Declare it as a server-only secret in `astro:env/server` alongside `SUPABASE_KEY`.

## Shorts: no API flag exists (negative result)

A direct query for a Shorts field or filter returned **`No documentation matched this query`** against a 3,015-snippet index of the official docs. There is no `isShort` property and no Shorts filter parameter on any endpoint.

Two consequences for FR-007:

1. **The uploads playlist is unfiltered.** Shorts and long-form are interleaved, and `playlistItems.list` carries no duration. Shorts are only identifiable after step 3, so the pipeline **pays quota for Shorts it then discards**. "Fetch 50 uploads" does not mean "50 long-form videos."
2. **Exclusion must be airtight because Shorts views are inflated.** The docs flag that as of **2025-03-31**, Shorts view counts are calculated from start/replay events with _no minimum watch time_. A Short that leaks past the filter inflates the channel-average denominator in FR-008 and suppresses every genuine outlier on that channel.

## Quota accounting for `search.list`: two models in the docs

The index returned both _"a quota cost of 1 unit ... subject to a limit of 100 calls per day"_ (the newer dedicated _Search Queries_ quota bucket) and the 2014 revision-history figure of _100 units_. The two differ in mechanism but converge on the same ceiling — **~20 analysis runs/day at 5 competitors** — matching the figure in `yt-library-research.md`.

**For `/10x-plan`: state the cap, not a unit number.** Quoting "100 units" risks pinning a stale accounting model. The operative rule is unchanged: `search.list` is banned from the analysis path.

## Open Questions

Numbered to continue `yt-library-research.md`, which ends at Q6.

7. **Minimum long-form sample size per competitor channel** — Owner: user. Block: no (a default can be set in `/10x-plan`). A channel with only 2-3 long-form uploads inside the window yields an average over n=2-3; every video then scores ~1.0 and the ranking is noise, not signal. Decide a floor (skip the channel, widen its window, or flag the result as low-confidence) rather than emitting an undefendable `outlier_score`. Interacts with Q3 (time window) and Q1 (mean vs median — a median over n=2 is especially degenerate).
8. **Paging depth policy for Shorts-heavy channels** — Owner: user. Block: no. Because Shorts are only identifiable after `videos.list`, a channel posting mostly Shorts returns few long-form videos per page. Decide whether paging stops at the window boundary (variable sample size per channel) or continues until a target count of long-form videos is reached (variable quota cost per channel).

## Related Research

- [`yt-library-research.md`](./yt-library-research.md) — library selection, quota economics, Cloudflare Workers runtime limits, outlier-scoring methodology. Open Questions 1-6 live there.
- Internal research (`/10x-research analyze-and-rank-opportunities`) has **not** been run.

## Sources

- [Getting started](https://developers.google.com/youtube/v3/getting-started) — response shapes
- [Videos resource](https://developers.google.com/youtube/v3/docs/videos) — `statistics`, `contentDetails`, Shorts view-counting change
- [Videos: list](https://developers.google.com/youtube/v3/docs/videos/list) — parameters
- [Implementation guide: videos](https://developers.google.com/youtube/v3/guides/implementation/videos) — uploads-playlist chain
- [PlaylistItems resource](https://developers.google.com/youtube/v3/docs/playlistItems)
- [Determine quota cost](https://developers.google.com/youtube/v3/determine_quota_cost)
- [Revision history](https://developers.google.com/youtube/v3/revision_history) — 2014-11-11, `search.list` avoidance
- [API overview](https://developers.google.com/youtube/v3/docs) — API key vs OAuth
- [Sample requests](https://developers.google.com/youtube/v3/sample_requests) — public-data access with an API key
