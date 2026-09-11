---
date: 2026-09-11T20:12:15+02:00
researcher: Mateusz
git_commit: fc3c57d5639093b12db6723bfcde412311cd4adb
branch: master
repository: YT-Niche-Adviser
topic: "External library research for S-02 (analyze-and-rank-opportunities): YouTube data access, LLM SDK, statistics, and edge-runtime compatibility"
tags: [research, external, exa, s-02, youtube-data-api, cloudflare-workers, anthropic-sdk, statistics, outlier-score]
status: complete
research_type: external
last_updated: 2026-09-11
last_updated_by: Mateusz
---

# Research: Library options for S-02, compatible with the locked tech stack

**Date**: 2026-09-11T20:12:15+02:00
**Researcher**: Mateusz
**Git Commit**: `fc3c57d`
**Branch**: master
**Repository**: YT-Niche-Adviser

## Research Question

Which libraries are available to implement roadmap slice **S-02** (`analyze-and-rank-opportunities` — user clicks "Analyze" and sees a ranking of >=3 content opportunities with `outlier_score` and a one-sentence justification), and which are compatible with the stack locked in `context/foundation/tech-stack.md`?

Two sweeps were run:

1. **Sweep 1** — the three capabilities the slice obviously needs: a YouTube Data API client, an LLM SDK, and the runtime constraints of Astro SSR on Cloudflare Workers.
2. **Sweep 2** — the wider surface: unofficial YouTube libraries, TypeScript typings, duration parsing, statistics libraries, concurrency/retry utilities, and outlier-scoring methodology.

**Method**: external research only (exa.ai web search), cross-checked against the repo's actual configuration (`package.json`, `wrangler.jsonc`, `astro.config.mjs`). This document does **not** contain internal codebase research — that is `/10x-research`'s job and has not been run for this change.

## Summary

**Net recommendation: one new runtime dependency.**

| Capability | Decision |
|---|---|
| YouTube Data API v3 access | Plain `fetch()` + `zod` schemas — **no library** |
| LLM justification (FR-008) | **`@anthropic-ai/sdk`** — the only new dependency |
| Outlier scoring maths | Hand-rolled — **no library** |
| ISO-8601 duration parsing (Shorts filter) | Regex, or `iso8601-duration` (<1 KB) — optional |
| Concurrency / retry | Native `Promise.all` + `scheduler.wait()` — **no library** |

