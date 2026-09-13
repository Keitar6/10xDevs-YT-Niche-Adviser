---
change_id: analyze-and-rank-opportunities
title: Analyze and rank opportunities
status: archived
created: 2026-09-10
updated: 2026-09-13
archived_at: 2026-09-13T17:34:01Z
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

### Deviation from plan — Phase 1, item #6 (competitor ID validation)

**Planned:** reject anything that is not a raw `UC…` channel ID, with a message
stating that handles and URLs are not accepted.

**Implemented:** accept `@handle`, a raw `UC…` ID, or a channel URL, and resolve
each to a canonical `UC…` ID at **profile-save time**, storing the ID.

**Why.** Measured against the live API: `id=` accepts a comma-joined batch (1
unit for the whole set) but `forHandle` takes exactly one handle per call — and
`forHandle=a,b,c` returns an empty `items` array *with no error*, the same
silent-emptiness shape `yt-library-research.md` rejected `scrapetube` over.
Resolving at save keeps `/api/analyze` on its contracted single batched call,
costs ≤5 units on a rare operation, and is strictly safer than a regex: a regex
only checks shape, so `UCzzzzzzzzzzzzzzzzzzzzzz` passes it and fails silently
later, whereas resolution rejects a nonexistent channel at save time. Handles
can also be renamed by their owner, so storing the resolved ID is the stable
choice.

**Cost accepted:** `/api/profile` now depends on the YouTube API. With no key it
degrades to accepting well-formed `UC…` IDs only, so profile editing keeps
working. Quota errors surface as 429, upstream failures as 502.

**Landed:** `src/lib/services/youtube-ids.ts` (pure parsing, client-safe),
`src/lib/services/youtube.ts` (resolution + error classification; Phase 3
extends this file), `src/pages/api/profile.ts`, `ChannelProfileForm.tsx`,
`src/lib/services/youtube-ids.test.ts`.

Progress row 1.6 should be read as "garbage input is rejected with a format
message" — handles and URLs are now accepted by design.

### Deviation from plan — Phase 1, schema (`competitors jsonb`)

**Planned:** "No schema changes. `channel_profiles` is read as-is."

**Implemented:** migration `20260912190947_competitors_as_objects.sql` replaces
`competitor_channel_ids text[]` with `competitors jsonb`, holding one object per
competitor: `{ id, handle, title }`.

**Why.** Storing only the resolved `UC…` id meant the profile form showed a raw
id back to someone who typed `@mkbhd` — strictly worse than what they entered,
and unrecoverable after a page reload since the id was all the row held. The id
must stay the stored key (handles are renameable; only ids batch into a single
`channels.list` call), so the display labels have to live beside it. One object
per competitor was chosen over two parallel arrays because parallel arrays are
free to drift apart in length or order.

`handle` and `title` are nullable: not every channel has claimed a handle, rows
backfilled by the migration have neither, and a save made while `YOUTUBE_API_KEY`
is unset stores ids with null labels. Readers fall back through
`handle → title → id` via `competitorLabel()`.

A row-level CHECK enforces the FR-003 3–5 bound; per-element shape stays in zod
at the API layer, since a CHECK constraint cannot contain a subquery. RLS is
untouched — all four policies are row-scoped on `user_id`.

**Safe to do now:** the local DB held 3 test rows and `linked_project` is null,
so there is no production data. Doing this after S-03 starts reading the column
would have been materially more expensive.

