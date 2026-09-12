---
change_id: analyze-and-rank-opportunities
title: Analyze and rank opportunities
status: implementing
created: 2026-09-10
updated: 2026-09-12
archived_at: null
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
