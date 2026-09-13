---
date: 2026-09-13T10:00:23+02:00
researcher: Mateusz
git_commit: 03224f645daa7aac5a82f507ced15184c144e692
branch: master
repository: YT-Niche-Adviser
topic: "What does the codebase already do for the landing page and the auth shell, and what does it force on the S-04 plan?"
tags: [research, codebase, internal, s-04, landing, auth, dialog, radix, oauth, astro-islands, cosmic-theme]
status: complete
research_type: internal
last_updated: 2026-09-13
last_updated_by: Mateusz
---

# Research: landing page + auth shell (S-04, `landing-and-auth-shell`)

**Date**: 2026-09-13T10:00:23+02:00
**Researcher**: Mateusz
**Git Commit**: `03224f6`
**Branch**: master
**Repository**: YT-Niche-Adviser

## Research Question

Internal research for roadmap slice **S-04** (`landing-and-auth-shell`, PRD FR-013 + FR-014): what does the codebase already do for (a) the landing surface still advertising the starter template, and (b) sign-in / sign-up / sign-out, which must move from standalone routes into a dialog consistent with the existing channel-profile dialog?

This answers *"what does our codebase already do, and what does it force on the plan"* — not *"what should we build with"*. There is no external counterpart for this slice: it adds no library, no secret, no integration.

## Summary

FR-013 is nearly trivial. FR-014 is not, and the gap between them is the whole story of this slice.

**FR-013 (landing copy)** is a contained content edit across three files. The starter copy lives in exactly four visible places (`Layout.astro:11` default title, `Welcome.astro:35`, `:37-39`, and three feature cards at `:74-77`, `:97-100`, `:119-122`), plus non-visible leftovers (`README.md`, `config-status.ts:16`, `public/template.png`). No SEO/OG metadata exists at all today, so "communicates product value" can be read narrowly (hero + cards) or widened to include `<meta name="description">` / `og:*` — that is a scope call, not a technical obstacle.

**FR-014 (auth in a dialog)** collides with the current architecture in three specific ways, each already documented as a hard-won lesson in this repo:

1. **The auth forms are native full-page POSTs.** `SignInForm.tsx:43` and `SignUpForm.tsx:66` are `<form method="POST" action="/api/auth/signin">`; the React `onSubmit` only calls `preventDefault()` when *client* validation fails. Inside a Radix dialog, a native submit navigates the page and destroys the dialog. They must become `preventDefault()` + `fetch` + JSON — which in turn means `/api/auth/signin` and `/api/auth/signup` must stop answering with `302 → ?error=` and start answering with JSON, mirroring `/api/profile`.
2. **All error state today lives in the URL.** Every failure path redirects to `/auth/{signin,signup}?error=<encoded message>`, which the Astro page reads once at SSR (`signin.astro:6`) and passes down as `serverError`. A dialog on an arbitrary page has no per-request read point, so error state must move into the fetch response body and React state.
3. **Google OAuth cannot be contained in a dialog at all.** `google.ts:20` hands Supabase `redirectTo: ${context.url.origin}/api/auth/callback?origin=${origin}`, and the browser leaves the app for Google's consent screen. The `origin` param is an allowlist of exactly `"signin" | "signup"` (`google.ts:4`, `callback.ts:4`) — it exists only to pick which *page* to show an error on. Once those pages stop being the auth surface, that param needs a different meaning (return path, or "reopen the dialog in state X"). **There is no `next`/return-path plumbing anywhere in the codebase**: `callback.ts:26`, `signin.ts:19` and `signout.ts:9` all hardcode `/`, and `middleware.ts:20` redirects to `/auth/signin` with no memory of where the user was headed.

Two decisions from previous slices are load-bearing and non-negotiable here:

- **React 19 function form actions are broken inside Radix `Dialog`** — discovered during S-01 and the reason `ChannelProfileForm` uses a plain `onSubmit` handler. Radix's dismissable-layer outside-click detection and React's action transition batching interact badly: the dialog closes and the in-flight fetch aborts. (`context/changes/channel-profile-crud/plan.md:29-31`)
- **Every fetch-based form needs a real `catch`** that sets a readable error — S-01 impl-review finding **F2**, plus **F3**: every route parsing a body must wrap it and return `jsonError(...)` rather than throwing an HTML 500 that makes `res.json()` blow up client-side. (`context/changes/channel-profile-crud/reviews/impl-review.md`)

