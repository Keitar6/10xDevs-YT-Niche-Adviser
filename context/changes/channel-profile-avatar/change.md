---
change_id: channel-profile-avatar
title: Channel profile avatar
status: implementing
created: 2026-09-13
updated: 2026-09-13
archived_at: null
---

## Notes

**Deviation from PRD wording (2026-09-13):** FR-015 and the roadmap both say `avatar_url`, but the column is named **`avatar_path`** and stores the Storage object path, not a URL. The bucket is private, so it is read through `createSignedUrl`, which expires — a persisted URL would rot. The signed URL is minted per SSR render in `Topbar.astro`. See `plan.md` -> Key Discoveries.

**Generated avatars are 1024×1024, not 512×512 (2026-09-13):** the plan's Phase 4
specified "requesting `@cf/black-forest-labs/flux-1-schnell` at 512×512", but that
model's input schema accepts only `prompt` and `steps` — there is no `width`/`height`
(`Ai_Cf_Black_Forest_Labs_Flux_1_Schnell_Input` in `worker-configuration.d.ts`). It
emits 1024×1024 and there is nowhere to shrink it: Supabase transforms are Pro-only
and the 10ms Worker CPU cap rules out in-process resizing. Generated avatars are
therefore stored at 1024 (~200 KB, well under the 2 MiB bucket cap); *uploaded*
avatars are still canvas-normalized to 512. Cost follows the plan's own 1024 figure:
57.6 neurons ≈ $0.00063 per image, ~173/day on the free allocation rather than ~230.

**Generation lives in `avatar-generate.ts`, not `avatar.ts` (2026-09-13):** Phase 4
placed `generateAvatar` in `src/lib/services/avatar.ts`, but Phase 2 had already
contracted that same file as pure ("must not import `astro:env/server` or call
`fetch`"). Keeping both constraints means a separate module: `avatar.ts` stays pure,
`avatar-generate.ts` owns the binding call, and `avatar-storage.ts` owns the shared
store-and-replace write path that both `/api/avatar` and `/api/avatar/generate` use.

**Binding presence needs a widened read (2026-09-13):** `npx wrangler types` generates
`AI: Ai` as non-optional because the binding is in `wrangler.jsonc`, so `if (!env.AI)`
fails `@typescript-eslint/no-unnecessary-condition`. The runtime check is exactly how
FR-015's degraded upload-only mode is reached, so it is kept and the read is widened
(`(env as { AI?: Ai }).AI`) rather than deleted.
