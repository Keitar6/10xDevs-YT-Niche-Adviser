# Channel Profile Avatar — Plan Brief

> Full plan: `context/changes/channel-profile-avatar/plan.md`
> Research: `context/changes/channel-profile-avatar/research.md`

## What & Why

The channel profile carries a niche, a sub-niche and three to five competitors, but nothing visual — the app shell shows an email address and a text link. FR-015 asks for an avatar the user either uploads or generates from their own niche, so the profile reads as _theirs_ rather than as a row in a form.

## Starting Point

`channel_profiles` has no avatar column. Supabase Storage is enabled locally but never called from anywhere in `src/`, and no `storage.objects` policy exists. There is no binary or file handling in the codebase at all, and `wrangler.jsonc` declares no AI binding. This slice introduces three firsts: binary handling, a storage RLS policy set, and a Cloudflare AI binding.

## Desired End State

A signed-in user opens the profile dialog and either drops in an image or clicks Generate. Either way a 512×512 avatar appears in the dialog and the topbar within seconds, stored under `avatars/<user_id>/` where no other user can reach it. They can replace it or remove it. If the AI binding is unavailable, the Generate button simply isn't there and upload works exactly as before.

## Key Decisions Made

| Decision         | Choice                                                    | Why                                                                                                                                                                | Source   |
| ---------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| Image provider   | Cloudflare Workers AI `flux-1-schnell`                    | ~$0.0005/image and **no new secret** — the binding is authorized by the Worker, removing the six-step plumbing chain the roadmap flagged as this slice's main risk | Research |
| Bucket access    | Private, four per-operation policies, `<user_id>/` folder | Roadmap requires owner-only; replicates the F-02 pattern rather than inventing one                                                                                 | Plan     |
| Column contract  | `avatar_path`, not `avatar_url`                           | Signed URLs expire, so a persisted URL would rot; store the path and sign on read                                                                                  | Research |
| Upload transport | Raw request body, never `FormData`                        | S-01 abandoned `FormData` after a browser extension clobbered the global constructor; binary can't go through JSON either                                          | Research |
| Sizing           | Normalize to 512×512                                      | Supabase transforms are Pro-only and the 10ms CPU cap rules out in-Worker resizing; client canvas handles uploads, generation requests 512 natively                | Plan     |
| Prompt safety    | Templated with a length cap, no moderation                | The image is private to its owner, so the blast radius of a steered prompt is their own account                                                                    | Plan     |
| Lifecycle        | Replace and remove, old object deleted                    | No orphaned objects accumulate, and the user is never stuck with an image they regret                                                                              | Plan     |
| Private read     | Signed URL in `Topbar.astro`, ~1h                         | No extra Worker invocation per image; an hour outlives any realistic page session                                                                                  | Plan     |
| Testing          | Unit tests for pure logic, manual for DB/storage          | Matches every prior slice; no Supabase mocking convention exists to build on                                                                                       | Plan     |

## Scope

**In scope:** `avatar_path` column, private `avatars` bucket with four RLS policies, upload/remove route, AI generation route behind a rate limiter, avatar UI in the profile dialog and topbar, first cloud migration push.

**Out of scope:** public bucket or CDN caching, avatar history or undo, any server-side image processing, a moderation model, avatars anywhere other than the dialog and topbar, Supabase mocking or route tests.

## Architecture / Approach

```
ProfileDialog (island)          Topbar.astro (SSR)
   └─ AvatarField                  ├─ reads channel_profiles
        ├─ canvas resize 512²      └─ signs avatar_path (~1h) ──> initialAvatarUrl
        ├─ POST raw bytes ──┐
        └─ POST generate ───┤
                            ▼
              /api/avatar · /api/avatar/generate
                 ├─ 401 self-check (middleware covers pages only)
                 ├─ services/avatar.ts  (pure: bounds, prompt, path)
                 ├─ env.AI.run(flux-1-schnell)   [generate only]
                 └─ cookie-scoped client ──> Storage (RLS per-owner folder)
```

Nothing bypasses RLS — the server holds the caller's cookie-scoped client, so both the upload and the generated write land in that user's own folder without a service-role key.

## Phases at a Glance

| Phase                  | What it delivers                                         | Key risk                                                                        |
| ---------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1. Data layer          | Column, bucket, four storage policies, regenerated types | A wrong RLS predicate silently leaks avatars — caught by the two-user check     |
| 2. Pure service module | Shared bounds, prompt template, path scheme, unit tests  | Low — no I/O                                                                    |
| 3. Upload end-to-end   | **A complete, shippable avatar feature**                 | First binary handling in the repo; replace-ordering must not lose the pointer   |
| 4. AI generation       | Binding, generate route, rate limit, Generate button     | Whether `env.AI` is reachable under `astro dev` — the one unverified assumption |
| 5. Deploy              | Schema in the hosted project, smoke test on Workers      | First-ever `supabase db push`; applies all three migrations at once             |

**Prerequisites:** S-01 complete (a saved profile supplies the generation input); local Supabase running; Cloudflare account already wired for deploys.
**Estimated effort:** ~2–3 sessions across five phases, with phases 1–2 short and phase 3 the bulk.

## Open Risks & Assumptions

- The Workers AI binding may not reach remote inference under `astro dev`. Phases 1–3 are provider-independent, so this can only delay generation, never the whole slice; the adapter's `remoteBindings` option is the first remedy, fal.ai-hosted FLUX the documented fallback.
- `flux-1-schnell`'s response shape is expected to be base64 JSON rather than the `ReadableStream` older models return — confirmed in Phase 4 before the glue is written.
- Phase 5 is the project's first cloud schema push; the hosted project has never received `channel_profiles` either, so expect all three migrations to apply together.
- A signed URL is a bearer token for its window. An hour is a deliberate tradeoff against tabs left open, not a security-maximizing choice.

## Success Criteria (Summary)

- A user can set an avatar by upload or generation, replace it, and remove it — and sees it in the topbar immediately.
- No user can read, overwrite or delete another user's avatar, verified with two real JWTs both locally and in production.
- With generation unavailable, upload works unchanged and the UI offers nothing that would fail — which is the Phase 3 state, verified before generation is built.
