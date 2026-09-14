---
change_id: testing-analyze-boundary-resilience
title: Testing analyze boundary resilience
status: implementing
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
