---
change_id: testing-analyze-boundary-resilience
title: Testing analyze boundary resilience
status: impl_reviewed
created: 2026-09-14
updated: 2026-09-14
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

- **Research Open Question #1 is closed: no production transport seam is
  needed.** The Anthropic SDK resolves `fetch` in the *client constructor* —
  `node_modules/@anthropic-ai/sdk/src/client.ts:655` runs
  `this.fetch = options.fetch ?? Shims.getDefaultFetch()`, and
  `src/internal/shims.ts:11-18` reads the `fetch` global at that moment rather
  than capturing it at module import. `justify.ts:108` constructs the client
  per call, so a `vi.stubGlobal("fetch", …)` installed before the call reaches
  the SDK. The injectable-`fetch` parameter research held in reserve was not
  needed. Do not re-run this spike.

- **G5 was confirmed by observation, not inference** (Phase 1). Written before
  the fix, `justify.test.ts`'s truncated-JSON and wrong-key-JSON cases failed
  with `"Justifications could not be generated."` — proving the parse throws an
  `AnthropicError` that misses all three typed branches, exactly as the plan
  predicted. The other 11 cases passed unchanged, so the rest of the SDK
  behaviour model in the plan held.

- **Deviation (Phase 2): the `AnalyzePanel` notice split was pulled forward
  from Phase 4.** The plan's Migration Notes predicted the DTO and UI must land
  together, and `@typescript-eslint/no-base-to-string` enforced it — with
  `unresolved` now an object array, `AnalyzePanel.tsx:145`'s `join()` would have
  rendered `[object Object]`, failing Phase 2's own lint gate. Doing the minimal
  `.map(u => u.channel_id)` instead would have shipped a commit where the UI
  still called a transport failure "Not found on YouTube" — the exact defect G2
  exists to remove. No scope or design change; only the phase boundary moved.
  Phase 4 keeps the G3 try/catch and the test-plan §6.2 / §6.6 entries.

- **The worktree needed `npx astro sync`** after `npm ci`: without the generated
  `.astro/types.d.ts`, `npm run lint` reports 23 pre-existing
  `no-unsafe-*` errors across `middleware.ts`, `supabase.ts`, `analyze.ts` and
  `profile.ts` that have nothing to do with this change.

- **Worktree setup, full list.** A fresh worktree on this repo needs three
  things before the app runs, none of which git carries: `npm ci` (no
  `node_modules`), `npx astro sync` (no `.astro/types.d.ts`), and a copy of
  `.dev.vars` / `.env` from the main checkout — both are gitignored
  (`.gitignore:17,21`), so their absence makes `config-status.ts` report
  Supabase, YouTube *and* Anthropic as unconfigured. That banner is the
  expected symptom of a missing file, not a code fault; Astro reads
  `astro:env/server` at startup, so the dev server needs a full restart after
  the copy rather than a hot reload.

- **Manual verification confirmed by the user (2026-09-14), post-review.** Items
  2.6, 2.7, 3.6 and 4.5-4.8 were re-confirmed by hand after the implementation
  review's fixes landed, closing the evidence gap the review noted: only 1.5 had
  a written record before this. The boxes in `plan.md` were already `[x]`; this
  note is the evidence behind them, not a status change.

- **The all-competitors-fail path was checked too (2026-09-14).** The case F1's
  gate newly affects — every competitor transport-failing, so there is no ranking
  at all — was confirmed by hand after the fix: the run shows only the
  `empty_reason` notice naming the failed ids, and no longer claims "the ranking
  below covers the remaining competitors". No automated test covers this path
  (test-plan.md §7 rules out UI tests), so this note is its only record.
