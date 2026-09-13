---
date: 2026-09-13T10:02:46+02:00
researcher: Mateusz
git_commit: 03224f645daa7aac5a82f507ced15184c144e692
branch: master
repository: Keitar6/10xDevs-YT-Niche-Adviser
topic: "Channel profile avatar — upload or AI-generated (S-05 / FR-015): codebase evidence + image-provider selection"
tags: [research, codebase, channel-profile, supabase-storage, workers-ai, image-generation, rls, secrets]
status: complete
last_updated: 2026-09-13
last_updated_by: Mateusz
last_updated_note: "Added follow-up research on binary-upload transport constraints in this codebase"
---

# Research: Channel profile avatar — upload or AI-generated

**Date**: 2026-09-13T10:02:46+02:00
**Researcher**: Mateusz
**Git Commit**: `03224f645daa7aac5a82f507ced15184c144e692`
**Branch**: `master`
**Repository**: `Keitar6/10xDevs-YT-Niche-Adviser`

> File references below are local `path:line` (clickable in Claude Code) and are pinned to the commit above.

## Research Question

For `channel-profile-avatar` (roadmap S-05, PRD FR-015): what does the codebase already provide, what must be built, and **which libraries/providers are needed** for (a) user-uploaded avatars and (b) AI-generated avatars derived from `niche` + `sub_niche`?

Scope confirmed with the user: include an external image-generation provider comparison and a recommendation, rather than deferring the provider choice entirely to `/10x-plan`.

## Summary

**Five findings that should shape the plan:**

1. **No new npm dependency is required for either track.** Upload runs on `@supabase/supabase-js` (already installed — `storage-js` ships inside it); AI generation is best served by the **Cloudflare Workers AI binding**, which is config, not a package. The only additions are a shadcn `avatar` primitive (`npx shadcn@latest add avatar`) and a regenerated `database.types.ts`.

2. **Recommended provider: Cloudflare Workers AI `@cf/black-forest-labs/flux-1-schnell`** — ≈ **$0.00063 per 1024×1024 image** (57.6 neurons at $0.011/1k), ~173 free images/day on the free allocation, and — decisively — **no new secret at all**. The binding is authorized by the Worker itself, which deletes the entire six-step secret-plumbing chain the roadmap flagged as this slice's main risk (`context/foundation/roadmap.md:184`). The repo already reads a Cloudflare binding this exact way: `import { env } from "cloudflare:workers"` at `src/pages/api/analyze.ts:15,56`. Third-party alternatives cost 5×–70× more and, for the OpenAI family, are far too slow (30–42 s measured).

3. **`@anthropic-ai/sdk` cannot be reused here** — it is a text/LLM SDK with no image-generation endpoint. `src/lib/services/justify.ts` remains the *structural* template (per-call client, typed `{ok}` result, ordered error branches), not the transport.

4. **`avatar_url` is the wrong column contract for a private bucket.** A private Supabase bucket is read via `createSignedUrl`, which **expires** — persisting a URL would rot. Store the **object path** (`<user_id>/avatar.png`) and sign on read in `Topbar.astro`. PRD `prd.md:127` says "`avatar_url`"; recommend `avatar_path`, or keep the name and document that it holds a path.

5. **Supabase image transformations (server-side resize) require the Pro plan** — unavailable here. Combined with the free-tier **10 ms CPU cap** (`context/foundation/infrastructure.md:55,87`), in-Worker resizing is off the table too (`sharp` is not workerd-compatible). Constrain at the edges instead: bucket-level `file_size_limit` + `allowed_mime_types`, and resize client-side via canvas if a normalized size is wanted.

This slice will introduce **three firsts** for the repo: the first binary/file handling, the first `storage.objects` RLS policy set, and the first Cloudflare AI binding.

## Detailed Findings

### Current profile surface — what the avatar attaches to

The table has no avatar column today. `supabase/migrations/20260909213911_create_channel_profiles.sql:1-11` creates `channel_profiles`; `supabase/migrations/20260912190947_competitors_as_objects.sql` later swaps `competitor_channel_ids text[]` for `competitors jsonb` with a 3–5 length CHECK (`:36-41`). Current columns: `id`, `user_id` (unique, FK to `auth.users`, cascade), `niche`, `sub_niche`, `competitors`, `created_at`, `updated_at`.

