# Channel Profile Data Model — Plan Brief

> Full plan: `context/changes/channel-profile-data-model/plan.md`

## What & Why

Create the `channel_profiles` table in Supabase Postgres with strict per-owner RLS, satisfying FR-002 (users see/manage only their own data) and giving FR-003 (create a channel profile) a data layer to build on. This is roadmap Foundation item **F-02** — the first custom table in the project — and it unlocks S-01 (the profile create/edit UI).

## Starting Point

The project has zero custom tables today — only Supabase Auth's built-in `auth.users`. `supabase/migrations/` doesn't exist, `src/types.ts` is an empty placeholder, and the Supabase client (`src/lib/supabase.ts`) is untyped. No test runner exists anywhere in the repo.

## Desired End State

A `channel_profiles` table exists locally with one row per user (niche, optional sub-niche, 3–5 competitor channel IDs), RLS policies that make every operation strictly owner-scoped, and generated TypeScript types flowing through the Supabase client and a `ChannelProfile` alias in `src/types.ts`. Verified by two test users hitting Supabase's REST API directly (no app UI exists yet — that's S-01).

## Key Decisions Made

| Decision              | Choice                                                | Why (1 sentence)                                                                                            |
| --------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Competitor ID storage | `text[]` column on the profile row, not a child table | 3–5 opaque ID strings don't need normalization; S-02 fetches competitor data live from YouTube's API anyway |
| 3–5 count enforcement | App-level only (S-01), no DB CHECK                    | Roadmap explicitly names this validation as S-01's risk, not F-02's                                         |
| Channel ID format     | No DB-level format CHECK                              | Avoids baking in a possibly-wrong assumption about YouTube's ID shape                                       |
| TS type generation    | Add `supabase gen types typescript` + type the client | End-to-end type safety, pays off as more tables arrive in S-01/S-03                                         |
| RLS verification      | curl against local REST API with two users' JWTs      | Reuses the exact two-session pattern already proven debugging `google-oauth-login` this session             |
| `updated_at`          | DB trigger (`BEFORE UPDATE`)                          | Correct regardless of which code path updates the row — can't be forgotten                                  |
| Migration scope       | Local Supabase only, cloud push deferred              | Nothing consumes this table until S-01; no reason to touch the cloud DB yet                                 |
| `sub_niche`           | Nullable                                              | PRD doesn't mark it must-have on its own, and not every niche needs a split                                 |

## Scope

**In scope:** migration (table + RLS + trigger), `db:types` npm script, generated `Database` type, typed Supabase client, `ChannelProfile` alias, manual REST-based RLS verification.

**Out of scope:** any CRUD API route or UI (S-01), DB-level count/format validation, cloud project push, a normalized competitors child table, automated/pgTAP tests.

## Architecture / Approach

One migration file creates the table, four granular RLS policies (select/insert/update/delete, all scoped to `auth.uid() = user_id`), and an `updated_at` trigger. Supabase's CLI then generates a `Database` type from that schema, which flows into the Supabase client's generic parameter and into a hand-aliased `ChannelProfile` type in `src/types.ts`.

## Phases at a Glance

| Phase                         | What it delivers                                                                | Key risk                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1. Channel profile data model | Migration, RLS, trigger, generated types, typed client, curl-verified isolation | RLS policy correctness — the one area worth extra rigor per the roadmap's own risk note |

**Prerequisites:** local Supabase running (`npx supabase start`) — already the case from `google-oauth-login`.
**Estimated effort:** ~1 session, single phase.

## Open Risks & Assumptions

- Cloud Supabase project won't have this table until pushed, deliberately deferred to S-01 — worth re-checking at that point.
- One-profile-per-user is enforced via a `unique` constraint now; if that MVP assumption changes later, it's a migration to loosen, not just an app-code change.

## Success Criteria (Summary)

- `channel_profiles` exists locally with correct schema and RLS.
- A user can only ever see/modify their own profile row, verified directly against the Data API.
- Types generated and flowing through the app compile cleanly (`npm run build`).