Three findings materially affect the plan and are expanded in [Architecture Insights](#architecture-insights):

1. **Quota**: using `search.list` instead of the uploads-playlist pattern would cost **100x more quota** and cap the product at ~20 analyses/day. This resolves an Unknown recorded on S-02.
2. **Baseline formula**: the PRD/roadmap define `outlier_score` against the channel **mean**. Robust-statistics literature and the entire YouTube-analytics tooling ecosystem converge on the **median**. Using the mean systematically under-detects exactly what the product exists to find.
3. **Runtime**: Cloudflare Workers place **no wall-clock limit** on HTTP-triggered requests, which de-risks the PRD's latency NFR. The binding constraint is CPU time (10 ms on the free plan), not duration.

## Detailed Findings

### YouTube Data API v3 — official client libraries

| Option | Verdict | Evidence |
|---|---|---|
| `googleapis` / `@googleapis/youtube` | **Rejected** | Pulls `googleapis-common`, which does `require("http2")`. workerd does not provide `http2` even with `nodejs_compat`. Cloudflare closed [workers-sdk#4253](https://github.com/cloudflare/workers-sdk/issues/4253) with *"I'd recommend making direct fetch calls to the relevant Google APIs for now"*. Google closed [google-api-nodejs-client#3453](https://github.com/googleapis/google-api-nodejs-client/issues/3453) with *"we are not planning on adding support for additional runtimes for this library in the future."* |
| `googleapis` + `gtoken` fork override | **Rejected** | A [documented workaround](https://medium.com/@bjornbeishline/using-googleapis-with-cloudflare-workers-33b9b6de26c4) exists but requires an npm `overrides` entry pinned to a personal GitHub fork of `gtoken`, and only solves service-account signing. Unacceptable supply-chain risk for a 3-week MVP. |
| `google-api-fetch` | **Not applicable** | Genuinely edge-native and zero-dependency, but implements only Drive/Docs/Sheets. No YouTube surface. |
| **Plain `fetch()` + `zod`** | **Recommended** | Both maintainer camps point here. Three GET endpoints, all authenticated with a bare API key (competitor data is public — no OAuth needed). `zod@^4.4.3` is already a dependency and CLAUDE.md already mandates zod for API route validation. |

### YouTube Data API v3 — quota economics

Default allocation is **10,000 units/day per Google Cloud project** (not per key), resetting at midnight Pacific. There is no paid tier — quota increases are a free request form that can take weeks.

| Method | Units | Role in S-02 |
|---|---|---|
| `search.list` | **100** | Never use |
| `channels.list` | 1 | Once per competitor -> `contentDetails.relatedPlaylists.uploads` |
| `playlistItems.list` | 1 | Uploads playlist, 50 items/page, reverse-chronological by `contentDetails.videoPublishedAt` |
| `videos.list` | 1 | Batches **up to 50 video IDs per call** for `statistics` + `contentDetails` |

Notes that affect implementation:

- Requesting `part=snippet,statistics,contentDetails` costs the same 1 unit as requesting one part. Never split parts across calls.
- Invalid requests still burn at least 1 unit.
- Each pagination page costs the full method cost.
- The uploads playlist ID is the channel ID with `UC` swapped for `UU`, but read it from `contentDetails.relatedPlaylists.uploads` rather than string-munging.

**Cost per analysis run (5 competitors): ~3 units each = ~15 units -> roughly 650 runs/day.** Via `search.list` the same run would cost ~500 units -> 20 runs/day.

### Unofficial YouTube libraries (scrapers / InnerTube)

| Library | Verdict | Evidence |
|---|---|---|
| `youtubei.js` (YouTube.js) | **Rejected** | Client for YouTube's private InnerTube API; v18, ~121 dependents, actively maintained, and its `getChannel(id).getVideos()` / `.getShorts()` would natively separate long-form from Shorts. But it is reverse-engineered (breaks on YouTube payload changes), ToS-grey for a shipped product, and depends on `jintr` (a JS interpreter) for signature decoding — exactly the category workerd blocks. |
| `youtubei` (SuspiciousLookingOwl) | Rejected | Same InnerTube approach, Node >= 16, smaller project. |
| `ytdl-core`, `@distube/ytdl-core`, `cloud-ytdl` | Not applicable | Media downloaders. `cloud-ytdl` requires Node 18+ and `undici`. |
| `@vreden/youtube_scraper` | Rejected | 322K weekly downloads but proxies through `api.vreden.my.id` — routes our traffic through an unknown third party. |
| `scrapetube`, `yt-dlp`, `youtube-transcript-api`, NewPipe Extractor | Out of ecosystem | Python / Java. |

**The decisive datapoint**: Scrapfly's 2026 open-source scraper survey found `scrapetube`'s `get_channel` **silently returns zero rows** (a `lockupViewModel` change broke it; fix PRs open since May 2026) — *"No exception fires. The generator yields nothing, which is the worst failure shape for a data pipeline."* For a product whose entire output is a ranked list, silent emptiness is the worst possible failure mode.

### TypeScript typings for the Data API

| Package | Assessment |
|---|---|
| `@maxim_mazurok/gapi.client.youtube-v3` | Auto-generated from Google's discovery service and auto-updated. But it declares a **global `gapi.client.youtube` namespace**, not importable interfaces — designed for the browser `gapi` runtime and depends on `@types/gapi.client`. Also needs an explicit `tsconfig.compilerOptions.types` entry since TypeScript 6 changed the `types` default from auto-include to `[]`. |
| `@types/gapi.client.youtube` | Thin DefinitelyTyped shim that re-points at the package above. Last substantive publish 2017. |

**Recommendation: neither — write zod schemas.** Roughly three response shapes and eight fields are needed. `z.infer` yields the TypeScript type *and* runtime validation of an external API from one declaration; the gapi typings are compile-time only, and an API response is untrusted input.

### ISO-8601 duration parsing (FR-007 Shorts exclusion)

`videos.list` `part=contentDetails` returns `duration` as an ISO-8601 string (e.g. `PT4M13S`).

| Option | Size | Notes |
|---|---|---|
| `tinyduration` | **<1 KB** min+gzip | `parse()` / `serialize()` only, TypeScript-native, throws `InvalidDurationError`. Returns components; summing to seconds is on us. |
| `iso8601-duration` | small | Ships `toSeconds()`, `parse()`, and an exported `pattern` regex. Handles fractional seconds (`PT1H30M10.5S` -> `5410.5`) and ISO 8601-2 weeks. Better fit — it does the seconds conversion. |
| Luxon / dayjs duration plugin | large | Only justified if a date library were already needed. It is not. |

A short regex covers YouTube's actual output (it never emits years/months/weeks for a video). Either choice is defensible: the regex is one fewer dependency, the library is one fewer edge case.

### Statistics libraries

| Library | Tree-shakeable | Relevant coverage | Verdict |
|---|---|---|---|
| `simple-statistics` | Yes — named ESM exports only, **zero dependencies**, ISC | `mean`, `median`, `standardDeviation`, `zScore`, `quantile`, `medianAbsoluteDeviation` | Best option *if* a library is used. Its own benchmarks show ~20-30x faster `median` and `medianAbsoluteDeviation` than mathjs/jStat. |
| `d3-array` | Yes — ESM, modular | `mean`, `median`, `variance`, `deviation`, `quantile`; ignores `undefined`/`NaN` | Acceptable, but no MAD. |
| `mathjs` | With care | Everything, plus expression parser | **Rejected.** 9.43 MB unpacked; ~30% is Complex/BigNumber/Fraction/Unit/Matrix classes, ~25% is the expression parser. |
| `jstat` | No — single-object import | Full distributions, hypothesis tests | Rejected — 706 kB shipped for `median()`. |
| `@stdlib/stats` | Yes — per-function packages | Exhaustive (t-tests, KS-tests, LOWESS) | Overkill; granularity means many tiny deps. |

**Recommendation: zero dependencies.** `median` is a sort plus a middle pick; MAD is the median of absolute deviations from the median. That is ~10 lines that need unit tests regardless, because *this arithmetic is the product's core hypothesis*. Owning it means tuning it without fighting a library API. If hand-rolling is rejected, `simple-statistics` is the only acceptable substitute.

### Concurrency, retry, and rate limiting

Binding constraint: Cloudflare allows **6 simultaneous outgoing connections per request** on both free and paid plans. With 3-5 competitors a plain `Promise.all` stays under it; a per-video fan-out would not.

| Option | Assessment |
|---|---|
| `p-limit` | Pure JS, no Node built-ins, edge-safe. Supports runtime-mutable `limit.concurrency`, the documented pattern for backing off on 429s. Only worth adding if concurrent fetches exceed 6. |
| `ky` | ~4 KB, fetch-based (Workers-native), built-in retry with exponential backoff, timeout, and `beforeRetry` / `beforeError` hooks. Reasonable but not required. |
| **Native `scheduler.wait(ms)`** | **Recommended.** Workers ships an awaitable `setTimeout` equivalent, and Cloudflare's own docs provide a `fetchWithRetry` exponential-backoff-with-jitter recipe using it. Caveat: deployed timers do not advance during CPU execution (a Spectre mitigation) — fine for I/O waits, unsuitable for precise timing. |
| Cloudflare Rate Limiting binding | Optional. `env.LIMITER.limit({key})` keyed on user ID would protect the YouTube quota from one user hammering "Analyze". Note limits are enforced **per Cloudflare location**, not globally. |

### LLM SDK for the FR-008 justification

**`@anthropic-ai/sdk`** — Cloudflare Workers is on the officially supported runtime list in both the SDK README and the Claude platform docs (alongside Node 20+, Deno, Bun, Vercel Edge, Nitro).

Evidence hygiene on the scary-looking search results:

- The edge streaming bug (`Unexpected end of JSON input`) was a `LineDecoder` newline-handling defect, **fixed in v0.17.0** (2024).
- The unresolved edge-incompatibility reports ([#460](https://github.com/anthropics/anthropic-sdk-typescript/issues/460), [#508](https://github.com/anthropics/anthropic-sdk-typescript/issues/508)) are against **`@anthropic-ai/vertex-sdk`**, which pulls `google-auth-library` -> `jws` -> `node:stream`. **Use the plain `Anthropic()` client, not the Vertex one**, and none of it applies.

API notes for the current model generation (per the bundled `claude-api` skill):

- Default to `claude-opus-5`. Thinking is on by default (adaptive); `budget_tokens` returns 400.
- **Assistant prefill returns 400.** To get structured JSON back, use `output_config: { format: {...} }` — not prefill, not prompt-only coaxing.
- Errors: catch the typed chain (`RateLimitError` -> `APIStatusError` -> `APIConnectionError`), not one broad class.

Alternatives considered: **Workers AI** (`env.AI`) avoids the dependency but is weaker at Polish-language generation; **Vercel AI SDK** adds an abstraction layer unnecessary for a single non-streaming call.

### Cloudflare Workers runtime limits

| Limit | Free | Paid |
|---|---|---|
| CPU time per HTTP request | **10 ms** | 5 min (default 30 s, via `limits.cpu_ms`) |
| Subrequests per invocation | 50 | 10,000 (up to 10M via `limits.subrequests`) |
| Simultaneous outgoing connections | 6 | 6 |
| **Wall-clock duration (HTTP trigger)** | **Unlimited** | **Unlimited** |
| Memory | 128 MB | 128 MB |

Wall-clock time is unbounded as long as the client stays connected; `ctx.waitUntil()` extends work up to 30 s past the response. **CPU time excludes time awaiting `fetch()`.** So a multi-second analysis is architecturally fine — only JSON parsing of ~250 video records counts against CPU.

## Code References

- `package.json` — `zod@^4.4.3` already present; no LLM or YouTube dependency yet
- `wrangler.jsonc:5-6` — `compatibility_date: "2026-05-08"`, `compatibility_flags: ["nodejs_compat"]` (already sufficient for `@anthropic-ai/sdk`; no config change needed)
- `astro.config.mjs:19-24` — `env.schema` declares `SUPABASE_URL` / `SUPABASE_KEY` as `context: "server", access: "secret"`; `YOUTUBE_API_KEY` and `ANTHROPIC_API_KEY` should follow this exact pattern, plus `.dev.vars` for local Workers dev
- `context/foundation/roadmap.md:116-129` — S-02 definition, Unknowns, and risk note
- `context/foundation/roadmap.md:32` — the vision statement defining `outlier_score` against the channel **mean** (see the flagged conflict below)

## Architecture Insights

### 1. The quota pattern is a hard design constraint, not an optimisation

The correct call chain is fixed and should be written into the plan as a contract:

```
channels.list(part=contentDetails, id=<up to 50 competitor IDs>)   -> uploads playlist IDs
  -> playlistItems.list(playlistId=<uploads>, maxResults=50)       -> video IDs, newest first
  -> videos.list(part=snippet,statistics,contentDetails, id=<50 comma-separated IDs>)
```

`channels.list` and `videos.list` both batch up to 50 IDs per call, so a 5-competitor run can be as few as ~7 units if batched well. Any use of `search.list` in this slice should be treated as a defect.

### 2. `outlier_score` should divide by the median, not the mean — flagged for `/10x-plan`

`context/foundation/roadmap.md:32` defines the score as views relative to the channel **average** (*"wyswietlenia filmu wzgledem sredniej danego kanalu"*). Every independent source found argues for the **median**, and the argument is specific to this use case:

> A channel with 28 videos near 10K views, one at 200K and one at 80K, has a **mean near 19K but a median near 10K**. A genuinely strong new video at 15K reads as *under-performance* against the mean.

The mean has a breakdown point of 0 — one extreme value moves it arbitrarily far. The median's is 0.5. Since the product exists to analyse channels *for their outliers*, any competitor worth curating has already produced outliers that permanently inflate their mean. The metric as specified would systematically under-detect what it exists to find.

- **Statistical basis**: Leys et al., *"Detecting outliers: do not use standard deviation around the mean, use absolute deviation around the median"* (ULB) — recommends median +/- 2.5 x MAD, noting the MAD is *"totally immune to sample size"* and describing the mean/3-SD rule as *"fundamentally problematic: it is supposed to guide our outlier detection but, at the same time, the indicator itself is altered by the presence of outlying values."*
- **Ecosystem convergence**: vidIQ's Outlier Score and every analytics tool surveyed divide by channel median. One reference implementation explicitly falls back to the average only when the median is unavailable.

**This is a PRD-level definition and therefore the user's call, not a unilateral change.** It is a one-word change in the formula with a large effect on output quality, and far cheaper to decide before S-03 persists scores computed the other way.

### 3. Three companion rules for a trustworthy baseline

Cheap to implement, expensive to discover late:

1. **Minimum video age of 7-14 days.** Launch-week spikes produce apparent 4x outliers that settle to ~1.2x by day ten. Without this filter the top-ranked opportunity is frequently just a video published two days ago.
2. **Minimum sample of ~10-20 comparable videos** before a baseline is trustworthy; below that the median itself is volatile. Warrants an explicit "not enough data for this competitor" state rather than a garbage score.
3. **Separate baselines for Shorts and long-form.** Already implied by FR-007, but the ordering matters: Shorts must be filtered out *before* computing the baseline, not merely before ranking.

Threshold conventions useful for FR-008 justification copy: **>=2x** worth investigating, **>=3x** strong, **>=5x** validated demand, **>=10x** breakout. Typical channels produce a 2x+ outlier on roughly 5-10% of uploads.

### 4. Latency risk is lower than the roadmap assumes

S-02's risk note treats the multi-API integration as the highest-risk element. On the runtime axis it is safer than expected: HTTP-triggered Workers have **no wall-clock limit**, and awaiting `fetch()` does not consume CPU time. The real exposure is the **free plan's 10 ms CPU ceiling** against JSON parsing of ~250 video records, which would surface as intermittent Error 1102s rather than a clean failure.

## Historical Context (from prior changes)

- `context/changes/channel-profile-data-model/plan.md` — established the `channel_profiles` table with per-owner RLS and a `unique` constraint on `user_id` (one profile per user), `user_id default auth.uid()`. S-02 reads the competitor ID list from here.
- `context/changes/channel-profile-data-model/plan-brief.md` — notes *"No test runner exists anywhere in the repo."* This matters for S-02: the scoring function is the first piece of genuinely testable pure logic in the project, and the argument for hand-rolling the maths assumes it will be unit-tested. Establishing a test runner may need to be in scope.
- `context/changes/channel-profile-crud/plan.md` — established the `src/types.ts` -> generated `Database` type pattern and the typed Supabase client, plus the dashboard dialog UI pattern that the Analyze trigger will likely sit beside.

## Related Research

- No prior `research.md` exists under `context/changes/**` or `context/archive/**` — this is the first research artifact in the project.
- Internal research (`/10x-research analyze-and-rank-opportunities`) has **not** been run and remains the natural next step; it should cover the API-route conventions in `src/pages/api/`, the middleware/`locals.user` contract, and error-surface patterns for the FR-009 graceful-degradation requirement.

## Open Questions

1. **Mean vs median for `outlier_score`** — Owner: user. **Block: yes for `/10x-plan`.** A PRD-level definition change; see Architecture Insights #2. Everything downstream (S-03 persisted scores) depends on it.
2. **Which Cloudflare Workers plan is this project on?** — Owner: user. Block: no. Could not be determined from the repo. Free-plan 10 ms CPU is a genuine risk for parsing ~250 video records; paid removes the concern entirely.
3. **Time-window parameter** (how many days/months of uploads form the baseline) — Owner: user. Block: no. Pre-existing Unknown from `roadmap.md:126`. Research suggests a *count*-based window (last 20-50 comparable uploads) is more stable than a *date*-based one, since upload cadence varies per channel.
4. **Shorts duration threshold** — Owner: user. Block: no. `contentDetails.duration` gives an exact figure, but the Shorts cutoff is a heuristic (<=60s historically, <=3min for newer Shorts), not an API flag.
5. **Should responses be cached** (KV or similar) to conserve quota across repeat analyses? — Owner: user. Block: no. Not researched in depth; at ~650 runs/day the quota is unlikely to bind for an MVP, so this is probably post-MVP.
6. **Test runner** — Owner: user. Block: no. The recommendation to hand-roll the scoring maths presupposes unit tests; none exist in the repo yet.

## Sources

External research via exa.ai, 2026-09-11:

- Cloudflare Workers — [Limits](https://developers.cloudflare.com/workers/platform/limits/), [Pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Scheduler API](https://developers.cloudflare.com/workers/runtime-apis/scheduler/), [Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/), [subrequests changelog 2026-02-11](https://developers.cloudflare.com/changelog/post/2026-02-11-subrequests-limit/)
- Google — [YouTube Data API Quota Calculator](https://developers.google.com/youtube/v3/determine_quota_cost); [google-api-nodejs-client#3453](https://github.com/googleapis/google-api-nodejs-client/issues/3453); [cloudflare/workers-sdk#4253](https://github.com/cloudflare/workers-sdk/issues/4253)
- Anthropic — [TypeScript SDK runtime support](https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript); [anthropic-sdk-typescript#292](https://github.com/anthropics/anthropic-sdk-typescript/issues/292) (fixed v0.17.0), [#460](https://github.com/anthropics/anthropic-sdk-typescript/issues/460), [#508](https://github.com/anthropics/anthropic-sdk-typescript/issues/508) (both Vertex-specific)
- Libraries — [simple-statistics](https://github.com/simple-statistics/simple-statistics) + [benchmarks](https://github.com/simple-statistics/simple-statistics/tree/main/benchmarks); [mathjs custom bundling](https://mathjs.org/docs/custom_bundling.html); [d3-array summarize](https://d3js.org/d3-array/summarize); [tinyduration](https://github.com/MelleB/tinyduration); [iso8601-duration](https://github.com/tolu/iso8601-duration); [p-limit](https://github.com/sindresorhus/p-limit); [youtubei.js](https://github.com/LuanRT/YouTube.js)
- Scraper landscape — [Scrapfly, "The 6 Best Open-Source YouTube Scrapers (2026)"](https://scrapfly.io/blog/posts/best-open-source-youtube-scrapers)
- Outlier methodology — Leys et al., *"Detecting outliers: do not use standard deviation around the mean, use absolute deviation around the median"* (ULB); [Outlieo, "What is a YouTube outlier?"](https://outlieo.xyz/learn/what-is-a-youtube-outlier); [OverseerOS, "YouTube Outlier Benchmark Report 2026"](https://www.overseeros.com/blog/youtube-outlier-benchmark-report)
