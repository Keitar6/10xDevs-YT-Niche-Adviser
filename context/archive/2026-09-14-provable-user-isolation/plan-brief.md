# Provable User Isolation — Plan Brief

> Full plan: `context/changes/provable-user-isolation/plan.md`
> Research: `context/changes/provable-user-isolation/research.md`

## What & Why

The PRD names per-user isolation as a non-functional requirement that must be
*verifiable by test*, and no such test exists. Today the guarantee is correct
but held up entirely by developer discipline — comments, review habits, and
scripted curl that was never part of any gate. This change converts it into a
mechanically enforced invariant: a pgTAP suite proving isolation per verb and
per role across both tables and the avatar bucket, plus Vitest route guards
proving no data-touching handler serves a sessionless caller.

## Starting Point

Research swept the full access-control surface and found **zero defects**:
12 policies covering four verbs × three surfaces, every `UPDATE` policy carrying
both `USING` and `WITH CHECK`, and no service-role client anywhere across 13
Supabase construction sites. What is missing is any mechanism that would catch
the next migration silently undoing it — the previous change said so outright:
*"a future migration that weakens a policy would not be caught automatically."*

## Desired End State

`npm run test:db` proves against the local stack that a stranger cannot read,
update or delete another user's profile, saved opportunities or avatar object —
and that every denied write left the targeted row intact. `npm test` proves each
of the seven data-touching handlers returns 401 with no data to a sessionless
caller, never takes ownership from the request body, and that no service-role
client exists in `src/`. Breaking a policy turns the suite red.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Framing | Pinning job, not remediation | Research found no defects; the deliverable is regression-safety, so a red first run means the test is wrong | Research |
| Impersonation | Built-in `set local role` + `request.jwt.claim.sub` | Verified working on this PG 17 stack during planning; avoids basejump's `pg_tle` → `pgsql-http` → `dbdev` chain that §7 argues against | Plan |
| Vacuous-pass guard | Dedicated first file asserting `auth.uid()` per user | If `auth.uid()` were NULL for both users every isolation assertion would pass while proving nothing | Research → Plan |
| Harden or assert? | Assert-only — no `FORCE RLS`, no `REVOKE` | The roadmap's F-03 outcome reads as assert-only, and a `REVOKE` against implicit Data-API grants risks PostgREST paths not exercised locally | Plan |
| Roles under test | `anon` + two `authenticated` users | Covers exactly the roles the app can present; `service_role` assertions would pin a platform truth that can never fail meaningfully | Plan |
| Fixtures | Two `auth.users` rows created in-transaction, rolled back | Self-contained and re-runnable; no seed file, no cleanup debt, no cross-file ordering | Plan |
| Policy assertions | Assert `qual` / `with_check` expressions, never counts | Review finding F5 caught a criterion four `using(true)` policies would have satisfied | Research |
| Route scope | The 7 data-touching handlers | `/api/auth/*` establishes sessions rather than consuming them and shares no contract | Plan |
| Vitest wiring | `resolve.alias` stubs; **F-03 owns the config edit** | Keeps the Astro/Cloudflare pipelines out of an instant test run, and gives F-04 a base to extend rather than a conflict | Plan |
| No-bypass invariant | Source-scanning Vitest test | If a service-role client ever lands, RLS drops from guarantee to decoration and every other test stops describing production | Research → Plan |
| Gate placement | Local gate now; CI decided in `test-plan.md` §3 Phase 4 | §5 already defers the placement, and a cold runner pays a full ~13-image pull | Plan |
| Avatar signed URL | Out of scope, recorded in §7 | A distinct authorization mechanism no DB-level test can reach; covering it at the route layer means asserting on a stubbed call | Plan |

## Scope

**In scope:** pgTAP suite over `channel_profiles`, `content_opportunities` and
the `avatars` bucket; policy-expression assertions; table-driven route guards
over the seven data-touching handlers; a `getUser()`-over-`getSession()` pin; a
no-service-role-client scan; `vitest.config.ts` widening; `test-plan.md` §6.3 /
§6.4 cookbook entries.

**Out of scope:** any hardening migration (`FORCE RLS`, `REVOKE`);
`service_role` or table-owner assertions; the avatar signed-URL read path;
`/api/auth/*` route tests; CI wiring; refactoring handlers to take the Supabase
client from `locals`; creating the missing `supabase/seed.sql`.

## Architecture / Approach

Two harnesses kept deliberately apart, because they have different
prerequisites. **pgTAP** under `supabase/tests/` needs Docker and proves the
database boundary — which matters here more than usual, since with no
service-role client anywhere, RLS is not defence-in-depth but the *only* thing
between two users. **Vitest** proves the route boundary and needs no database at
all. Coupling them would gate a Docker-free suite behind Docker.

Every denied-write assertion follows the five-step protocol ported from the
archived curl script: owner writes → stranger's read is empty → stranger's
delete affects nothing → stranger's update affects nothing → **owner's row is
unchanged afterward**. That last step is what separates this suite from one that
merely observes zero rows.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Harness + oracle guard | `supabase/tests/`, `npm run test:db`, proof that impersonation actually drives `auth.uid()` | Everything downstream is vacuous if this is wrong — which is why it is its own phase |
| 2. Table isolation | Four verbs × three roles on both tables, plus policy-expression assertions | Writing a denied `INSERT` outside `throws_ok` aborts the whole file |
| 3. Avatar bucket | Same proof over `storage.objects` under `avatars` | Fixtures written at the bucket root instead of `<user_id>/<file>` would silently pass |
| 4. Route guards + no-bypass scan | `vitest.config.ts` widening, 7-handler table, middleware pin, source scan | Two virtual modules (`astro:env/server`, `cloudflare:workers`) must resolve before any handler imports |
| 5. Gate + cookbook | Local gate documented, §6.3/§6.4 filled, roadmap synced | Thin by design; the risk is skipping it, since the roadmap lists these as owed by F-03 |

**Prerequisites:** Docker running with the local Supabase stack (already
available — currently up and healthy); `pg_prove:3.36` image cached (already
pulled).
**Estimated effort:** ~2–3 sessions across 5 phases; phases 1–3 are one
session, phase 4 is the largest single unit.

## Open Risks & Assumptions

- **`anon` isolation remains an absence, not a statement.** With assert-only
  chosen, a future `for select using (true)` — the shape a "public profile"
  feature reaches for — still reopens everything. The suite catches it on the
  next run, not by construction.
- **The local gate is a gate only if someone runs it.** A migration pushed
  without running `npm run test:db` still reaches master green. This is the
  accepted cost of deferring CI placement to `test-plan.md` §3 Phase 4.
- **The `astro:env/server` stub must be kept in sync by hand** with the
  `env.schema` block in `astro.config.mjs`. Drift is silent.
- **Fixtures write directly to `auth.users`**, a Supabase-managed schema. A
  future required column would break them — loudly, not silently.
- **`supabase/seed.sql` is still referenced by `config.toml:65-68` and absent on
  disk.** Nothing in this change depends on it, but it remains a trap for any
  future suite that uses `supabase db reset`.
- **F-04 will touch `vitest.config.ts` too.** This plan claims that file first;
  if F-04 lands ahead of Phase 4, its author should extend rather than replace.

## Success Criteria (Summary)

- A stranger provably cannot read, modify or delete another user's data across
  all three surfaces — and every denied write provably left the target intact
- Every data-touching route provably refuses a sessionless caller and derives
  ownership from the session, verified exhaustively rather than by sampling
- Deliberately weakening a policy or removing a route guard turns the suite red
