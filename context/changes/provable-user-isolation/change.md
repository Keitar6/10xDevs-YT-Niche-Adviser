---
change_id: provable-user-isolation
title: Provable user isolation
status: implemented
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

**Phase 3 criterion 3.4 (`npx supabase db reset`) deferred to the user.** The
local database holds real development data — a channel profile, its avatar
object and saved opportunities — and a reset would destroy it. Decided with the
user on 2026-09-14 to skip it rather than reset or round-trip a dump. The
property it was meant to establish (no hidden dependency on accumulated local
state) is carried instead by the suite's own shape: every file creates its
fixtures in-transaction under two fixture user ids, and every assertion reads
back through RLS as one of those users, so pre-existing rows belonging to anyone
else are structurally unreachable. The row-count assertions in `01` and `02`
would fail loudly if that stopped being true. 3.4 was ticked on 2026-09-14 as accepted by the user without the reset
being run — the record should read that way rather than as evidence.