- **Types**: `src/types.ts:1-10` only re-exports; the real definitions live in `src/lib/services/channel-profile.ts:13-46`, where `ChannelProfile` is derived from the generated `Row` via `Omit` and the `jsonb` column is narrowed by a zod-validated `parseChannelProfile()` that returns `null` on failure. An avatar field threads through the same spot.
- **Write path**: `src/pages/api/profile.ts` exports a single `POST` that upserts on `user_id` (`:91-108`). There is **no `GET /api/profile`** — the read happens server-side in `src/components/Topbar.astro:8-12`, which then hydrates `<ProfileDialog client:load />` (`:29`). **The avatar must be surfaced from `Topbar.astro`**, which is also where a signed URL would have to be minted per request.
- **UI**: only two files — `src/components/profile/ProfileDialog.tsx` (Radix dialog, owns `open`/`profile` state) and `src/components/profile/ChannelProfileForm.tsx` (plain `fetch` to `/api/profile`, hand-mirrored client validation, inline banners via `src/components/auth/ServerError.tsx`, pending state via `SubmitButton`). `sonner`'s `Toaster` is mounted globally (`src/layouts/Layout.astro:45`) but the profile feature never calls `toast()`.
- **shadcn inventory** — `src/components/ui/` holds exactly `LibBadge.astro`, `button.tsx`, `card.tsx`, `dialog.tsx`, `skeleton.tsx`, `sonner.tsx`. `dialog` and `skeleton` are reusable as-is; **`avatar` is missing** and `input` does not exist at all (forms use a hand-rolled `src/components/auth/FormField.tsx` around a raw `<input>`).
- **Hooks**: `src/components/hooks/` contains only `.gitkeep` — an upload hook would be the project's first. Note the mismatch: `components.json` aliases `hooks` to `@/hooks`, but the actual folder is `src/components/hooks/`. Worth reconciling before adding one.

### Storage: enabled, but nothing exists yet

`supabase.storage` is **never called** anywhere in `src/` or `supabase/`. The service is on locally — `supabase/config.toml:114-117` sets `[storage] enabled = true` with `file_size_limit = "50MiB"`, S3 protocol enabled, and **image transformation commented out with the note that it is Pro-plan only** (`:131-133`). The commented `[storage.buckets.images]` block (`:120-125`, modelling `public`, `file_size_limit`, `allowed_mime_types`, `objects_path`) is a near-exact template for an `avatars` bucket.

No `storage.objects` policy exists in either migration. The per-owner-folder idiom to replicate (Supabase docs, via Context7) is:

```sql
-- restrict to the top-level folder named after the caller's uid
using (bucket_id = 'avatars' and (select auth.uid()::text) = (storage.foldername(name))[1])
```

…but split into **four granular per-operation policies**, matching F-02's shape (`supabase/migrations/20260909213911_create_channel_profiles.sql:13-28`), which the roadmap explicitly instructs this slice to copy (`context/foundation/roadmap.md:184`).

**No service-role client exists** (`src/lib/supabase.ts` exports one cookie-scoped `createClient(headers, cookies)` returning `null` when unconfigured; `SUPABASE_KEY` is the publishable/anon key). That is fine and preferable: the server already holds the user's cookie-scoped client, so it can upload into that user's own folder under RLS — **both the upload and the AI-generated write can go through RLS with no privilege escalation.**

### Secrets and degradation — the pattern this slice must follow

`astro.config.mjs:17-24` declares all four secrets identically: `envField.string({ context: "server", access: "secret", optional: true })`. `optional: true` is deliberate — it is what enables degradation instead of an import-time throw.

The degradation ladder has three rungs already in use:

| Depth | Example | Behaviour |
|---|---|---|
| Hard fail | `src/pages/api/analyze.ts:64-66` | missing `YOUTUBE_API_KEY` → 500, feature cannot run |
| Soft degrade | `src/pages/api/analyze.ts:163-182` | missing `ANTHROPIC_API_KEY` → still 200, `summary.justifications_available: false` + `justifications_error` |
| Partial capability | `src/pages/api/profile.ts:58-89` | missing key → handles rejected, literal IDs still accepted; "profile editing keeps working" |

`src/lib/config-status.ts` is the registry; `src/layouts/Layout.astro:24-38` renders one banner per missing config automatically. **FR-015's required behaviour — degrade to upload-only when generation is unavailable — is the "partial capability" rung.** Choosing Workers AI changes the *shape* of this check: there is no key to test, so the guard becomes "is the `AI` binding present?" rather than "is the secret set" — simpler, but it still needs a `configStatuses` entry or an equivalent so the UI can hide/disable the Generate button.

Pure service modules must **not** import `astro:env/server` — secrets are passed in as parameters (documented at `src/lib/services/youtube-ids.ts:5` and `src/lib/services/scoring.ts:4`; applied at `src/pages/api/profile.ts:60`).

