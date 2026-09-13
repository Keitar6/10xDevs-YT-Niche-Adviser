# Save and View Opportunities Implementation Plan

## Overview

S-03 closes the product's core loop. S-02 ends the moment a ranked list renders — the
user reads five scored opportunities and then has nowhere to put the one they picked.
This slice adds a `content_opportunities` table with per-owner RLS, a save/remove API,
and a dashboard composition where the ranking and the saved list share one client-side
saved set, so saving a row is visible in both places in the same render.

It implements FR-010 (save a chosen opportunity: topic, score, status) and FR-011
(browse saved opportunities), and it is the last must-have slice of milestone M-1.

## Current State Analysis

**S-02 pre-shaped this slice deliberately.** Two comments in the shipped code name it:

- `src/types.ts:18` — "S-03 persists a subset of it as `content_opportunities` rows."
- `src/lib/services/scoring.ts:10-12` — "the exported DTOs use snake_case because they
  cross the wire as the `/api/analyze` response and become `content_opportunities` rows
  in S-03."

So `AnalyzeOpportunity` (`src/types.ts:25-28`) already carries every field a saved row
needs, in the casing the row will use: `video_id`, `title`, `channel_id`,
`channel_title`, `published_at`, `view_count`, `outlier_score`, `channel_median`,
`sample_size`, `justification`.

**What exists:**

- `channel_profiles` (`supabase/migrations/20260909213911_create_channel_profiles.sql`)
  with four granular per-operation RLS policies row-scoped on `user_id`. The avatar
  migration (`20260913134159`) repeated the same four-policy shape on `storage.objects`.
  This is the pattern S-03's table copies; the roadmap names it as the mitigation for
  this slice's only stated risk.
- `src/lib/services/channel-profile.ts` (client-safe: zod schema, row narrowing,
  label helper) and `src/lib/services/channel-profile-server.ts` (server-only: the
  Supabase query). The split exists because the first module is imported by React
  components and pulling `astro:env/server` into it breaks the client build. S-03 needs
  the same split.
- `src/pages/api/analyze.ts`, `profile.ts`, `avatar.ts` — every `/api/*` route repeats
  its own `context.locals.user` check and returns `jsonError(…, 401)`, because
  `PROTECTED_ROUTES` in `src/middleware.ts:4` covers page requests only.
- `src/components/analyze/AnalyzePanel.tsx` — owns all analysis state, self-contained,
  takes no props. `OpportunityList.tsx` is purely presentational with no interactivity.
- `src/pages/dashboard.astro` — 23 lines, mounts `AnalyzePanel client:load` with no props.
- `vitest.config.ts` scopes tests to `src/lib/services/**/*.test.ts`: pure modules only,
  no jsdom, no DB harness.
- `src/pages/api/avatar.ts` alongside `src/pages/api/avatar/generate.ts` proves a flat
  route and a nested directory of the same name coexist in this Astro setup.

**What's missing:** any durable store for a chosen opportunity, any route that writes
one, and any surface that lists them.

**Key constraint discovered:** `outlier_score` drifts between runs. S-02 measured it
live — two consecutive runs of the same profile moved a score `1.7796 → 1.7797` on zero
new views, and one row's score *fell* on +0 views, because the channel median shifts
underneath it (`context/changes/analyze-and-rank-opportunities/change.md`, Phase 4
pre-verification 4.5). A saved opportunity therefore cannot be a reference to a video:
the number the user decided on would silently become a different number.

## Desired End State

A signed-in user runs an analysis, clicks Save on a ranked row, and sees that row appear
in a "Saved opportunities" panel on the same screen without losing the ranking they are
reading. The saved row keeps the exact score, view count and justification that were on
screen at the moment they saved, labelled with the date it was saved. Reloading
`/dashboard` server-renders the same saved rows. A row can be removed. No other user can
read, modify or delete those rows.

Verified by: a scripted two-account protocol against local Supabase proving cross-user
reads return nothing and cross-user update and delete are both refused (the PRD's isolation
NFR), plus a
browser pass through save → reload → re-analyze → remove.

### Key Discoveries:

