---
change_id: testing-quality-gates
title: Testing quality gates
status: implementing
created: 2026-09-14
updated: 2026-09-14
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

### Deviations from the plan

**Phase 1 · #1 — narrowing uses an annotation, not an `as` cast.** The plan's
contract is "narrow the parsed body to `Record<string, unknown>`". The literal
form it implies, `(await response.json()) as Record<string, unknown>`, is
rejected by `@typescript-eslint/no-unnecessary-type-assertion` — ESLint's
program resolves `Response.json()` through an overload where the assertion
changes nothing, so the cast makes `npm run lint` red while fixing
`npm run typecheck`. The annotation form,
`const body: Record<string, unknown> = await response.json()`, satisfies both
gates and yields the same type. The non-tautology requirement is unaffected and
was proven by the prescribed mutation check: adding a second key to the
`jsonError` envelope turns 8 tests red on `Object.keys(body)` at both sites.

**Phase 1 · #2 — the formatting drift had moved.** The plan located it in
`context/foundation/roadmap.md`; by implementation time the repo-wide Prettier
pass in `736de34` had already normalised that file, and the live
`prettier --check .` failures were the change folder's own `plan.md` and
`plan-brief.md`. Those were normalised instead. `roadmap.md`'s only diff in this
phase is the `planning → in-progress` status flip.

### Gate-mutation evidence (CI run ids)

The adversarial verification in `plan.md` §Testing Strategy is proven by run,
not by assertion. The probe commits were pushed, observed, and then dropped from
the branch, so the runs are the only surviving record:

| Gate           | Probe                                       | Run                                                                                         | Result                                             |
| -------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| (baseline)     | none                                        | [34833503757](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/actions/runs/34833503757) | success, 83s, all 7 gate steps green               |
| `format:check` | unformatted line appended to `change.md`    | [34833673353](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/actions/runs/34833673353) | failure on `npm run format:check`, rest skipped    |
| `typecheck`    | `const deliberateTypeError: number = body;` | [34833955418](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/actions/runs/34833955418) | failure on `npm run typecheck`, `lint` still green |

The `typecheck` probe is the more informative of the two: `npm run lint` passed
it. A type error that ESLint does not see is exactly the gap the new gate closes.

### Phase 3 measurements

The `db` job, cold runner, run
[34834999770](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/actions/runs/34834999770):

| Quantity                    | Value                                                       |
| --------------------------- | ----------------------------------------------------------- |
| `db` job wall time          | 111s                                                        |
| ├ `npx supabase start -x …` | ~83s                                                        |
| └ `npm run test:db`         | ~4s                                                         |
| Containers started          | 1 (`supabase_db_…`)                                         |
| **Images pulled**           | **5** — postgres, realtime, storage-api, gotrue, pg_prove   |
| Assertions                  | `Files=5, Tests=77` — identical to the local full-stack run |
| Local trimmed start (warm)  | 19s, 1 container, `Files=5, Tests=77`                       |

**The plan's one wrong prediction.** It claimed the trimmed start would make the
runner "pull one image rather than fourteen". It does not: `-x` bounds which
containers the CLI _starts_, not which images it _pulls_. Five images still came
down. The scoping is still worth it — 111s only on `supabase/**` changes, versus
on every change — but the saving is smaller than the plan assumed, and the
number now in `supabase/tests/README.md` and `test-plan.md` §6.7 is the measured
one rather than the predicted one.

**`ci` wall time (3.4).** 83s in Phase 2 against 106s in Phase 3, which is runner
variance rather than regression: the `ci` job's parsed definition is
byte-identical across `a404db7` and `3c45ea5`, and the two new jobs run in
parallel with it.

**Policy-break probe (3.7).** `channel_profiles_select_own` rewritten to
`using (true)`, run
[34835304295](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/actions/runs/34835304295):
`db` failed, `ci` stayed green. Caught twice and independently — by
`01-channel-profiles.test.sql` ("user B sees no profile at all") and by
`03-policy-shape.test.sql` ("every channel_profiles read/modify policy tests
ownership in its USING clause"). Probe commit dropped from the branch.
