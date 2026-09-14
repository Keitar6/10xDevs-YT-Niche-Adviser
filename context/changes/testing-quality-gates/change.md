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