### Binary handling — a genuine first

Grep across `src/` for `formdata|multipart|base64|blob|arraybuffer` found **no file/binary handling at all**. The only `formData()` uses are text fields in `src/pages/api/auth/{signin,signup,google}.ts`. So the upload endpoint has no in-repo precedent beyond "`context.request.formData()` inside an `APIRoute`, zod-validate everything, self-check `locals.user`".

`src/middleware.ts` sets `context.locals.user` on every request but `PROTECTED_ROUTES = ["/dashboard"]` does **not** cover `/api/*` — every avatar route must return its own 401, as codified in CLAUDE.md after impl-review finding F8.

### Provider comparison (external research)

Anthropic has no image API, so this is a genuinely new provider decision. Latency figures below are from an independent 33-model benchmark (komelin.com, updated 2026-07-10); prices are per 1024-class image.

| Option | Price/image | Latency | New secret? | Workers fit |
|---|---|---|---|---|
| **CF Workers AI `flux-1-schnell`** | **≈$0.00063** (4.8 neurons/tile + 9.6/step) | seconds (schnell = 4 steps) | **none** — binding | native binding, same idiom as `RATE_LIMITER` |
| CF Workers AI `leonardo/phoenix-1.0` | ≈$0.023/1024px | — | none | same; better text-in-image, ~37× costlier |
| fal.ai / Replicate FLUX schnell | $0.003 | ~3–9 s | yes | plain `fetch` + bearer |
| `bfl/flux-2-klein-9b` | $0.015 | **2.9 s** (fastest benchmarked) | yes | plain `fetch` |
| Google Imagen 4 Fast | $0.02 | 5.7 s | yes (GCP/Vertex setup) | REST |
| OpenAI `gpt-image-1.5` / `-2` | $0.024–$0.045 | **32–37 s** | yes | REST, but latency disqualifies |

**Recommendation: `@cf/black-forest-labs/flux-1-schnell` via the Workers AI binding**, with fal.ai-hosted FLUX schnell documented as the fallback if quality or the local-dev story disappoints. Rationale: it is ~5× cheaper than the cheapest aggregator and ~70× cheaper than gpt-image; the free allocation (10,000 neurons/day) covers ~173 images/day at 1024², comfortably above MVP volume; and it removes the new-secret risk entirely — no `.dev.vars` entry, no CI `env:` block, no `wrangler secret put`, and therefore no chance of the ungated auto-deploy on `master` shipping a silently broken feature (`context/foundation/infrastructure.md`, `.github/workflows/ci.yml:25-30`).

Avatars are small, stylized, text-free images — precisely the workload where schnell-class quality is indistinguishable from premium tiers, and where a 30-second gpt-image round-trip would be user-hostile.

**Cost of the recommendation, concretely:** 1024×1024 at 4 steps = (4 tiles × 4.8) + (4 steps × 9.6) = 57.6 neurons ≈ $0.00063. At 512×512 = 43.2 neurons ≈ $0.00048. Even 1,000 regenerations cost under $1.

### Libraries needed — direct answer

**Already present, nothing to install:**

| Need | Covered by | Evidence |
|---|---|---|
| Storage upload / signed URLs | `@supabase/supabase-js@^2.99.1` (bundles `storage-js`) | `package.json:24` |
| Input validation | `zod@^4.4.3` | `package.json:38` |
| Dialog / skeleton / button / card | `radix-ui` + existing `src/components/ui/` | `src/components/ui/` |
| Toasts (if wanted) | `sonner@^2.0.8`, already mounted | `src/layouts/Layout.astro:45` |
| Cloudflare binding access | `wrangler@^4.126.0` + `cloudflare:workers` | `src/pages/api/analyze.ts:15` |

**To add:**

- `npx shadcn@latest add avatar` — the display primitive (and optionally `input` / `progress` for the upload control).
- `wrangler.jsonc`: an `"ai": { "binding": "AI" }` entry. Today the file has only `ASSETS` and the `RATE_LIMITER` `ratelimits` entry — no `ai`, `r2_buckets`, `kv_namespaces`, or `images` binding exists.
- One new timestamped migration: `avatar_path` column + `avatars` bucket + four `storage.objects` policies.
- `npm run db:types` afterwards to regenerate `src/lib/database.types.ts` (generated, never hand-edited).

**Explicitly not needed:** any image-generation SDK (the Workers AI binding is dependency-free; a third-party fallback is a bare `fetch`), and any image-processing library — **`sharp` is not workerd-compatible** and the 10 ms free-tier CPU cap rules out in-Worker pixel work regardless.