The dialog pattern to copy is fully worked out and directly reusable: `ProfileDialog.tsx` (self-contained `useState` open/close, `DialogTrigger asChild`) + `ChannelProfileForm.tsx` (fetch/JSON submit, `saving` flag into `SubmitButton pending`, `ServerError` inline, inline success banner, no auto-close). `FormField`, `SubmitButton`, `ServerError` already live under `src/components/auth/` and are already shared by both features.

One structural surprise worth flagging early: **`Topbar.astro` is not part of `Layout.astro`.** It is imported individually by `Welcome.astro:2,28` and `dashboard.astro:3,11` only — the three `/auth/*` pages render without it. Any "consistent app shell with auth in the top bar" outcome has to decide whether Topbar moves into the layout.

## Detailed Findings

### A. Landing surface — what still says "starter" (FR-013)

`src/pages/index.astro` is an 8-line pass-through: it renders `<Layout><Welcome /></Layout>` with no props, so the page inherits the default title. There is **no logged-in/logged-out branching in `index.astro` itself** — all of it happens one level down inside `Topbar.astro`, which `Welcome.astro:28` mounts.

Visible starter copy, exhaustively:

| Location | Content |
|---|---|
| `src/layouts/Layout.astro:11` | `const { title = "10x Astro Starter" } = Astro.props;` — the `<title>` for `/` |
| `src/components/Welcome.astro:35` | H1 hero: `10x Astro Starter` |
| `src/components/Welcome.astro:37-39` | Subcopy: "A production-ready starter with authentication, modern tooling, and a cosmic developer experience." |
| `src/components/Welcome.astro:74-77` | Card 1: "Authentication Ready" / Supabase auth out of the box |
| `src/components/Welcome.astro:97-100` | Card 2: "Modern Stack" / "Astro 5, React 19, Tailwind 4…" — also factually stale, the repo is Astro 6 |
| `src/components/Welcome.astro:119-122` | Card 3: "Developer Experience" / ESLint, Prettier, pre-commit hooks |