- `AnalyzeOpportunity` (`src/types.ts:25-28`) is already the save payload — no new shape
  to design, and `snake_case` already matches column names.
- The RLS pattern is proven twice: `supabase/migrations/20260909213911_create_channel_profiles.sql`
  and `supabase/migrations/20260913134159_add_channel_profile_avatar.sql`.
- The client-safe / server-only module split is mandatory, not stylistic —
  `src/lib/services/channel-profile-server.ts:8-10` documents why.
- `src/pages/api/analyze.ts:73-76` sets the house rule: filter by `user_id` explicitly
  even though RLS already scopes the query, "because relying on RLS alone hides the intent."
- Score formatting lives in `src/components/analyze/OpportunityList.tsx:9-16` and will be
  needed by a second component — it has to move before it gets copied.
- Rate limiters in `wrangler.jsonc` exist to guard *external* budgets (YouTube quota,
  Workers AI neurons). Saving spends only Postgres, so this slice adds no limiter.

## What We're NOT Doing

- **FR-012 status transitions.** The `status` column ships with a default and a CHECK
  that already accepts all three values, but nothing in the UI sets or changes it.
  FR-012 is parked (GitHub #18, PRD demoted to nice-to-have) as the seed of a production
  planner the PRD's Non-Goals exclude. It becomes a pure UI change later, with no migration.
- **Refreshing or re-scoring saved rows.** Snapshots are frozen by design. A refresh
  action would need a second YouTube code path with its own quota handling.
- **A `GET /api/opportunities` route.** `dashboard.astro` server-renders the initial list
  and the parent island mutates its own state from the POST/DELETE responses, so nothing
  ever needs to refetch. Adding a read endpoint would be a second, untested source of truth.
- **Pagination, search, filtering, or sorting controls** on the saved list. The PRD sets
  `data_volume: small`; newest-saved-first is the whole ordering story. The list is capped at
  200 rows with a visible note rather than paginated.
- **Saving from anywhere but the ranking.** No manual "add an opportunity" form.
- **Export, sharing, or any cross-user visibility.** Explicitly excluded by the isolation guardrail.
- **Restyling the dashboard.** The cosmic/glass language established in S-04 is reused as-is.

## Implementation Approach

Three phases, each independently verifiable: the table and its policies, then the routes
that write it, then the UI that uses them. The order means RLS — the one thing everything
downstream depends on and the PRD's hardest guardrail — is proven before any code relies on it.

The architectural decision that shapes Phase 3 is that a single parent island owns both
panels. The ranking needs to know which videos are already saved; the saved list needs to
show a new save immediately. Two independent islands would need a cross-island channel and
a refetch per save; a page reload would destroy the ~11s analysis result the user is
looking at. One parent holding the saved set gives both panels a consistent view for free,
while `dashboard.astro` still server-renders the first paint from the database.

## Critical Implementation Details

**Numeric column types.** `outlier_score` and `channel_median` are `double precision`, not
`numeric`. The value being stored *is* an IEEE double — it is the result of
`video.view_count / channelMedian` in `src/lib/services/scoring.ts:207`. Declaring it
`numeric` would claim a decimal exactness the value never had, and supabase-js types both
as `number` regardless, so nothing is gained. `view_count` is `bigint`: YouTube view counts
exceed `int4`'s 2.1B range on real videos.

**Timestamp round-trip.** `published_at` is stored as `timestamptz`, so it reads back
normalized (`…+00:00`) rather than as the exact `Z`-suffixed string YouTube sent. Both
parse identically through `new Date()`, which is all the UI does with it, but the stored
text is not byte-identical to the wire value — do not assert string equality on it.

**CSRF covers DELETE, not just POST.** Astro's origin check treats every method outside
`GET`/`HEAD`/`OPTIONS` as unsafe, and `security` is unset in `astro.config.mjs`, so it
defaults on. A browser `fetch` always sends `Origin`, so the app path is safe — but any
`curl` verification of `DELETE` must send it too, or the response is `403` plain text
rather than the JSON envelope. S-02 recorded this trap for `POST`; it is one method wider
than that note implies.

**Duplicate saves.** The idempotent path depends on catching Postgres error code `23505`
(unique violation) from the insert and re-selecting the existing row. Supabase's
`upsert({ ignoreDuplicates: true })` will not work here: it compiles to
`ON CONFLICT DO NOTHING`, which returns *no* row on conflict, leaving nothing to hand back
to the client.

## Phase 1: Data model — `content_opportunities` + RLS

### Overview

The table, its policies, and the client-safe/server-only service pair that reads it. No
route and no UI yet — this phase ends with a table that cannot leak.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_create_content_opportunities.sql`

**Intent**: Create the snapshot table with per-owner RLS. The timestamp must sort after
`20260913134159_add_channel_profile_avatar.sql`; use the actual current UTC time.

**Contract**: Table `public.content_opportunities` with:

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null default auth.uid() references auth.users (id) on delete cascade`
  — note: **not** `unique`, unlike `channel_profiles.user_id`; a user has many rows.
- Snapshot columns mirroring `AnalyzeOpportunity` field-for-field: `video_id text not null`,
  `title text not null`, `channel_id text not null`, `channel_title text` (nullable),
  `published_at timestamptz not null`, `view_count bigint not null`,
  `outlier_score double precision not null`, `channel_median double precision not null`,
  `sample_size integer not null`, `justification text` (nullable — null whenever the
  Anthropic call was unavailable for that run, see `src/pages/api/analyze.ts:161`).
- `status text not null default 'new'` with a CHECK restricting it to
  `'new' | 'in_production' | 'done'` — the three states FR-012 names, so that requirement
  needs no migration when it ships.
- `saved_at timestamptz not null default now()`.
- `unique (user_id, video_id)` — the identity rule: one saved row per video per user. This
  index also serves as the `user_id` prefix index for the list query, so no separate index
  is needed.
- Sanity CHECKs on the snapshot: `outlier_score > 0`, `channel_median > 0`,
  `view_count >= 0`, `sample_size > 0`. `scoreChannel` already guarantees a positive
  median (`src/lib/services/scoring.ts:184`), so these encode an invariant the app holds
  rather than adding new behaviour.

Then `alter table … enable row level security` and four granular per-operation policies
(`select` / `insert` / `update` / `delete`) `to authenticated`, each scoped
`auth.uid() = user_id` (`using` for select/delete, `with check` for insert, both for
update) — the exact shape of `20260909213911_create_channel_profiles.sql`.

No `updated_at` column and no trigger: rows are snapshots and nothing in this slice
updates one.

#### 2. Regenerated database types

**File**: `src/lib/database.types.ts`

**Intent**: Pick up the new table so the Supabase client is typed against it.

**Contract**: Regenerated by `npm run db:types` after the migration applies. Committed.
The file is already excluded from ESLint; do not hand-edit it.

#### 3. Client-safe opportunity service

**File**: `src/lib/services/content-opportunity.ts`

**Intent**: Own the zod schema for an incoming save payload and the narrowing of a raw row,
mirroring what `channel-profile.ts` does for profiles. Client-safe — no `astro:env/server`
import — because the dashboard island imports the row type.

**Contract**: Exports
- `saveOpportunitySchema` — a zod object over the `AnalyzeOpportunity` fields. Bounds that
  keep garbage out of the table and out of `Intl.NumberFormat`: `video_id`/`channel_id`
  non-empty and length-capped, `title` capped (~500), `justification` nullable and capped
  (~2000), `published_at` parseable as a date, `view_count` a non-negative integer,
  `outlier_score`/`channel_median` finite and `> 0`, `sample_size` a positive integer.
- `SavedOpportunity` — the row type, derived from
  `Database["public"]["Tables"]["content_opportunities"]["Row"]`.
- `OPPORTUNITY_STATUSES` — the three status literals. This mirrors the SQL CHECK **by
  convention only**: a TypeScript constant cannot constrain a Postgres constraint, and
  nothing enforces agreement between the two files. Each side carries a comment naming the
  other so a future edit finds its counterpart.
- `SAVED_LIST_LIMIT` — `200`, the cap on the saved list (see the server read below).

#### 4. Server-only read

**File**: `src/lib/services/content-opportunity-server.ts`

**Intent**: The one query that lists a user's saved rows, written once for `dashboard.astro`.
Separate module for the same reason `channel-profile-server.ts` is separate.

**Contract**: `loadSavedOpportunities(headers, cookies, userId): Promise<{ opportunities: SavedOpportunity[]; loadFailed: boolean }>`,
mirroring `loadChannelProfile`'s return shape so a query error reads as "unavailable"
rather than as "you have saved nothing". Orders by `saved_at` descending, then `id`
descending as a deterministic tiebreak. Filters `.eq("user_id", userId)` explicitly
alongside RLS, per `src/pages/api/analyze.ts:73-76`.

Caps the result with `.limit(SAVED_LIST_LIMIT)`. Saving is one-click and idempotent, so the
set only grows, and every row is selected, rendered, and serialized into the island's props
on every dashboard load — the cap bounds all three against the Worker's 10ms CPU budget
while sitting far above the PRD's `data_volume: small`. A caller that receives exactly
`SAVED_LIST_LIMIT` rows knows the list is truncated, so no third return field is needed.

#### 5. Shared type re-export

**File**: `src/types.ts`

**Intent**: Re-export `SavedOpportunity` so consumers import one path, per the convention
stated at the top of the file.

**Contract**: `export type { SavedOpportunity } from "@/lib/services/content-opportunity";`

#### 6. Schema unit tests

**File**: `src/lib/services/content-opportunity.test.ts`

**Intent**: Lock the save schema's boundaries. Fits the existing vitest harness with no new
infrastructure (`vitest.config.ts` already globs `src/lib/services/**/*.test.ts`).

**Contract**: A real `AnalyzeOpportunity` shape parses; a `null` justification parses; and
each of a non-finite `outlier_score`, a zero `channel_median`, a negative `view_count`, an
empty `video_id`, and an over-long `title` is rejected.

### Success Criteria:

#### Automated Verification:

- Migration applies on a fresh database: `npx supabase db reset`
- Types regenerate and include the table: `npm run db:types` then `grep -q content_opportunities src/lib/database.types.ts`
- Unit tests pass: `npm test`
- Linting passes: `npm run lint`
- Build passes: `npm run build`
- Duplicate `(user_id, video_id)` insert is refused with SQLSTATE `23505`, and `status = 'bogus'` is refused by the CHECK — both via `psql` against local Supabase
- `select relrowsecurity from pg_class where relname = 'content_opportunities'` returns true, and each of the four rows in `pg_policies` for the table carries `auth.uid() = user_id` in its `qual` and/or `with_check` — the expressions, not just the count, since four policies written `using (true)` would satisfy a count check

#### Manual Verification:

- Reviewed the migration against `20260909213911_create_channel_profiles.sql` and confirmed the policy set is the same shape, with `using` / `with check` on the same operations

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Save & remove API

### Overview

One route file with two handlers, each guarding itself. This phase ends with the full
save/remove loop exercisable by `curl`, and with cross-user isolation proven.

### Changes Required:

#### 1. Save handler — `POST`

**File**: `src/pages/api/opportunities.ts`

**Intent**: Persist one ranked opportunity as a snapshot row. Idempotent on
`(user_id, video_id)` so a second save of the same video is a no-op that returns the row
already stored — the first-saved score wins.

**Contract**: `POST`, returning `200` with the saved row as JSON, or `jsonError` otherwise.
Order of operations:

1. `context.locals.user` check → `jsonError("You must be signed in", 401)`, as every other
   route in `src/pages/api/` does.
2. `await context.request.json()` inside `try/catch` → `jsonError("Invalid JSON body", 400)`
   on a truncated or non-JSON body (`src/pages/api/profile.ts:37-41`).
3. `saveOpportunitySchema.safeParse` → `jsonError(parsed.error.issues[0].message, 400)`.
4. Insert with `user_id` from the session — never from the body.
5. On error code `23505`, re-select the existing row by `(user_id, video_id)` and return it
   with `200`. Any other error → `jsonError(error.message, 400)`.

No rate limiter: the limiters in `wrangler.jsonc` guard external budgets (YouTube quota,
Workers AI neurons) and this route spends only Postgres.

#### 2. Remove handler — `DELETE`, same file

**File**: `src/pages/api/opportunities.ts` (the `DELETE` export)

**Intent**: Delete one saved row by id, from the same file as `POST` — exactly as
`src/pages/api/avatar.ts` exports `POST` at `:24` and `DELETE` at `:67` for one resource.
The id arrives as a `?id=<uuid>` query param rather than a path segment. There is no `[…]`
segment anywhere under `src/pages/` today, so a dedicated `[id].ts` would be the repo's
first dynamic route and an unexercised capability of the Cloudflare adapter; a query param
avoids that without resorting to a DELETE body.

**Contract**: `DELETE /api/opportunities?id=<uuid>`, returning `200` with `{ id }` on success.

1. Auth check as above.
2. Read `context.url.searchParams.get("id")` and validate it as a UUID with zod →
   `jsonError("…", 400)`. Without this a malformed id reaches Postgres as a cast error and
   surfaces as a 500.
3. Delete filtered on **both** `id` and `user_id`, with `.select()` so the deleted rows come
   back. RLS already refuses another user's row; the explicit `user_id` filter is the house
   rule from `src/pages/api/analyze.ts:73-76`.
4. Zero rows returned → `jsonError("That saved opportunity no longer exists", 404)`. This is
   the response both for an already-deleted row and for another user's row — a 404 rather
   than a 403 so the route never confirms that someone else's id exists.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Build passes: `npm run build`
- Unit tests pass: `npm test`
- Both handlers guard themselves: `grep -c "locals.user" src/pages/api/opportunities.ts` is at least 2
- Unauthenticated `POST /api/opportunities` returns `401` with `Content-Type: application/json` and the `{ error }` envelope (send an `Origin` header — Astro's CSRF check rejects a POST without one first, as recorded in S-02's Phase 4 pre-verification)
- Unauthenticated `DELETE /api/opportunities?id=<uuid>` returns `401` in the same envelope — **send `-H "Origin: http://localhost:4321"`**: Astro's origin check covers every method outside `GET`/`HEAD`/`OPTIONS`, so a bare `curl -X DELETE` returns `403` plain text instead, which means a missing header and not a broken route
- Authenticated `POST` with a valid payload returns `200` and the row is present in the table
- Re-`POST`ing the identical payload returns `200` with the **same** `id`, and `select count(*)` for that `(user_id, video_id)` is still 1
- `POST` with a missing `video_id`, and `POST` with `outlier_score: 0`, each return `400` with a message naming the problem
- `DELETE` of a saved row returns `200` (with the `Origin` header); an immediate second `DELETE` of the same id returns `404`
- `DELETE /api/opportunities?id=not-a-uuid` returns `400`, not `500`
- **Isolation protocol (PRD NFR).** Two accounts against local Supabase, five assertions: A saves a row; B's list query returns zero rows; B's `DELETE` of A's row id returns `404`; B's `PATCH` of A's row id via PostgREST affects zero rows (the `modify` half of the end-state claim, which the `update` policy alone does not prove); A's row is still present and unchanged afterwards. Scripted end-to-end with `curl` — no browser and no human judgement required, which is why it sits here rather than under Manual.

#### Manual Verification:

- Read the isolation protocol's transcript and confirmed each of the five assertions was actually exercised against two distinct authenticated sessions, not one

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Dashboard composition

### Overview

The user-facing half: a Save control on each ranked row, a saved panel below it, and one
island holding the saved set so both stay consistent without a reload.

### Changes Required:

#### 1. Shared formatters

**File**: `src/lib/format.ts`

**Intent**: Move the `Intl` formatters out of `OpportunityList.tsx` before a second
component needs them and copies them instead. Helpers belong in `src/lib/` per CLAUDE.md.

**Contract**: Exports `formatScore` (2 fixed decimals — the fixed precision exists so a
score drifting in the fourth decimal does not read as a different number,
`src/components/analyze/OpportunityList.tsx:5-8`), `formatViews` (compact notation), and
`formatDate` (returning `null` for an unparseable timestamp, as `publishedLabel` does today).
`OpportunityList.tsx` imports these instead of declaring them.

#### 2. Parent island

**File**: `src/components/dashboard/DashboardPanels.tsx`

**Intent**: Own the saved set and the two mutation handlers, and render both panels. This is
the piece that makes a save visible in the ranking and in the list in one render.

**Contract**: Props `{ initialSaved: SavedOpportunity[]; loadFailed: boolean }`. State: the
saved rows; a `Set<string>` of `video_id`s with a save in flight; and a `Set<string>` of row
`id`s with a removal in flight (sets rather than single ids, so a user clicking two rows
quickly is not blocked). The two sets are keyed differently on purpose — saves by
`video_id`, because that is the only identifier the ranking has for a row that does not
exist yet; removals by row `id`, because that is what `onRemove` receives. Derives
`savedVideoIds` from the rows and passes it down.

- `onSave(opportunity)` — adds the id to the pending set, `POST`s the opportunity, on `200`
  **merges** the returned row into the saved list by `id` (replace in place when already
  present, otherwise prepend) and fires a success toast, on failure fires an error toast and
  leaves the button idle, and clears the pending id in `finally`. Merge rather than prepend
  because the route is idempotent and hands back the *existing* row for a repeat save: a
  second tab, or an SSR list that loaded before another tab saved, would otherwise prepend a
  row already in the array — a duplicate `id`, which is a React key collision and a visibly
  doubled row. The button is **pending-then-confirmed**, never optimistic: nothing is shown
  as saved until the server says it is.
- `onRemove(id)` — adds the id to the removal set, `DELETE`s `/api/opportunities?id=<id>`,
  then drops the row from state on `200` **and** on `404`, since both mean it is no longer
  there. Other failures toast and leave the row. Clears the id in `finally`.
- Both handlers follow `AnalyzePanel.tsx:74-97`: read the body inside its own `try/catch` so a
  non-JSON failure page is reported as a server error rather than as a lost connection, and
  treat a thrown `fetch` as the connection error.

#### 3. Save control on ranked rows

**Files**: `src/components/analyze/AnalyzePanel.tsx`, `src/components/analyze/OpportunityList.tsx`

**Intent**: Surface the save affordance per ranked row, without moving analysis state out of
`AnalyzePanel`.

**Contract**: Both components gain pass-through props
`{ savedVideoIds: Set<string>; pendingVideoIds: Set<string>; onSave: (o: AnalyzeOpportunity) => void }`.
`AnalyzePanel` keeps ownership of `running` / `result` / `error` — only the saved set is
threaded through. Each row renders one control with three states: idle ("Save"), pending
(disabled, spinner — reuse the `RefreshCw` spin already used for the Analyze button), and
saved (disabled, a check, reading "Saved"). A row whose `video_id` is in `savedVideoIds` is
never clickable, which is what makes a repeat save unreachable from the UI even though the
route is idempotent anyway.

#### 4. Saved panel

**File**: `src/components/opportunities/SavedOpportunitiesPanel.tsx`

**Intent**: The FR-011 browse surface.

**Contract**: Props `{ opportunities: SavedOpportunity[]; removingIds: Set<string>; onRemove: (id: string) => void; loadFailed: boolean }`.
A section matching the Analyze panel's shell (`rounded-2xl border border-white/10 bg-white/5
… backdrop-blur-xl`), titled "Saved opportunities". Each row shows the title linked to
`youtube.com/watch?v=<video_id>`, the channel, compact view count, the score with its
`vs <median> median` caption, the justification when present, and — the point of this
slice's snapshot decision — a **`Saved <date>`** label making explicit that the numbers are
as of that date, not current.

Four distinct states, never a blank panel:
- `loadFailed` → "Your saved opportunities could not be loaded. Refresh to try again."
- no rows → "Nothing saved yet — run an analysis and save the opportunities you want to keep."
- a row mid-removal → its remove control disabled with a spinner.
- exactly `SAVED_LIST_LIMIT` rows → a footer line, "Showing your 200 most recent saves", so
  the cap is visible rather than silently swallowing older rows.

Visually near `OpportunityList` but a separate component: the data is a row not a ranked
result, there is no rank badge, and the affordance is remove rather than save.

#### 5. Dashboard wiring

**File**: `src/pages/dashboard.astro`

**Intent**: Server-render the saved rows for first paint and hand them to the island.

**Contract**: Calls `loadSavedOpportunities(Astro.request.headers, Astro.cookies, user.id)`
and replaces the bare `<AnalyzePanel client:load />` with
`<DashboardPanels initialSaved={…} loadFailed={…} client:load />`. `client:load`, not
`client:only` — the saved list must be in the server-rendered HTML, and unlike the `Toaster`
(`src/layouts/Layout.astro:73`) nothing here trips the pre-bundled-React hook problem.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Build passes: `npm run build`
- Unit tests pass: `npm test`
- `/dashboard` server-renders the saved panel: the response HTML for a signed-in session contains "Saved opportunities" and, when a row exists, that row's title — proving SSR rather than hydration-only
- Formatters are moved, not merely deleted: `grep -rl "Intl\." src/` returns only `src/lib/format.ts` (covering `Intl.DateTimeFormat`, which `formatDate` uses, not just `Intl.NumberFormat`), and that file exports all three of `formatScore`, `formatViews`, `formatDate`

#### Manual Verification:

- Run an analysis and click Save on a row: the control shows a pending state, then reads "Saved" and is disabled; the row appears at the top of the saved panel; the ranking is still on screen
- Reload `/dashboard`: the saved row is still there in the server-rendered page, with the same score and `Saved` date
- Run a second analysis: the already-saved video's control renders in the saved state and cannot be clicked
- Confirm the snapshot holds — after a later run shows a different `outlier_score` for that same video, the saved row still shows the original number
- Remove a saved row: it disappears from the panel, and a reload confirms it is gone
- A fresh account with no saved rows sees the explained empty message, not a blank panel
- Stop the dev server mid-save: the control returns to idle and an error toast fires; no row is shown as saved
- Sign in as a second account and confirm the saved panel is empty — the isolation guardrail as the user experiences it

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- `saveOpportunitySchema` accepts a real `AnalyzeOpportunity`, including one with a `null`
  justification (the degraded-Anthropic case that `src/pages/api/analyze.ts:161` produces).
- It rejects a non-finite `outlier_score`, a zero `channel_median`, a negative `view_count`,
  an empty `video_id`, and an over-long `title`.

### Integration Tests:

None added. The repo has no DB-backed test harness and this slice does not introduce one —
the API-level behaviour is covered by the scripted `curl` protocol in Phase 2's automated
criteria, which exercises the real routes against the real database and real policies.

### Manual Testing Steps:

1. Sign in, run an analysis, save the top-ranked opportunity.
2. Confirm it appears in the saved panel immediately, with its `Saved` date, while the
   ranking stays on screen.
3. Reload `/dashboard` and confirm the row is server-rendered with unchanged numbers.
4. Re-run the analysis; confirm that row's Save control is in the saved state and inert.
5. Remove the row, confirm it disappears, reload to confirm it stayed gone.
6. Sign in as a second account; confirm its saved panel is empty.
7. With no saved rows, confirm the explained empty message renders.
8. Kill the dev server mid-save and confirm the error toast and the idle control.

## Performance Considerations

Saving is a single indexed insert, and browsing a single indexed select capped at
`SAVED_LIST_LIMIT` (200) rows — both trivial next to the ~11s analysis S-02 measured, and
well inside the Worker's 10ms CPU budget. `dashboard.astro` gains one query, running
alongside the profile read `Topbar.astro` already performs.

The cap is what makes that "trivial" hold. Without it the query, the SSR render, and the
JSON serialized into the island's props would each scale with a set that only ever grows —
saving is one-click and idempotent, and this slice ships no pagination.

The `unique (user_id, video_id)` index doubles as the list query's `user_id` prefix index,
so no additional index is created.

## Migration Notes

- `npx supabase db reset` applies the migration locally; `npx supabase db push` applies it
  to the hosted project. There is no production data — `linked_project` is null, as recorded
  in S-02's Phase 1 schema deviation.
- **`db reset` wipes local auth users and channel profiles.** S-02 recorded it verbatim:
  "Local DB was reset to apply the migration, so local auth users and profiles are gone —
  sign up again before manual testing." There is no seed file and no `db:reset` script, and
  `supabase migration up` appears nowhere in this repo, so recovery is manual. After the
  reset: re-run `npm run db:types`, sign up a fresh test account, and save a channel profile
  with 3–5 competitors — Phase 2's isolation protocol and every Phase 3 manual row assume both.
- `npm run db:types` must run after the migration and the regenerated
  `src/lib/database.types.ts` must be committed, or the build fails on an unknown table.
- The migration is additive: no existing table, column, or policy is touched, so there is no
  rollback concern beyond dropping the new table.

## References

- Roadmap item: `context/foundation/roadmap.md` — S-03, GitHub [#5](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/5)
- PRD: `context/foundation/prd.md` — FR-010, FR-011, FR-012 (parked), isolation NFR
- Upstream slice: `context/changes/analyze-and-rank-opportunities/plan.md` and its
  `change.md` deviation log (score drift, latency, the DTO shape this slice persists)
- RLS pattern: `supabase/migrations/20260909213911_create_channel_profiles.sql`
- Service module split: `src/lib/services/channel-profile.ts` and `channel-profile-server.ts`
- Route conventions: `src/pages/api/profile.ts`, `src/pages/api/avatar.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data model — `content_opportunities` + RLS

#### Automated

- [x] 1.1 Migration applies on a fresh database — 38e5c37
- [x] 1.2 Types regenerate and include the table — 38e5c37
- [x] 1.3 Unit tests pass — 38e5c37
- [x] 1.4 Linting passes — 38e5c37
- [x] 1.5 Build passes — 38e5c37
- [x] 1.6 Duplicate insert refused with 23505, bad status refused by CHECK — 38e5c37
- [x] 1.7 RLS enabled with four owner-scoped policies, expressions checked — 38e5c37

#### Manual

- [x] 1.8 Policy set reviewed against the channel_profiles migration — 38e5c37

### Phase 2: Save & remove API

#### Automated

- [x] 2.1 Linting passes
- [x] 2.2 Build passes
- [x] 2.3 Unit tests pass
- [x] 2.4 Both handlers guard themselves with a locals.user check
- [x] 2.5 Unauthenticated POST returns 401 in the JSON envelope
- [x] 2.6 Unauthenticated DELETE with Origin header returns 401 in the JSON envelope
- [x] 2.7 Authenticated POST persists the row and returns 200
- [x] 2.8 Repeat POST returns the same row id and leaves one row
- [x] 2.9 Invalid payloads return 400 naming the problem
- [x] 2.10 DELETE removes the row; a second DELETE returns 404
- [x] 2.11 DELETE with a non-uuid id returns 400
- [x] 2.12 Two-account isolation protocol passes all five assertions

#### Manual

- [x] 2.13 Isolation protocol transcript reviewed against two distinct sessions

### Phase 3: Dashboard composition

#### Automated

- [ ] 3.1 Linting passes
- [ ] 3.2 Build passes
- [ ] 3.3 Unit tests pass
- [ ] 3.4 /dashboard server-renders the saved panel and its rows
- [ ] 3.5 Intl formatters moved to src/lib/format.ts and all three exported

#### Manual

- [ ] 3.6 Save from the ranking shows pending then saved, row appears, ranking retained
- [ ] 3.7 Reload server-renders the saved row with unchanged score and date
- [ ] 3.8 A second analysis renders the saved video's control as inert
- [ ] 3.9 Snapshot holds — saved score unchanged after a later run scores it differently
- [ ] 3.10 Remove drops the row, and a reload confirms it stayed gone
- [ ] 3.11 Empty state renders an explanation, not a blank panel
- [ ] 3.12 Server stopped mid-save returns the control to idle with an error toast
- [ ] 3.13 A second account's saved panel is empty
