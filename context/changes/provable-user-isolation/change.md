---
change_id: provable-user-isolation
title: Provable user isolation
status: impl_reviewed
created: 2026-09-14
updated: 2026-09-14
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

### Deviations from the plan

**Phase 3 — `storage.objects` carries a statement-level delete guard the plan
did not know about.** `protect_objects_delete` (→ `storage.protect_delete()`) is
a `BEFORE DELETE ... FOR EACH STATEMENT` trigger that raises `42501` on any
direct DELETE unless `storage.allow_delete_query` is `'true'`. Because it fires
per statement rather than per row, it fires even when RLS has already filtered
the target row away — so the plan's "B's delete against A's object affects 0
rows" assertion would have passed for everyone, owner included, and proven
nothing. `04-avatars-bucket.test.sql` therefore sets that GUC (which
`authenticated` is free to set itself, so the trigger is an orphaned-object
guard, not an access-control boundary) and adds a closing assertion that user A
*can* delete their own object — which is what makes the strangers' zero-row
deletes mean "RLS denied you" rather than "nobody can delete anything".

**Phase 3 criterion 3.4 (`npx supabase db reset`) was deferred during
implementation and settled at impl-review.** Claude declined to run the reset
during Phase 3: the local database held real development data — a channel
profile, its avatar object and saved opportunities — and a reset would have
destroyed it. The user then reported having already run it, and 3.4 was recorded
as user-verified on that basis.

The impl-review on 2026-09-14 found that report was mistaken. Row timestamps
showed the dev profile (`16:47:17`) and two leftover fixture users
(`16:33`) all dated 2026-09-13, and `supabase/seed.sql` does not exist — so no
reset could have run since then without destroying data that was still present.
The user was shown this and chose to run the reset for real. After backing the
dev data up, both deferred criteria were then genuinely performed:

- **3.4** — reset ran, database confirmed empty (0 users / 0 profiles / 0
  opportunities / 0 storage objects), suite passed 70/70 against it.
- **2.4** — `alter policy channel_profiles_select_own … using (true)` turned the
  suite red (`01` 1/16, `03` 1/12); `npx supabase db reset` restored it to green.

Both are now evidence rather than attestation. The structural argument below
still holds independently and is what made the gap low-risk in the meantime.

Independently of that run, the property 3.4 establishes (no hidden dependency on
accumulated local state) is also carried structurally by the suite's own shape:
every file creates its fixtures in-transaction under two fixture user ids, and
every assertion reads back through RLS as one of those users, so pre-existing
rows belonging to anyone else are unreachable. The row-count assertions in `01`
and `02` would fail loudly if that stopped being true.
