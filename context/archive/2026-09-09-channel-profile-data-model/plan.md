# Channel Profile Data Model Implementation Plan

## Overview

Create the `channel_profiles` table in Supabase Postgres with strict per-owner RLS, so FR-002 ("Użytkownik widzi i zarządza wyłącznie własnymi danymi") and FR-003 ("Użytkownik może utworzyć profil kanału") have a data layer to build on. This is roadmap item **F-02**, a Foundation slice with no prerequisites that unlocks **S-01** (channel profile create/edit UI).

## Current State Analysis

- `supabase/migrations/` does not exist yet — this project has zero custom tables; the only existing schema is Supabase Auth's built-in `auth.users`.
- `src/types.ts` is an empty placeholder: `// Shared entity and DTO types go here.`
- `src/lib/supabase.ts`'s `createServerClient(...)` call has no generic type parameter — the Supabase client is currently untyped.
- `package.json` has no `db:*` scripts; `supabase` CLI (`^2.116.0`) is already a devDependency (used via bare `supabase <cmd>` in npm scripts, or `npx supabase <cmd>` from the shell).
- No test runner exists in this repo (confirmed during the `google-oauth-login` change) — verification here is manual, same pattern as that change.
- Local Supabase (`npx supabase start`) is already running against Postgres major version 17 (`supabase/config.toml`), where `gen_random_uuid()` is a native built-in — no extension needed.
- `supabase/config.toml`'s `[api]` exposes the `public` schema by default with `auto_expose_new_tables` left at its implicit `true` default, so once this migration lands, `channel_profiles` is immediately reachable through PostgREST (`/rest/v1/channel_profiles`) — RLS is the only thing standing between "reachable" and "isolated."

## Desired End State

The `channel_profiles` table exists in Supabase Postgres (local dev, verified there — see "What We're NOT Doing" on cloud push) with one row per user, RLS policies that strictly scope every operation to `auth.uid() = user_id`, and generated TypeScript types flowing through `src/lib/supabase.ts` and a `ChannelProfile` alias in `src/types.ts`.

**Verification:** two local test users, created via the existing `/api/auth/signup` route, each get their own profile via direct REST calls to Supabase's PostgREST API (no app-level CRUD route exists yet — that's S-01). Confirm user A can read/write only their own row, user B's read of user A's row returns empty, and a second insert attempt for the same `user_id` is rejected by the DB.

### Key Discoveries:

- Roadmap explicitly assigns 3–5 competitor-ID _count_ validation to S-01's risk ("główne ryzyko to walidacja formatu i liczby ID konkurentów"), not to this Foundation slice — so this migration intentionally leaves `competitor_channel_ids` uncapped at the DB level.
- "One profile per user" is an explicit MVP assumption in the PRD (`Założenie MVP: jeden profil kanału na użytkownika`) — enforced here via a `unique` constraint on `user_id`, not just app logic.

## What We're NOT Doing