## Code References

- `supabase/migrations/20260909213911_create_channel_profiles.sql:13-28` — the four-policy RLS template to replicate for `storage.objects`
- `supabase/migrations/20260912190947_competitors_as_objects.sql:36-41` — precedent for adding a CHECK constraint in a follow-up migration
- `supabase/config.toml:114-133` — storage enabled, 50 MiB cap, bucket template, Pro-only transformations
- `src/lib/supabase.ts:6-9` — the single cookie-scoped client; returns `null`, never throws
- `src/middleware.ts` — `PROTECTED_ROUTES = ["/dashboard"]`; `/api/*` is not covered
- `src/pages/api/profile.ts:31-34` — the 401 self-check every API route repeats
- `src/pages/api/profile.ts:36-41` — guarded `request.json()` (impl-review F3)
- `src/pages/api/profile.ts:58-89` — partial-capability degradation on a missing key
- `src/pages/api/analyze.ts:15,56` — `import { env } from "cloudflare:workers"`; the binding idiom to reuse for `env.AI`
- `src/pages/api/analyze.ts:163-182` — soft-degrade shape (`*_available` + `*_error` in a 200 response)
- `src/lib/services/justify.ts:108-148` — per-call client, typed `{ok:true}|{ok:false,message}`, ordered `RateLimitError → APIConnectionError → APIError → generic`
- `src/lib/services/channel-profile.ts:13-46` — zod-narrowed row parsing; where an avatar field threads through
- `src/lib/config-status.ts` + `src/layouts/Layout.astro:24-38` — the automatic missing-config banner
- `src/components/Topbar.astro:8-12,29` — the SSR profile read and island hydration; the avatar's render site
- `src/components/profile/ChannelProfileForm.tsx:61-93` — the `fetch` submit pattern (now with the F2 `catch`)
- `wrangler.jsonc` — bindings inventory; where `"ai"` would go
- `astro.config.mjs:17-24` — env schema; all secrets `optional: true`

## Architecture Insights

- **RLS-first, never service-role.** Every data path runs through the cookie-scoped anon client and relies on row-level policies. Storage should follow suit — there is no admin client to reach for, and introducing one would be a genuine architectural regression.
- **Degrade, don't throw.** Missing capability produces a 200 with a named reason, or a narrowed feature, plus a global banner. Thrown exceptions are reserved for genuine call failures, and even those are converted to typed results before reaching a route.
- **Pure modules stay pure.** `src/lib/services/*` takes credentials as parameters; only routes and shared singletons import `astro:env/server`.
- **Server reads, island writes.** The profile is read in an `.astro` component and passed as props into a `client:load` island; mutations go back through `fetch` to `/api/*`. The avatar should not break this — the signed URL is minted server-side.
- **Bindings over secrets.** `RATE_LIMITER` set the precedent that platform capability arrives as a binding read from `cloudflare:workers`, not as a key. Workers AI extends the same pattern.

## Historical Context (from prior changes)

- `context/foundation/prd.md:126-127` — FR-015 and the 2026-09-13 decision: the automatic track is **AI image generation**, not a deterministic SVG.
- `context/foundation/roadmap.md:170-185` — S-05 definition, prerequisite S-01, open unknowns (provider unchosen; same-bucket-or-not; one-shot vs regenerable), and the instruction to replicate F-02's RLS pattern and `/api/profile`'s degradation.
- `context/changes/channel-profile-data-model/plan.md:62-106` — the verbatim F-02 migration, verified manually via curl with two users' JWTs (no pgTAP).
- `context/changes/channel-profile-crud/reviews/impl-review.md` — F1–F8, all resolved. The four that bind here: **F1** client/server validation must mirror; **F2** every client `fetch` needs a `catch`, not just `finally`; **F3** guard body parsing and always return the JSON error envelope; **F4** never let a read error look like "no row" when the write is a destructive upsert (`Topbar.astro` already carries `loadFailed` for this — the avatar read must not reintroduce the conflation).
- `context/changes/analyze-and-rank-opportunities/yt-library-research.md` — the methodology this document's provider table follows: per-capability scoring against named criteria with a verdict and evidence per row.
- `context/changes/analyze-and-rank-opportunities/plan.md:412-414` — precedent that external-API clients are **not** unit-tested; only pure logic is.
- `context/foundation/infrastructure.md:54-55,76-87` — `nodejs_compat` is not full parity (a transitive dep can fail only in production); 10 ms free-tier CPU cap; `observability.enabled: true` is already on and should be reused for latency verification.

## Related Research

