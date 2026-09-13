---
change_id: channel-profile-avatar
title: Channel profile avatar
status: impl_reviewed
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

**Hosted project was further ahead than the plan assumed (2026-09-13):** Phase 5 said
"this is the first cloud migration push in the project's history" and that `db push`
would apply all three migrations. `supabase migration list` after linking showed
`20260909213911` and `20260912190947` were *already* applied remotely; only
`20260913134159_add_channel_profile_avatar` was pending, and only it was pushed.
Verified afterwards against the hosted project: `channel_profiles.avatar_path text`,
bucket `avatars` (`public=false`, `2097152`, `{image/png,image/jpeg,image/webp}`), and
all four `storage.objects` policies with the expected `foldername(name)[1]` predicate.
Worker redeployed (version `2ef8e060`); `env.AI` and `env.AVATAR_LIMITER` are both
present in the production binding list, and `SUPABASE_URL`/`SUPABASE_KEY` were already
set as Worker secrets, so no new secret was introduced — as the plan predicted.

**Phase 5 closed out with four rows unchecked (2026-09-13):** local verification is
complete (3.4/3.5 confirmed in the browser by the user; every other row proven by
automated checks or direct curl/SQL against the real stack). The four remaining rows
are deliberately not claimed:

- **5.1 CI green on `master`** — *won't-do, blocked on infrastructure outside this
  slice.* `.github/workflows/ci.yml` is committed on `master`, the API reports it
  `state=active`, and Actions is `enabled: true` / `allowed_actions: all`, yet the
  repository has **zero workflow runs ever** and PR #21 did not trigger one either.
  This contradicts CLAUDE.md's claim that CI "runs lint + build on every push and PR
  to master". Needs an account-level Actions/billing check. What *did* pass on PR #21
  is Cloudflare's own "Workers Builds" check, so the production build is verified —
  just not by the workflow the plan named.
- **5.4 two-user isolation in production** — *won't-do, accepted by the user.* The
  hosted policies were dumped and compared after `db push` and are byte-identical to
  the local ones, which were proven with a full two-user REST protocol (B gets 404 on
  read, 403 `new row violates row-level security policy` on insert, 403 `AccessDenied`
  on delete, `[]` on list; A and anon behave correctly). Re-running it in production
  would require creating throwaway users in real auth.
- **5.3 / 5.5 production smoke + CPU time** — *pending.* The Worker is deployed
  (version `2ef8e060`) with `env.AI` and `env.AVATAR_LIMITER` present, but it has not
  been exercised through the browser yet. Note that `YOUTUBE_API_KEY` and
  `ANTHROPIC_API_KEY` are **not** set as Worker secrets, so on the deployed app profile
  saving accepts only full `UC…` IDs and `/api/analyze` returns 500 — neither affects
  avatar upload or generation.

**`AvatarField` does not use `SubmitButton` (2026-09-13, accepted via impl-review F1):**
Phase 3's contract said pending state would use `SubmitButton`'s `pending` prop,
mirroring `ChannelProfileForm.tsx:186`. The shipped component instead tracks a local
`busy: "upload" | "remove" | "generate" | null` state across three independent
actions — upload, remove, generate — each with its own button. `SubmitButton` is
built around one pending action per component instance and doesn't map cleanly onto
three concurrently-available actions in the same dialog, so a local busy-state was
used instead. All three handlers are independently verified to wrap their `fetch`
calls in try/catch/finally (impl-review F2 from the prior slice's convention).
Accepted as-is rather than refactored, since the code is already correct and the
divergence is cosmetic-pattern, not functional.