- No CRUD API routes or UI for creating/editing a profile — that's S-01 (`channel-profile-crud`), which depends on this table existing.
- No DB-level CHECK constraint on the 3–5 competitor-ID count, or on YouTube channel-ID format — both left to S-01's app-level validation per the Key Discoveries above.
- No push to the cloud Supabase project — this migration is verified against local Supabase only; nothing consumes this table yet (S-01 does), so the cloud push can happen naturally before/during that change.
- No `channel_profile_competitors` child table — competitor IDs are opaque strings today (S-02 fetches their data live from YouTube's API), so a `text[]` column on the profile row is sufficient; normalizing now would be premature.
- No pgTAP or other automated test framework — this repo has no test runner yet; verification is manual, consistent with how `google-oauth-login` was verified.

## Implementation Approach

A single migration creates the table, its RLS policies, and an `updated_at` trigger in one file (nothing here is large enough to warrant splitting). Supabase's type generator then produces a `Database` type consumed by both the Supabase client and a hand-aliased `ChannelProfile` entity type, following the project's existing `src/types.ts` convention.

## Critical Implementation Details

### RLS verification recipe

There's no app route to exercise yet, so verification goes straight through Supabase's Data API rather than through this app. For each of two test users (sign up via the existing `POST /api/auth/signup`, which auto-confirms locally and returns a session), capture their `access_token` from the signup response's `sb-127-auth-token` cookie (or from a direct `POST {SUPABASE_URL}/auth/v1/signup` call, which returns the token in the JSON body directly — simpler for this purpose). Then call `{SUPABASE_URL}/rest/v1/channel_profiles` with headers `apikey: <SUPABASE_KEY>` and `Authorization: Bearer <user's access_token>` — a `POST` to insert, a `GET` to read. RLS is enforced identically regardless of whether the caller is this app's SSR routes or a raw REST call, so this directly proves the policies work without needing S-01's UI first.

## Phase 1: Channel profile data model

### Overview

Add the migration (table, RLS, trigger), generate types, wire the typed client, and verify isolation manually.

### Changes Required:

#### 1. Migration: create `channel_profiles`

**File**: `supabase/migrations/20260909213911_create_channel_profiles.sql`

**Intent**: Establish the table, its per-owner RLS policies (granular per-operation, per CLAUDE.md's convention), and an `updated_at` trigger — the full "Desired End State" outcome in one migration.

**Contract**:

```sql
create table public.channel_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  niche text not null,
  sub_niche text,
  competitor_channel_ids text[] not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.channel_profiles enable row level security;

create policy "channel_profiles_select_own" on public.channel_profiles
  for select to authenticated
  using (auth.uid() = user_id);

create policy "channel_profiles_insert_own" on public.channel_profiles
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "channel_profiles_update_own" on public.channel_profiles
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "channel_profiles_delete_own" on public.channel_profiles
  for delete to authenticated
  using (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger channel_profiles_set_updated_at
  before update on public.channel_profiles
  for each row
  execute function public.set_updated_at();
```

#### 2. Type generation script

**File**: `package.json`

**Intent**: Give the project a repeatable way to regenerate DB types whenever the schema changes, rather than hand-maintaining them.

**Contract**: Add a `db:types` script: `"db:types": "supabase gen types typescript --local > src/lib/database.types.ts"`.

#### 3. Generated database types

**File**: `src/lib/database.types.ts` (generated, committed)

**Intent**: Run `npm run db:types` against the local instance (once the migration above is applied) to produce the `Database` type covering `channel_profiles`.

**Contract**: Output of the Supabase CLI generator, committed as-is — not hand-edited.

#### 4. Typed Supabase client

**File**: `src/lib/supabase.ts`

**Intent**: Flow the generated `Database` type through the existing `createClient` helper so all future Supabase calls (this change and S-01 onward) get compile-time column/table checking.

**Contract**: Import `Database` from `./database.types` and change `createServerClient(SUPABASE_URL, SUPABASE_KEY, {...})` to `createServerClient<Database>(SUPABASE_URL, SUPABASE_KEY, {...})`. Return type of `createClient` changes accordingly; no call sites need edits since none currently narrow the client's type.

#### 5. `ChannelProfile` entity type

**File**: `src/types.ts`

**Intent**: Give the rest of the app (starting with S-01) a domain-named type to import instead of reaching into `Database` directly, per CLAUDE.md's "Shared types go in `src/types.ts`" convention.

**Contract**: `export type ChannelProfile = Database["public"]["Tables"]["channel_profiles"]["Row"];`, importing `Database` from `@/lib/database.types`.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `npx supabase db reset` (re-applies all migrations from scratch against local Postgres)
- Type generation succeeds without error: `npm run db:types`
- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- Two local test users signed up; user A can insert and then read their own `channel_profiles` row via direct REST calls (`apikey` + `Authorization: Bearer <access_token>` against `{SUPABASE_URL}/rest/v1/channel_profiles`)
- User B's REST read of the _same row_ (by `id` or unfiltered list) returns zero rows — isolation confirmed from the other side too
- A second insert attempt using user A's own `user_id` again is rejected (unique-constraint violation) — confirms the one-profile-per-user assumption is enforced at the DB level, not just assumed
- An UPDATE to user A's row (e.g. changing `niche`) results in `updated_at` advancing without the request setting it explicitly — confirms the trigger fires

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None — no test runner exists in this repo yet (same as `google-oauth-login`).

### Integration Tests:

- None automated. Covered by the manual REST-based verification above.

### Manual Testing Steps:

1. Run `npx supabase db reset`, confirm it applies without error.
2. Run `npm run db:types`, confirm `src/lib/database.types.ts` is generated and includes `channel_profiles`.
3. Sign up two throwaway local users via `POST /api/auth/signup` (or directly against `{SUPABASE_URL}/auth/v1/signup`).
4. As user A, `POST` a row to `{SUPABASE_URL}/rest/v1/channel_profiles` with `niche`, `sub_niche` (optional), and 3–5 `competitor_channel_ids`; confirm `201`.
5. As user A, `GET` the same endpoint; confirm the row comes back.
6. As user B, `GET` the same endpoint; confirm an empty array (not user A's row).
7. As user A again, `POST` a second row; confirm it's rejected (unique violation on `user_id`).
8. As user A, `PATCH` the existing row's `niche`; confirm the response's `updated_at` is later than `created_at`.

## Performance Considerations

None — a single small table with an owner-scoped index (implicit via the `unique` constraint on `user_id`) and no expected write volume beyond one row per user.

## Migration Notes

No existing data to migrate — this is the first custom table in the project. Cloud (hosted Supabase project) push is deliberately deferred (see "What We're NOT Doing") until S-01 needs it live.

## References

- Roadmap item: `context/foundation/roadmap.md` — F-02
- PRD requirements: `context/foundation/prd.md` — FR-002, FR-003
- CLAUDE.md migration convention: `YYYYMMDDHHmmss_short_description.sql`, RLS with granular per-operation policies
- Prior manual-verification pattern (curl + two sessions): `context/changes/google-oauth-login/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Channel profile data model

#### Automated

- [x] 1.1 Migration applies cleanly: `npx supabase db reset` — 822c33b
- [x] 1.2 Type generation succeeds: `npm run db:types` — 822c33b
- [x] 1.3 Lint passes: `npm run lint` — 822c33b
- [x] 1.4 Build passes: `npm run build` — 822c33b

#### Manual

- [x] 1.5 User A can insert and read their own `channel_profiles` row via direct REST calls — 822c33b
- [x] 1.6 User B's REST read of user A's row returns zero rows — 822c33b
- [x] 1.7 Second insert attempt for user A's `user_id` is rejected (unique constraint) — 822c33b
- [x] 1.8 UPDATE to user A's row advances `updated_at` via the trigger — 822c33b