**Landed:** the migration, regenerated `src/lib/database.types.ts`,
`src/lib/services/channel-profile.ts` (new — competitor zod schema, row
narrowing, `competitorLabel`), `src/types.ts` (now re-exports from the owning
service module, per the plan's Phase 4 convention), `src/pages/api/profile.ts`,
`src/components/Topbar.astro`, `ChannelProfileForm.tsx`.

**Note for Phase 4:** the analyze route reads `profile.competitors.map(c => c.id)`,
not `competitor_channel_ids`, and already has channel titles available without
re-requesting them.

**Local DB was reset** to apply the migration, so local auth users and profiles
are gone — sign up again before manual testing.

### Phase 3 manual verification deferred to after Phase 4

Rows 3.5–3.8 are intentionally left `- [ ]` at the Phase 3 boundary. Phase 3
ships `fetchCompetitorVideos` with no caller — `/api/analyze` is Phase 4 and the
dashboard section is Phase 5 — so there is no UI through which to confirm them,
which is the reason given for deferring.

What was already demonstrated, via a live scratch run against the real API
(harness kept out of the repo, in the session scratchpad):

- **3.5** — MKBHD 20, Kurzgesagt 7, Veritasium 14, Fireship 20 long-form videos;
  every channel's minimum duration above 300s, so the Shorts filter held.
- **3.6** — Fireship alone: `channels -> playlistItems(first) ->
  playlistItems(next) -> videos(n=50)`. Paging stopped on `MAX_PAGES`, and the
  first `videos.list` came strictly after the last `playlistItems`.
- **3.7** — `UCzzzzzzzzzzzzzzzzzzzzzz` landed in `unresolved` without throwing.
- **3.8** — 10 calls (= 10 units, every call in this chain costs 1 regardless of
  `part` count) for 4 resolved + 1 bogus competitor. **Not yet confirmed against
  the Google Cloud console**, which is the half only the user can read.

Re-confirm all four through the UI once Phase 4/5 land.

### Deviation from plan — Phase 3, comment wording

Success criterion 3.4 greps `src/` for the forbidden search endpoint. The module
comment explaining *why* that endpoint is never used named it literally, which
made the criterion fail on its own documentation. The comment now says "the
search endpoint" so the grep stays a real check rather than one that permanently
trips.

### Deviation from plan — Phase 4, Anthropic error-chain order

**Planned:** "Errors are caught on the typed chain, most specific first —
`Anthropic.RateLimitError` → `Anthropic.APIError` → `Anthropic.APIConnectionError`."

**Implemented:** `RateLimitError` → `APIConnectionError` → `APIError`.

**Why.** In the TypeScript SDK `APIConnectionError extends APIError`
(`@anthropic-ai/sdk/core/error.d.ts:24`), so the order the plan lists leaves the
`APIConnectionError` branch unreachable — every transport failure, including the
20s timeout, would collapse into the generic `APIError` branch. The plan's stated
intent ("most specific first") is preserved; only the listed sequence was wrong.

### Deviation from plan — Phase 4, generated worker types are global

**Planned:** "Generate and commit the worker types (`wrangler types`)."

**Implemented:** as planned, plus two one-line fixes in pre-existing files.

**Why.** `wrangler types` emits ~15k lines of workerd runtime typings that
override DOM globals project-wide, including for browser-side React files. That
changes `Response.json()` from DOM's `Promise<any>` to workerd's generic
`json<T>()`, which made two existing `as` assertions redundant and so a lint
**error** under `no-unnecessary-type-assertion`:

- `src/pages/api/profile.ts:38` — dropped ` as typeof body`; `body`'s existing
  annotation still supplies the type, and the `try/catch` guard is untouched
  (the shape fixed in `677c648` is not reintroduced).
- `src/components/profile/ChannelProfileForm.tsx:76` — moved the type from an
  assertion to a variable annotation. Chosen over `res.json<T>()` because that
  form reads as workerd-specific in a file that runs in the browser.

`--include-runtime=false` was tried first and rejected: without runtime types the
`cloudflare:workers` module has no declaration, so `env` itself resolves to
`error`-typed and the binding access becomes three `no-unsafe-*` errors. The
adapter leaves no alternative — `createLocals` in
`@astrojs/cloudflare/dist/utils/cf-helpers.js` defines `locals.runtime.env` as a
getter that *throws*, pointing at the `cloudflare:workers` import. The generated
file is excluded from ESLint alongside `database.types.ts`.

### Deviation from plan — Phase 4, shared result types are interfaces, not zod

**Planned:** "Define the zod schemas as the source of truth in their owning
service module and re-export the `z.infer` types through `src/types.ts`."

**Implemented:** `justify.ts` owns its zod schema and `src/types.ts` re-exports
the inferred `Justification` type, per the convention. The `/api/analyze`
response DTOs (`AnalyzeResponse`, `AnalyzeSummary`, `AnalyzeOpportunity`,
`SkippedChannel`) are plain interfaces declared in `src/types.ts`.

**Why.** The server *constructs* that payload and never parses one, so a runtime
schema for it would validate nothing. Phase 5's island is the only consumer that
reads it as untrusted input, and it can add a parse schema when it needs one.

### Addition beyond plan — Phase 4, a fourth empty-ranking case

The plan enumerates three empty outcomes (zero resolved, all skipped, LLM
degraded). A fourth exists: every competitor scores, but every video in the
sample is still inside the `MIN_RANKABLE_AGE_DAYS` window, so `rankOpportunities`
returns nothing. Left unhandled this is exactly the unexplained-empty-screen the
PRD guardrail forbids, so it gets its own `empty_reason`. `summary.empty_reason`
is the single field Phase 5 renders for all four.

`/api/analyze` reads **no request body** — the run is defined entirely by the
caller's saved profile, so there is nothing to parse and nothing to guard.

### Phase 4 pre-verification (live, before the manual gate)

Run through the app's own endpoints against local Supabase and the live YouTube
and Anthropic APIs, with a throwaway account `p4-smoke@example.com` /
`Passw0rd!123` (still in the local DB — reuse it or sign up your own):

- **4.6** — unauthenticated POST returns `{"error":"You must be signed in"}` with
  HTTP 401 and `Content-Type: application/json`. Note that Astro's CSRF check
  rejects a POST with no `Origin` header first (403, plain text); a browser
  `fetch` always sends one, as `/api/profile` already relies on.
- **4.7** — calls 1–4 passed, call 5 onward returned 429 with
  "You can run at most 5 analyses per 60 seconds…". Confirms the `RATE_LIMITER`
  binding resolves through `import { env } from "cloudflare:workers"` under
  `astro dev`.
- **4.4** — a 3-competitor profile (@mkbhd, @kurzgesagt, @veritasium) returned
  **HTTP 200 in 10.15s** with 5 ranked opportunities, scores 1.41–1.78, and one
  grounded justification each. `@anthropic-ai/sdk` runs on workerd unmodified.
- No profile saved → 400 naming the profile as the missing prerequisite.

- **4.5** — two consecutive live runs returned **identical ordering**; scores
  moved only in the 4th decimal (`1.7796 → 1.7797`) from view-count growth. One
  row's score *fell* on +0 views, which is the median shifting under it — exactly
  the drift mechanism the plan describes, and why exact equality is a unit-test
  claim rather than a live one.
- **4.8** — with a fourth, bogus `UCzzzzzzzzzzzzzzzzzzzzzz` competitor inserted
  directly into `channel_profiles`, the run returned 200 with the full 5-row
  ranking, `resolved: 3`, `requested: 4`, and the bogus id named in
  `unresolved`. Removed afterwards; the profile is back to its three channels.
- **4.9** — with the key genuinely unset: 5 opportunities, every score intact,
  every `justification` null, `justifications_available: false`, and
  `justifications_error` naming the missing configuration. The dashboard banner
  reads "Anthropic API is not configured — analyses will run without
  justifications."
- **4.10** — HTTP 500, `Content-Type: application/json`,
  `{"error":"YouTube Data API is not configured, so an analysis cannot run"}`,
  plus the matching config banner. No crash, no HTML error page.

**4.8 cannot be exercised through the UI.** Since the Phase 1 deviation,
`/api/profile` resolves every competitor at save time and rejects a well-formed
but non-existent `UC…` id with a 400, so a bogus competitor can only reach
`channel_profiles` by direct DB insert (done here with the local service-role key
against the REST API, then reverted).

### Phase 4 finding — "unset a secret" means both `.env` *and* `.dev.vars`

Removing `ANTHROPIC_API_KEY` from `.dev.vars` alone does **not** unset it under
`astro dev`: the first 4.9 attempt still produced justifications and no banner,
because `.env` carries the same key and Astro's dev pipeline reads it too. The
plan's manual steps 7 and 8 ("Unset `ANTHROPIC_API_KEY`, restart") are therefore
incomplete as written — both files have to lose the line, or the test silently
passes while proving nothing. Worth folding into the manual protocol before
anyone repeats it.

### Note for Phase 5 — the LLM call *is* the latency

Measured at 3 competitors: **10.15s / 9.96s / 9.30s** with justifications, and
**1.22s** on the same profile with `ANTHROPIC_API_KEY` unset. The YouTube chain
plus scoring is ~1.2s; the single batched Anthropic call is the remaining ~9s,
already at the ~10s line the plan set for escalating to streamed NDJSON — and
that is at `effort: "low"` with `maxRetries: 0`. Measure a 5-competitor run
(row 5.12) before assuming the blocking POST holds; if it does not, the lever is
this call, not the YouTube paging.

### Deviation from plan — Phase 5, `next-themes` dropped from the generated Toaster

**Planned:** "`npx shadcn@latest add sonner`, then apply the fix recorded in
`channel-profile-crud/plan.md`: repoint the generated `cn` import at
`@/lib/utils` and remove the redundant `cn` npm package the CLI pulls in."

**Implemented:** as planned, plus removal of a *second* unwanted dependency the
CLI installs — `next-themes`.

**Why.** The generated `sonner.tsx` reads the active theme via `useTheme()` from
`next-themes`. This project has no theme provider and never puts `.dark` on the
document, so `useTheme` would return the `"system"` default and
`var(--popover)` would resolve to the **light** token — a white toast on the
cosmic dark page. The theme is pinned to `"dark"` and the toast palette given as
explicit values, which removes the dependency rather than shipping one that only
returns a wrong answer.

### Deviation from plan — Phase 5, the Toaster is `client:only`, not `client:load`

**Planned:** "Mount the `Toaster` once in the layout."

**Implemented:** mounted once in `src/layouts/Layout.astro`, but with
`client:only="react"`.

**Why.** Caught by a smoke run before the manual gate: with `client:load` every
page rendering `Layout` threw during SSR —

```
Invalid hook call … Cannot read properties of null (reading 'useState')
  at Toaster2 (node_modules/.vite/deps_ssr/sonner.js:929)
```

Vite pre-bundles `sonner` into `deps_ssr/sonner.js` against its own React copy,
distinct from the one `react-dom/server` uses, so the hook dispatcher is null on
the server. The alternative fix (forcing `sonner` through `ssr.noExternal` /
`optimizeDeps.exclude`) buys nothing: a toast container renders no server output
worth keeping, so skipping SSR is both the smaller change and the correct one.
`/auth/signin` and `/dashboard` both render clean afterwards.

### Deviation from plan — Phase 5, response shape guarded structurally, not with zod

**Planned (implied by `types.ts`):** "Phase 5's island is the only consumer that
reads it as untrusted input, and it can add a parse schema when it needs one."

**Implemented:** `isAnalyzeResponse` in `AnalyzePanel.tsx` — an
`Array.isArray(opportunities) && typeof summary === "object"` guard.

**Why.** zod would follow the island into the browser bundle for a check whose
only job is to catch "this is not our payload at all" (a proxy error page, a
crash before the route ran). Field-level trust comes from `/api/analyze`
constructing the body. The `.json()` call has its own `try/catch` so a non-JSON
failure body reads as a server error rather than a lost connection — impl-review
finding F2 from the previous slice, not repeated here.

### Addition beyond plan — Phase 5, row affordances

Each result row links its title to `youtube.com/watch?v=<id>` and shows compact
view count, publish date, and the channel median the score is relative to. The
plan's contract names rank, title, channel, score, and justification; these are
display details over data the DTO already carries, not new requests.

### Phase 5 pre-verification (live, before the manual gate)

All four automated criteria pass (`lint`, `build`, `vitest` 22/22, no `cn` in
`package.json`). Beyond those, run against local Supabase and the live APIs with
the `p4-smoke@example.com` account:

- `/dashboard` **server-renders** the panel (the "Content opportunities" heading
  is in the SSR HTML and the island is registered for hydration); dev log clean.
- One live `POST /api/analyze` returned **HTTP 200 in 13.4s** with 5
  opportunities, `justifications_available: true`, and row keys exactly matching
  what `OpportunityList` reads — the wire contract is confirmed end to end.

**Latency flag for row 5.12.** That 13.4s was **3** competitors, not 5, and
already exceeds the plan's ~10s escalation line (Phase 4 measured 9.3–10.2s on
the same profile). Consistent with the Phase 4 note that the single Anthropic
call is ~9s of it. Measure a real 5-competitor run in the browser before
deciding; if it holds above ~10s, the follow-up lever is that call, not the
YouTube paging.