- `context/changes/analyze-and-rank-opportunities/research.md` — internal research for S-02; source of the "four-policy RLS pattern to replicate" note and the secret-plumbing checklist.
- `context/changes/analyze-and-rank-opportunities/yt-library-research.md` / `yt-api-docs.md` — the two-document split (library selection vs. literal API contract) worth mirroring if the provider decision needs its own artifact.

## Open Questions

1. **Private bucket + signed URLs, or public bucket with owner-scoped writes?** The roadmap says "accessible only to the owner", which mandates private and therefore per-request `createSignedUrl` in `Topbar.astro` (plus an expiry choice). A public bucket with write-only RLS is simpler and is the common avatar pattern, but contradicts the stated outcome. Owner: user. Blocking for the migration's `public` flag.
2. **Column contract.** Store the object path, not a signed URL (which expires). Recommend `avatar_path`; PRD says `avatar_url`. Owner: user. Non-blocking, but must be settled before the migration.
3. **Does the Workers AI binding work under `astro dev`?** `@astrojs/cloudflare` runs through the Vite plugin and exposes a `remoteBindings` option; AI inference always executes remotely. This must be verified hands-on early — it is the single biggest execution risk in the recommendation. Owner: implementer. Non-blocking for planning, blocking for Phase 1 verification.
4. **`flux-1-schnell` response shape.** Expected to be JSON with a base64 `image` field, while older Stable Diffusion models return a `ReadableStream`. Confirm against the model page before writing the upload glue. Owner: implementer.
5. **Generation trigger and cost control.** On-demand button vs. automatic at profile save; is regeneration unlimited? A `ratelimits` binding already exists for `/api/analyze` and a second namespace would be the cheap guard. Owner: user.
6. **Sizing.** No Supabase transforms (Pro-only) and no in-Worker resize (CPU cap). Either cap uploads hard at the bucket (`file_size_limit`, `allowed_mime_types`) and render with CSS, or resize client-side on canvas before upload. Owner: user.
7. **Prompt safety.** `niche` / `sub_niche` are free user text flowing straight into an image prompt — an injection and NSFW surface with no moderation layer on `flux-1-schnell`. Needs at minimum a templated prompt with the user text constrained, and a decision on whether that is sufficient for the MVP. Owner: user.
8. **Testing.** No Supabase mock exists anywhere in the repo, and prior slices verified DB/storage paths manually. Either establish the first mocking convention, or stay manual-only per project precedent. Owner: user.

## Follow-up Research 2026-09-13

Two constraints surfaced from `context/changes/channel-profile-crud/plan.md` after the body above was written. Both change *how* the upload is built, not whether it is feasible.

### `FormData` is a known landmine in this codebase

`context/changes/channel-profile-crud/plan.md:32` records that S-01 **tried `FormData` and abandoned it**: a browser extension observed during testing clobbered the global `FormData` constructor at runtime, so the profile form sends JSON instead. That workaround does not extend to an avatar — binary bytes cannot go through `JSON.stringify`.

**Resolution:** send the file as a **raw request body** — `fetch(url, { method: "POST", body: file, headers: { "Content-Type": file.type } })` — and read it server-side with `await context.request.arrayBuffer()`. This never constructs a `FormData` on either side, sidestepping the interference class entirely, and it is simpler than multipart parsing. The MIME type arrives in `Content-Type` and the size is the byte length; both are validated server-side regardless of what the client claimed.

This supersedes the note in "Binary handling — a genuine first" above, which suggested `context.request.formData()` as the only in-repo precedent. The precedent exists, but S-01's recorded experience argues against following it here.

### React 19 form actions are broken inside Radix `Dialog`

`context/changes/channel-profile-crud/plan.md:31` records that React 19 function form `action` props do not work inside a Radix `Dialog`. The avatar UI lives in exactly that dialog (`src/components/profile/ProfileDialog.tsx`), so it must use a plain `onChange`/`onClick` handler with `e.preventDefault()`, and reuse `SubmitButton`'s existing `pending` prop override (`src/components/auth/SubmitButton.tsx`) rather than `useFormStatus()`. `ChannelProfileForm.tsx:61-93` is the working precedent.

### Additional infrastructure note

`context/foundation/infrastructure.md:85` prescribes an early smoke-test deploy, and `context/changes/channel-profile-data-model/plan.md` deliberately deferred pushing migrations to the hosted Supabase project ("cloud push deferred until a slice needs it live"). This slice is that moment — `npx supabase db push` will apply **both** prior migrations plus this one, and the storage bucket and its policies must be verified in the hosted project, not only locally.