Non-visible leftovers in the same family: `README.md:1,3,5,9-14,25-27` (title, `public/template.png` screenshot, the starter's clone URL), and `src/lib/config-status.ts:16`, which points users at `https://github.com/przeprogramowani/10x-astro-starter#supabase-configuration` from a **live runtime banner** — that one is user-visible when Supabase is unconfigured, so it belongs in scope even though it is not landing copy.

`src/layouts/Layout.astro:16-21` contains only `charset`, `viewport`, `favicon.png`, and `<title>`. **No `<meta name="description">`, no `og:*`, no `twitter:*` anywhere in `src/`** — and no OG image asset. `public/` holds exactly three files: `.assetsignore`, `favicon.png` (wired at `Layout.astro:19`), and `template.png` (1492×470, referenced only from README).

`src/components/ui/LibBadge.astro` exists but is imported nowhere — dead starter code in the same cleanup family.

### B. The auth shell as it stands today (FR-014)

**Submission is native, not fetch.** Both forms declare `method="POST" action="/api/auth/…"` (`SignInForm.tsx:43`, `SignUpForm.tsx:66`) with `noValidate`, and their `onSubmit` handlers only intervene to cancel:

```tsx
// SignInForm.tsx:36-40
function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
  if (!validate()) {
    e.preventDefault();
  }
}
```

Inputs are controlled (`FormField.tsx:42-49`). Validation is hand-rolled per component — email regex + required password (`SignInForm.tsx:18-30`), email + `MIN_PASSWORD_LENGTH = 6` + confirm-match (`SignUpForm.tsx:8,22-45`) — duplicated between the two files and **with no server-side counterpart at all**: `signin.ts:5-7` and `signup.ts:5-7` read `formData` and cast to `string` without zod, in violation of the CLAUDE.md "validate input with zod" convention that `/api/profile` does follow.

`SubmitButton.tsx:13-14` reads `useFormStatus()` but takes an explicit `pending` prop that wins (`const pending = pendingProp ?? formPending`). Under the current native-POST path the spinner is effectively decorative (the page navigates away); under a fetch path the caller passes `pending` explicitly, exactly as `ChannelProfileForm.tsx:186` already does.

**Errors travel as a URL query param.** Every failure in `signin.ts`, `signup.ts`, `google.ts` and `callback.ts` redirects with `?error=${encodeURIComponent(...)}`, e.g.:

```ts
// src/pages/api/auth/signin.ts:15-16
if (error) {
  return context.redirect(`/auth/signin?error=${encodeURIComponent(error.message)}`);
}
```

read back once at SSR time (`signin.astro:6`, `signup.astro:6`) and rendered by `ServerError.tsx:7-15`. There is **no error-code → message mapping**: what reaches the user is whatever `error.message` the Supabase SDK produced, plus four hardcoded app strings — `"Supabase is not configured"` (signin.ts:11, signup.ts:11, google.ts:14, callback.ts:17), `"Google sign-in failed to start"` (google.ts:29), `"Missing OAuth code"` (callback.ts:12).

**Success paths** (all use Astro's default 302; none set a status explicitly):

| Endpoint | On success |
|---|---|
| `POST /api/auth/signin:19` | `redirect("/")` |
| `POST /api/auth/signup:19` | `redirect("/auth/confirm-email")` — unconditional, regardless of whether confirmation is actually required |
| `POST /api/auth/google:33` | `redirect(data.url)` → Google consent |
| `GET /api/auth/callback:26` | `redirect("/")` |
| `POST /api/auth/signout:9` | `redirect("/")` |

`src/pages/auth/confirm-email.astro:4-18` is a static dead-end: it branches only on `import.meta.env.DEV` to say either "you can sign in now" (local Supabase auto-confirms) or "check your email", and links back to `/auth/signin:31`. It has no session awareness and no polling.

**Middleware** (`src/middleware.ts`) resolves the user on every request (`:7-16`, `locals.user = user ?? null`, explicitly `null` when Supabase is unconfigured) and guards `PROTECTED_ROUTES = ["/dashboard"]` (`:4`) by prefix, redirecting to `/auth/signin` (`:20`) with no return-path parameter. `/api/*` is deliberately not covered — per CLAUDE.md and S-01 finding F8, each API route self-guards. There is no redirect-away-if-already-signed-in rule for `/auth/*`.

### C. Google OAuth — the part that cannot move into a dialog

```ts
// src/pages/api/auth/google.ts:4, 17-25
const ALLOWED_ORIGINS = new Set(["signin", "signup"]);
…
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: "google",
  options: {
    redirectTo: `${context.url.origin}/api/auth/callback?origin=${origin}`,
    queryParams: { prompt: "select_account" },
  },
});
```

- The origin is derived from the incoming request (`context.url.origin`), a deliberate decision from F-01 to avoid introducing a `PUBLIC_SITE_URL` env var given there is no fixed custom domain (`context/archive/2026-09-08-google-oauth-login/plan.md:35,42`). The consequence is that Supabase's Redirect-URLs allowlist must carry both dev and prod origins as `<origin>/**`.
- `origin` is a two-value allowlist re-validated on the way back (`callback.ts:4,8`). It exists **only for error routing** — `callback.ts:26` ignores it entirely on success and sends everyone to `/`. It was added as the fix for plan-review finding F2 in F-01 (errors from the signup page used to land on signin).
- `prompt: "select_account"` was added deliberately: without it, a returning user is silently re-authenticated into the same Google account because Google's SSO cookie outlives this app's sign-out (`context/archive/2026-09-08-google-oauth-login/change.md:15`).
- **Open gap carried over from F-01**: Google's own `?error=access_denied&error_description=…` on consent denial is never read; `callback.ts:11-13` falls through to "Missing OAuth code". This was impl-review finding **F1**, consciously SKIPPED, and the S-02 research flagged it as a recurring shape ("a third-party provider's own error code going unsurfaced"). S-04 rewrites this surface and should decide explicitly whether to keep carrying it.
- `GoogleSignInButton.astro` is intentionally a plain Astro `<form method="POST">` with a hidden `origin` input and no JS (`plan.md:12,118` of F-01) — justified because it is a pure full-page-redirect trigger. That justification survives a move into a dialog (the redirect is unavoidable), but the component now has to be renderable *inside* a React island, which an `.astro` file cannot be. Either the markup is duplicated in TSX or the dialog is composed in Astro with a React island inside it.

### D. The dialog pattern to copy

`src/components/profile/ProfileDialog.tsx` is the reference implementation and is self-contained: `useState(false)` at `:12`, wired at `:24` as `<Dialog open={open} onOpenChange={setOpen}>`, trigger is `DialogTrigger asChild` around a plain button at `:25-28`. The Astro side passes only *data* (`Topbar.astro:29` — `<ProfileDialog initialProfile={profile} loadFailed={!!profileError} client:load />`), never open state. Radix supplies focus trap, ESC, overlay-dismiss, animations and the corner close button (`ui/dialog.tsx:29,51,57-65`).

Notably, **it does not close on success** (`ProfileDialog.tsx:36-38` only updates local state) — the form shows an inline green banner instead.

`src/components/profile/ChannelProfileForm.tsx:61-93` is the submit contract to mirror:

```tsx
async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
  e.preventDefault();
  setSaved(false); setServerError(null);
  if (!validate()) return;
  setSaving(true);
  try {
    const res = await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ … }),
    });
    const json: { profile?: ChannelProfile; error?: string } = await res.json();
    if (!res.ok || !json.profile) { setServerError(json.error ?? "Something went wrong"); return; }
    setSaved(true); onSaved(json.profile);
  } catch {
    setServerError("Could not reach the server. Check your connection and try again.");
  } finally {
    setSaving(false);
  }
}
```

JSON body, not `FormData` — switched during S-01 after a browser extension was observed clobbering the global `FormData` constructor at runtime (`channel-profile-crud/plan.md:32`). The `catch` arm is finding F2 made permanent.

**Toasts**: `Toaster` is mounted once at `Layout.astro:45` with `client:only="react"` (SSR of sonner throws an invalid-hook-call — comment at `:41-44`), hardcoded dark theme in `ui/sonner.tsx:10-31`. The only caller in the codebase is `AnalyzePanel.tsx:63` (`toast.error`). **`toast.success` is never used** — the established convention is inline success banners, toasts only for async failures.

**Hydration**: only two directives exist anywhere — `client:load` on the four interactive islands (`Topbar.astro:29`, `dashboard.astro:24`, `signin.astro:23`, `signup.astro:23`) and `client:only="react"` for the Toaster. No `client:idle` / `client:visible` / `client:media` anywhere.

**`src/components/hooks/` is empty except `.gitkeep`** — no shared form/fetch hook exists. Both `ChannelProfileForm` and the two auth forms hand-roll their own submit/validate/error state independently. If the auth dialog wants shared logic, CLAUDE.md points it at that directory.

### E. Design vocabulary ("cosmic")

Only one bespoke token exists in CSS:

```css
/* src/styles/global.css:113-115 */
@utility bg-cosmic {
  background-image: linear-gradient(to bottom, #0a0e1a, #0f1529, #0a0e1a);
}
```

Everything else in `global.css` is stock shadcn "new-york" OKLCH tokens (`:root` `:6-39`, `.dark` `:41-73`, `@theme inline` `:75-111`) — unmodified greys, plus a global `cursor: pointer` for enabled buttons at `:117-127` (disclosed retroactively as S-01 finding F5). `@custom-variant dark (&:is(.dark *))` at `:4` means dark mode is class-triggered, and **nothing in the app ever sets `.dark`** — the cosmic look is achieved entirely by inline utilities on a dark gradient, not by the theme system.

The repeated vocabulary, already consistent across 8 files:

- page ground: `bg-cosmic` — `Welcome.astro:5`, `dashboard.astro:10`, `signin.astro:10`, `signup.astro:10`, `confirm-email.astro:22`
- glass card: `border border-white/10` + `bg-white/10` (or `/5` for nested) + `backdrop-blur-xl` — `dashboard.astro:13`, `Welcome.astro:58,80,103`, `ProfileDialog.tsx:30`, `AnalyzePanel.tsx:104`, `OpportunityList.tsx:32`
- gradient heading: `bg-gradient-to-r from-blue-200 to-purple-200 bg-clip-text text-transparent` (`dashboard.astro:14`; `Welcome.astro:33` adds `via-purple-200 to-pink-200`)
- accent roles: purple = interactive, `text-blue-100/{80,60,50}` = muted, red-300/500/900 = error (`ServerError.tsx:11`), green-300/500/900 = success (`ChannelProfileForm.tsx:179`), amber = warning (`AnalyzePanel.tsx:35`)
- inputs: `FormField.tsx:5-6` `inputBase`, conditional border/ring merged via `cn()` at `:51-54`
- buttons: purple override on the shadcn base (`SubmitButton.tsx:20`), not a new `cva` variant

`cn()` is used inside the shadcn primitives and `FormField`; app-level components mostly hardcode class strings and only reach for `cn()` when merging conditionally.

### F. The full change surface — every entry point that references the auth routes

```
src/components/Welcome.astro:42      href="/auth/signin"     (hero CTA)
src/components/Welcome.astro:48      href="/auth/signup"     (hero CTA)
src/components/Topbar.astro:41       href="/auth/signin"     (anonymous branch)
src/components/Topbar.astro:44       href="/auth/signup"     (anonymous branch)
src/pages/auth/signin.astro:25       href="/auth/signup"     (cross-link)
src/pages/auth/signup.astro:25       href="/auth/signin"     (cross-link)
src/pages/auth/confirm-email.astro:31 href="/auth/signin"    (dead-end back-link)
src/middleware.ts:20                 redirect("/auth/signin") (protected-route guard)
src/pages/api/auth/signin.ts:11,16   redirect("/auth/signin?error=…")
src/pages/api/auth/signup.ts:11,16   redirect("/auth/signup?error=…")
src/pages/api/auth/signup.ts:19      redirect("/auth/confirm-email")
src/pages/api/auth/google.ts:14,29   redirect("/auth/${origin}?error=…")
src/pages/api/auth/callback.ts:12,17,23 redirect("/auth/${origin}?error=…")
```

`Topbar.astro` (51 lines) is the one file both requirements touch. Its authenticated branch shows `user.email` (`:24`), a `/dashboard` link (`:26-28`), `<ProfileDialog … client:load />` (`:29`), and sign-out as a bare form:

```astro
<!-- src/components/Topbar.astro:30-34 -->
<form method="POST" action="/api/auth/signout">
  <button type="submit" class="text-purple-300 transition-colors hover:text-purple-100 hover:underline">
    Sign out
  </button>
</form>
```

It also performs its own Supabase query for the channel profile (`:8-15`) and is the **only** place the profile is read — `dashboard.astro` does not load it.

## Code References

- [`src/components/Welcome.astro:35`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/03224f645daa7aac5a82f507ced15184c144e692/src/components/Welcome.astro#L35) — starter H1; `:37-39` subcopy; `:74-122` three feature cards; `:42,48` the only auth CTAs on the landing page
- [`src/layouts/Layout.astro:11`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/03224f645daa7aac5a82f507ced15184c144e692/src/layouts/Layout.astro#L11) — `title = "10x Astro Starter"` default; `:16-21` the entire `<head>` (no description/OG); `:45` Toaster `client:only`
- [`src/components/Topbar.astro:30-34`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/03224f645daa7aac5a82f507ced15184c144e692/src/components/Topbar.astro#L30-L34) — sign-out as a bare `form method="POST"`; `:29` ProfileDialog island; `:41,44` anonymous sign-in/up links
- [`src/components/auth/SignInForm.tsx:43`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/03224f645daa7aac5a82f507ced15184c144e692/src/components/auth/SignInForm.tsx#L43) — native POST form; `:18-30` hand-rolled validation; `:36-40` submit handler that only cancels
- [`src/pages/api/auth/signin.ts:15-16`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/03224f645daa7aac5a82f507ced15184c144e692/src/pages/api/auth/signin.ts#L15-L16) — the `?error=` redirect idiom; `:5-7` unvalidated `formData` casts; `:19` success → `/`
- [`src/pages/auth/signin.astro:6`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/03224f645daa7aac5a82f507ced15184c144e692/src/pages/auth/signin.astro#L6) — `Astro.url.searchParams.get("error")`, the SSR read point a dialog does not have
- [`src/pages/api/auth/google.ts:17-25`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/03224f645daa7aac5a82f507ced15184c144e692/src/pages/api/auth/google.ts#L17-L25) — `signInWithOAuth` with request-derived `redirectTo` and `prompt: "select_account"`; `:4` the `signin|signup` allowlist
- [`src/pages/api/auth/callback.ts:26`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/03224f645daa7aac5a82f507ced15184c144e692/src/pages/api/auth/callback.ts#L26) — success ignores `origin` and lands on `/`; `:11-13` the "Missing OAuth code" fallthrough that swallows `access_denied`
- [`src/middleware.ts:4`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/03224f645daa7aac5a82f507ced15184c144e692/src/middleware.ts#L4) — `PROTECTED_ROUTES = ["/dashboard"]`; `:20` redirect to `/auth/signin` with no return path
- [`src/components/profile/ChannelProfileForm.tsx:61-93`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/03224f645daa7aac5a82f507ced15184c144e692/src/components/profile/ChannelProfileForm.tsx#L61-L93) — the fetch/JSON submit contract to mirror, including the F2 `catch` arm
- [`src/components/profile/ProfileDialog.tsx:24-30`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/03224f645daa7aac5a82f507ced15184c144e692/src/components/profile/ProfileDialog.tsx#L24-L30) — self-contained dialog state, `DialogTrigger asChild`, the glass `DialogContent` recipe
- [`src/components/auth/SubmitButton.tsx:13-14`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/03224f645daa7aac5a82f507ced15184c144e692/src/components/auth/SubmitButton.tsx#L13-L14) — `pendingProp ?? formPending`, already fetch-ready
- [`src/lib/http.ts`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/03224f645daa7aac5a82f507ced15184c144e692/src/lib/http.ts) — `jsonError` helper the auth routes would adopt if they return JSON
- [`src/styles/global.css:113-115`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/03224f645daa7aac5a82f507ced15184c144e692/src/styles/global.css#L113-L115) — `@utility bg-cosmic`, the only bespoke design token
- [`src/lib/config-status.ts:16`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/blob/03224f645daa7aac5a82f507ced15184c144e692/src/lib/config-status.ts#L16) — starter repo URL surfaced in a live banner; also the codebase's lone Polish copy

## Architecture Insights

- **Two parallel form idioms already coexist.** Page-level auth = native POST + redirect + `?error=`. Dialog-level profile = fetch + JSON + `jsonError` + React state. S-04 is, mechanically, the migration of the first idiom onto the second. The shared leaf components (`FormField`, `SubmitButton`, `ServerError`) were already built generic enough to serve both — they live in `src/components/auth/` but are imported by the profile form too.
- **Radix + React 19 form actions are a known trap here.** Use `onSubmit` + `preventDefault` + `fetch`; never `<form action={fn}>` inside a dialog.
- **Session refresh is currently a side effect of navigation.** After a fetch-based sign-in the `Set-Cookie` headers land, but nothing re-renders the SSR shell (`Topbar` reads `Astro.locals.user` on the server). Something must force a reload — this is a real decision, not an implementation detail, because it determines whether the dialog can show a post-auth state at all.
- **The shell is not centralized.** `Topbar` is opted into per page (2 of 6 route files). A coherent auth shell probably wants it in `Layout.astro`, which is a bigger edit than FR-014's wording implies.
- **Graceful degradation has a house idiom**: `null`-returning client factory (`supabase.ts:7-9`) → `configStatuses` banner (`config-status.ts`) → typed `jsonError` from the route. S-04 adds no secrets, so this is background rather than a requirement — but the auth dialog must keep the "Supabase is not configured" message reachable, since today it arrives via the same `?error=` channel that is being removed.
- **Astro's `output: "server"` means every page is SSR** — `export const prerender = false` is redundant and no route declares it (S-01 finding F8, now a CLAUDE.md rule).

## Historical Context (from prior changes)

- `context/archive/2026-09-08-google-oauth-login/plan.md:33-43` — the two-callback-URL distinction (Google Console → Supabase's endpoint; app `redirectTo` → our `/api/auth/callback`), and the deliberate choice not to introduce `PUBLIC_SITE_URL`.
- `context/archive/2026-09-08-google-oauth-login/reviews/impl-review.md` — **F1 (skipped)**: Google's `access_denied` / `error_description` never surfaced; **F2 (fixed)**: the `origin` threading that S-04 now has to reinterpret; **F4 (informational)**: `redirectTo` reflects the incoming `Host` header on Workers — safe because Google honors only pre-registered URIs, but the origin allowlist deserves a re-check.
- `context/archive/2026-09-08-google-oauth-login/change.md:14-16` — Supabase links a Google identity onto an existing same-email password user (no duplicate); `prompt: "select_account"` rationale; local dev needs its own Google OAuth wiring in `supabase/config.toml`.
- `context/changes/channel-profile-crud/plan.md:7,22,29-32` — why the profile UI became a dialog (user's call after seeing the page in practice), why `Topbar` became the trigger host, the Radix/React-19 form-action incompatibility, and the `FormData` → JSON switch.
- `context/changes/channel-profile-crud/reviews/impl-review.md` — F1–F8. Binding on S-04: **F2** (every fetch form needs `catch` → readable error), **F3** (`request.json()` must be guarded → `jsonError`), **F4** (distinguish "no data" from "load failed" as separate UI states), **F5** (disclose unplanned global CSS edits), **F8** (each `/api/*` route self-guards `locals.user`).
- `context/changes/analyze-and-rank-opportunities/plan.md:349-398` — the loading/error precedence convention for fetch-based islands (skeleton while running → toast + inline error on failure → success content), explicitly written to avoid repeating F2.
- `context/changes/analyze-and-rank-opportunities/research.md:225` — confirms `context/foundation/lessons.md` does not exist; recurring rules live inside change folders, and some have been promoted directly into CLAUDE.md.

## Related Research

- `context/changes/analyze-and-rank-opportunities/research.md` — internal research for S-02; its "Historical Context" section is the closest thing this repo has to a lessons ledger and re-derives several of the rules cited above.
- `context/archive/2026-09-08-google-oauth-login/` — the only prior change that touched the auth routes end to end.

## Open Questions

Decisions for `/10x-plan`; none of them block further research.

1. **Do `/auth/signin` and `/auth/signup` survive as routes?** `middleware.ts:20` and every OAuth error path target them, and they may be bookmarked. Options: keep them as thin server-rendered fallbacks that also work without JS; or delete them and make the guard redirect to something like `/?auth=signin` that opens the dialog on load. This single decision cascades into items 2, 5 and 6.
2. **How do `/api/auth/signin|signup` answer?** JSON (`{ error }` / 2xx, per `jsonError` and the `/api/profile` contract) is required for the dialog. If the standalone pages survive, the routes either negotiate on `Accept`/`Content-Type`, or a second JSON endpoint is added alongside the redirecting one. Pick one — supporting both idioms in one handler is how the `?error=` mechanism quietly survives.
3. **What re-renders the shell after a successful in-dialog sign-in?** `Topbar` reads `Astro.locals.user` server-side, so a full `window.location.reload()` (or navigation to `/dashboard`) is the honest answer; anything cleverer means duplicating auth state on the client.
4. **Does sign-out need the dialog at all?** FR-014 names it, but the current bare form POST already works and needs no JS. A confirmation dialog, or a user-menu dialog containing sign-out, are different readings of the same sentence.
5. **What replaces the OAuth `origin` param?** Today it is `"signin" | "signup"` and only routes errors. If the pages disappear, it must become either a return path (validated against an allowlist — the F4 note about `Host`-derived origins applies) or a "reopen the dialog with this error" marker.
6. **Does signup still navigate to `/auth/confirm-email`?** In a dialog the natural equivalent is an in-dialog "check your email" state, which would make `confirm-email.astro` dead code — or keep the navigation and accept that signup alone leaves the page.
7. **Should the OAuth `access_denied` gap (F-01 finding F1) be closed here?** S-04 rewrites exactly that error surface. Closing it is cheap now and awkward later.
8. **Does `Topbar` move into `Layout.astro`?** Today it is mounted per page and absent from all three `/auth/*` pages. A consistent shell argues for centralizing it; that is a larger diff than FR-014 literally asks for.
9. **Copy language: English or Polish?** All UI copy and API messages are English; `config-status.ts:15-17` is the lone Polish outlier. S-04 writes a whole new landing page plus dialog copy — decide before writing it. (Flagged but never resolved in S-02's research.)
10. **Does FR-013 include SEO/social metadata?** There is no `<meta name="description">` and no OG image anywhere. "Communicates product value" can stop at the hero, or extend to metadata and an OG image — the latter adds an asset to produce.
11. **Cleanup scope**: `README.md`, `public/template.png`, the unused `LibBadge.astro`, and the starter URL in `config-status.ts:16` are all starter residue. In scope for this slice, or a separate chore?