The remaining rows (5.5–5.13) need a browser, key-unset restarts, and the
Workers Logs CPU reading — none reachable from here.

### Phase 5 manual verification — what was driven from the harness

The first browser pass reported "everything is good", but the dev-server log
showed a single `ready in` line and both key files still populated, so rows
requiring a **restart** (5.10), a **stopped server** (5.11), a **bogus
competitor** (5.8), a **5-competitor profile** (5.12) and a **deploy** (5.13)
could not have been exercised. The gap was closed here instead, against local
Supabase and the live YouTube and Anthropic APIs using `p4-smoke@example.com`.

**5.12 — p95 at 5 competitors: ~11.2s.** Four consecutive runs on a real
5-competitor profile (@mkbhd, @kurzgesagt, @veritasium, @fireship,
@linustechtips): **11.20 / 11.17 / 10.63 / 10.95s**; a later batch of six read
9.69–11.72s. This is **over the plan's ~10s escalation line**, so the follow-up
to stream progress (NDJSON) is now *triggered*, not hypothetical.

**The LLM call is confirmed as ~85% of the latency.** The same 5-competitor
profile with `ANTHROPIC_API_KEY` unset returned in **1.62s**. YouTube paging plus
scoring is ~1.6s; the single batched Anthropic call is the other ~9.4s. The lever
for the follow-up is that call — not the YouTube chain. This upgrades the Phase 4
note from a 3-competitor estimate to a measurement at the contracted cap.

**5.8** — with `UCzzzzzzzzzzzzzzzzzzzzzz` patched into the profile (5 entries, so
the 3–5 CHECK still holds): HTTP 200, full 5-row ranking, `resolved: 4`,
`requested: 5`, the bogus id named in `unresolved`. The panel's
`resolved < requested` branch renders "Resolved 4 of 5 competitor channels. Not
found on YouTube: UCzzzzzzzzzzzzzzzzzzzzzz." Profile restored afterwards.

**5.10** — with the key commented out in **both** `.env` and `.dev.vars` and the
server restarted: the config banner renders in the dashboard HTML, the ranking
returns all 5 rows with scores intact, every `justification` is null,
`justifications_available: false`, and `justifications_error` reads "Anthropic
API is not configured, so justifications were skipped." Keys restored from backup.

**5.9** — a fresh account with no profile: HTTP 400, `{"error":"Set up your
channel profile with competitor channels before running an analysis"}`. The panel
renders that through its inline-error branch. Throwaway account deleted.

**5.11** — the server was killed 4s into a live request. The client saw
`curl (52) Empty reply from server`, HTTP `000`, **no body**. That is a transport
rejection, not a partial 200 that could slip past `res.ok`, so it lands in
`AnalyzePanel`'s `catch` → `fail(CONNECTION_ERROR)` → inline error + toast, with
`finally` clearing `running`. Verified at the transport layer; the on-screen
render follows deterministically from that branch.

**5.7 — the rate limit is effectively unreachable by clicking.** Six *sequential*
runs all returned 200: at ~10s per run, six runs span ~64s and the oldest ages
out of the 60s window before the sixth fires. Tripping it took **8 concurrent**
requests, which then produced HTTP 429 and exactly "You can run at most 5 analyses
per 60 seconds. Wait 60 seconds and try again." The limiter works and the message
is right, but since the button is disabled in-flight, a single tab cannot trip it
— which is fine (the binding exists for the multi-tab/scripted abuse vector), but
it means the 429 toast will effectively never be seen in normal use.

**Phase 3 rollup.** Rows 3.5 and 3.7, deferred at the Phase 3 boundary for want of
a caller, are now closed through the real `/api/analyze` path: 3.5 by five
channels all clearing the sample floor with zero skips, 3.7 by the 5.8 run above.
They carry the Phase 5 sha because that is when they were confirmed.

**Still open, and not closable from here:**
- **3.6** — call ordering inside the paging loop is not observable from outside
  the process; it was demonstrated by the Phase 3 scratch harness.
- **3.8** — quota per run needs the Google Cloud console.
- **5.13** — CPU time per invocation needs Workers Logs after the smoke deploy
  (Migration Notes step 5). This is the row that matters most, since a 10ms
  overrun surfaces as an intermittent Error 1102 with no clean error.
