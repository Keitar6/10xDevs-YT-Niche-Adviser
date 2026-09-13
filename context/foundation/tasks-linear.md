# Linear Task Mirror — YT-Niche-Adviser

> Snapshot of `context/foundation/tasks-github.md` (itself a mirror of `context/foundation/roadmap.md`) as migrated to Linear in the `Mateusz` workspace.
> **Source of truth for planning stays `roadmap.md`** — this file is a read-oriented mirror for anyone using Linear as their task board. Regenerate (or hand-edit) whenever Linear state drifts from `roadmap.md` / `tasks-github.md` — e.g. after `/10x-plan`, `/10x-implement`, or `/10x-archive` flip an item's status, or after issues are relabeled/closed directly in Linear.

- **Workspace / Team:** `Mateusz` (only team in the workspace; team key `MAT`)
- **Project:** [`YT-Niche-Adviser`](https://linear.app/mateusz-yt-niche-advisor/project/yt-niche-adviser-1534140fd428) — linked to the GitHub repo via a project resource link
- **Milestone:** `M-1: MVP core loop` (inside the project above), description copied verbatim from the GitHub milestone
- **Snapshot taken:** 2026-09-07, created in one pass from `context/foundation/tasks-github.md` + full GitHub issue bodies (`gh issue list --state all`)
- **Last refresh:** 2026-09-13 — `MAT-9` (S-03) moved Backlog → In Progress (`status-proposed` removed) after `/10x-implement` landed all three phases and `/10x-impl-review` came back APPROVED; implementation comment posted. See "Refresh log" below.

## Milestone M-1 — active work (7 issues)

| Issue                                                                                                                                   | Roadmap ID | Type                 | Title                                                            | Linear status      | Blocked by | Labels                             | GitHub source                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------- | ---------------------------------------------------------------- | ------------------ | ---------- | ---------------------------------- | -------------------------------------------------------------------- |
| [MAT-5](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-5/f-01-domkniecie-must-have-logowania-google-oauth)                       | F-01       | Foundation           | Domknięcie must-have logowania (Google OAuth)                    | **Done**           | —          | `roadmap-foundation`               | [#1](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/1)   |
| [MAT-6](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-6/f-02-model-danych-profilu-kanalu-rls-per-owner)                         | F-02       | Foundation           | Model danych profilu kanału (RLS per-owner)                      | **Done**           | —          | `roadmap-foundation`               | [#2](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/2)   |
| [MAT-7](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-7/s-01-uzytkownik-tworzy-i-edytuje-profil-kanalu)                         | S-01       | Slice                | Użytkownik tworzy i edytuje profil kanału                        | **Done**           | MAT-6      | `roadmap-slice`                    | [#3](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/3)   |
| [MAT-8](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-8/s-02-uzytkownik-uruchamia-analize-i-widzi-ranking-okazji-gwiazda)       | S-02       | Slice (★ north star) | Użytkownik uruchamia analizę i widzi ranking okazji              | **In Progress**    | MAT-7      | `roadmap-slice`                    | [#4](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/4)   |
| [MAT-9](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-9/s-03-uzytkownik-zapisuje-i-przeglada-okazje-contentowe)                 | S-03       | Slice                | Użytkownik zapisuje i przegląda okazje contentowe                | **In Progress**    | MAT-8      | `roadmap-slice`                    | [#5](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/5)   |
| [MAT-23](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-23/s-04-strona-glowna-mowi-o-produkcie-a-logowanie-dzieje-sie-w-dialogu) | S-04       | Slice                | Strona główna mówi o produkcie, a logowanie dzieje się w dialogu | **In Progress**    | —          | `roadmap-slice`                    | [#19](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/19) |
| [MAT-10](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-10/question-shape-notes-quality-cross-check-nie-zostal-ukonczony)        | —          | Question             | Shape-notes quality cross-check nie został ukończony             | Todo, non-blocking | —          | `question`                         | [#6](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/6)   |

**Dependency chain:** `MAT-6 → MAT-7 → MAT-8 (★) → MAT-9`, with `MAT-5` and `MAT-23` independent. The `blockedBy` relation on `MAT-9` is left in place as the technical dependency it documents (S-03 needs S-02's ranking output), but it did not block *starting* MAT-9 in practice — `/api/analyze` was already functional enough to build the save/browse loop on top of, even though `MAT-8` itself has not reached `Done` in Linear.

`MAT-23` (S-04) carries **no** blocking relation: `roadmap.md` sequences it after S-03 by a scope decision, not a technical dependency, so encoding it as `blockedBy` would misstate the graph. It was implemented out of sequence for exactly that reason.

Unlike the GitHub mirror (which encodes "Prerequisites" only as body text), the dependency chain here is a real Linear **blocking relation** (`blockedBy`/`blocks`), so Linear's own UI (and any automation reading it) can see the chain directly — not just read it out of the issue description.

`MAT-8` (S-02, the north-star slice) also carries **High priority** in Linear — a field GitHub Issues doesn't have an equivalent for, added here to flag it as the highest-value/highest-risk item in the milestone.

### MAT-8 progress (S-02, in flight)

Implementation runs through `context/changes/analyze-and-rank-opportunities/plan.md`, five phases. A progress comment is posted on MAT-8 at each phase boundary.

| Phase | Scope                                                                  | Status           |
| ----- | ---------------------------------------------------------------------- | ---------------- |
| 1     | Foundation — secrets, config visibility, shared helpers, test harness  | Done — `bac33fe` |
| 2     | Scoring core — pure functions + unit tests                             | Next             |
| 3     | YouTube data client — three-call chain, bounded paging, reconciliation | Pending          |
| 4     | Analyze endpoint — auth, rate limit, orchestration, LLM justification  | Pending          |
| 5     | Dashboard UI — trigger, ranked results, failure surfaces               | Pending          |

Two deviations from the reviewed plan landed in Phase 1, both recorded in `change.md` and in the MAT-8 comment thread:

1. Competitor input accepts `@handle` / channel URL / `UC…` id, resolved to a canonical id at **profile-save** time (the plan contracted a `UC`-only regex). `forHandle` cannot batch, so resolving at save keeps `/api/analyze` on its contracted single batched `channels.list` call.
2. `competitor_channel_ids text[]` → `competitors jsonb` (`{id, handle, title}`), migration `20260912190947_competitors_as_objects.sql` — so the UI shows `@mkbhd` rather than a raw id, including after a reload.

### MAT-23 progress (S-04, implemented)

Implementation ran through `context/changes/landing-and-auth-shell/plan.md`, four phases. A single completion comment is posted on MAT-23.

| Phase | Scope                                                              | Status           |
| ----- | ------------------------------------------------------------------ | ---------------- |
| 1     | JSON auth contract + return-path plumbing (`next`, `?auth_error=`) | Done — `062c9ee` |
| 2     | Auth dialog, mounted in `Topbar`                                   | Done — `32fb7d8` |
| 3     | Centralize the shell; auth pages → redirect shims                  | Done — `bed66e4` |
| 4     | Landing content, social metadata, starter cleanup                  | Done — `2a4b98c` |

Plus `8e89184` (plan SHAs + deviations) and `b1bfd95` (signed-in hero CTAs — a bug found in manual testing: the `[data-auth-open]` listener lives in `AuthDialog`, which only mounts for anonymous visitors, so the hero buttons were inert once signed in).

`change.md` is `implemented`, **not** archived — which is why this issue is `In Progress` and not `Done`, per the mapping below.

Nine deviations from the reviewed plan are recorded in `change.md` and summarized in the MAT-23 comment. The three worth knowing here:

1. **Auth shims are `.ts` endpoints, not `.astro` pages** — a top-level `return` in Astro frontmatter crashes ESLint (`@typescript-eslint/no-misused-promises`).
2. **`public/og.png` was generated via `sharp` from an SVG**, not screenshotted — no headless browser is available in the dev environment.
3. **FR-014 is knowingly partial** — sign-out stays a bare `form method="POST"` rather than moving into a dialog. Decided during `/10x-plan`.

One manual check is deferred rather than passed: _OG card renders with an image in a link preview_ needs a publicly reachable URL and cannot be verified against localhost.

### MAT-9 progress (S-03, implemented)

Implementation ran through `context/changes/save-and-view-opportunities/plan.md`, three phases. A single completion comment is posted on MAT-9.

| Phase | Scope                                                        | Status           |
| ----- | ------------------------------------------------------------ | ---------------- |
| 1     | Data model — `content_opportunities` table + per-owner RLS   | Done — `38e5c37` |
| 2     | Save & remove API — idempotent `POST`, RLS-backed `DELETE`   | Done — `db0ce38` |
| 3     | Dashboard composition — save control, saved panel, shared island | Done — `d881c7d` |

Plus `234ef7d` (epilogue) and `a64a92e` (impl-review triage fixes).

`/10x-impl-review` on the full plan came back **APPROVED** — 0 critical findings, 1 warning (fixed: capped the client-side saved list at `SAVED_LIST_LIMIT` so a long-lived tab can't grow it past 200), 2 observations (1 fixed: documented the `23505`-handler's single-unique-constraint assumption; 1 skipped as informational-only: `view_count` has no upper bound in the zod schema, not exploitable at real YouTube view-count magnitudes). No plan drift found across any of the 3 phases.

The two-account isolation protocol (PRD's per-user isolation NFR) passed all five scripted assertions against local Supabase: cross-user list reads return zero rows, cross-user `DELETE` and `PATCH` are both refused, and the owner's row is unaffected.

`change.md` is `impl_reviewed`, **not** archived — which is why this issue is `In Progress` and not `Done`, per the mapping below (same treatment MAT-23 got before its own archive).

## Parked / not planned (12 issues, all Canceled)

Set to Linear state `Canceled` — mirrors GitHub's `state_reason: not_planned` (explicitly out of MVP scope, not "later without a decision").

| Issue                                                                                                                    | Title                                            | GitHub source                                                        |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | -------------------------------------------------------------------- |
| [MAT-11](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-11/parked-monitoring-newsow-z-zewnetrznych-zrodel)        | Monitoring newsów z zewnętrznych źródeł          | [#7](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/7)   |
| [MAT-12](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-12/parked-planer-produkcji-kanban)                        | Planer produkcji / kanban                        | [#8](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/8)   |
| [MAT-13](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-13/parked-konfigurator-workflow-edytor-thumbnail)         | Konfigurator workflow (edytor, thumbnail)        | [#9](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/9)   |
| [MAT-14](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-14/parked-niche-discovery-odkrywanie-nowych-nisz-od-zera) | Niche discovery (odkrywanie nowych nisz od zera) | [#10](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/10) |
| [MAT-15](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-15/parked-sledzenie-analityka-wlasnego-kanalu)            | Śledzenie / analityka własnego kanału            | [#11](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/11) |
| [MAT-16](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-16/parked-platnosci-i-plany-subskrypcyjne)                | Płatności i plany subskrypcyjne                  | [#12](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/12) |
| [MAT-17](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-17/parked-zaawansowany-uczony-model-trafnosci-niszy)      | Zaawansowany, uczony model trafności niszy       | [#13](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/13) |
| [MAT-18](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-18/parked-wiele-profili-kanalow-naraz)                    | Wiele profili kanałów naraz                      | [#14](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/14) |
| [MAT-19](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-19/parked-automatyczne-cykliczne-analizy)                 | Automatyczne / cykliczne analizy                 | [#15](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/15) |
| [MAT-20](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-20/parked-analiza-shorts)                                 | Analiza Shorts                                   | [#16](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/16) |
| [MAT-21](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-21/parked-usuwanie-profilu-kanalu-fr-005)                 | Usuwanie profilu kanału (FR-005)                 | [#17](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/17) |
| [MAT-22](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-22/parked-pelny-workflow-statusow-okazji-fr-012)          | Pełny workflow statusów okazji (FR-012)          | [#18](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/18) |

## Labels in use

Created as **team-scoped labels** on `Mateusz` (not workspace-wide), same names/colors/descriptions as the GitHub labels:

| Label                | Color     | Meaning                                                            |
| -------------------- | --------- | ------------------------------------------------------------------ |
| `roadmap-foundation` | `#5319e7` | Cross-cutting enabler (F-NN) — no user-visible outcome on its own  |
| `roadmap-slice`      | `#0e8a16` | Vertical, user-visible capability (S-NN)                           |
| `roadmap-parked`     | `#cccccc` | Explicitly out of MVP scope (PRD Non-Goals / demoted nice-to-have) |
| `status-ready`       | `#0e8a16` | Prerequisites met — safe to `/10x-plan` now                        |
| `status-proposed`    | `#fbca04` | Sequenced but blocked on an earlier item                           |
| `question`           | `#d876e3` | Open roadmap question, not yet a plannable item                    |

As of the 2026-09-13 refresh, no active-milestone issue carries `status-proposed` any more — it is removed from an item once that item starts, and `MAT-9` (the last holdout) started this refresh. `status-ready` is currently unused: items have moved straight from proposed to started.

Note: the workspace also ships three unrelated default labels (`Feature`, `Bug`, `Improvement`) from Linear's onboarding — not part of the roadmap mirror, left untouched. Four unrelated onboarding issues (`MAT-1`–`MAT-4`: "Get familiar with Linear", "Connect your tools", "Set up your teams", "Import your data") also pre-existed in the team; they no longer appear in an active `list_issues` query and were left as-is.

## Mapping notes — how GitHub state translates to Linear

Linear has richer primitives than GitHub Issues for a couple of fields used here, so the mapping isn't 1:1:

- **Open/ready or blocked (GitHub label `status-ready`/`status-proposed`)** → Linear workflow state: `Todo` for ready items, `Backlog` for blocked/proposed items. The `status-ready`/`status-proposed` labels are still applied too, so both signals are visible.
- **Closed as `not_planned` (GitHub)** → Linear state `Canceled` (not `Done` — these were never completed, they were descoped).
- **GitHub "Prerequisites" body text** (e.g. "Prerequisites: #2 (F-02)") → real Linear `blockedBy` issue relations on MAT-7/MAT-8/MAT-9, in addition to keeping the text in the description for readability.
- **North-star slice (★ in roadmap.md / GitHub title)** → additionally marked **High priority** in Linear (MAT-8), since GitHub Issues has no priority field to carry that signal.
- **`roadmap.md` status → Linear state:** `done` → `Done`, `in-progress` → `In Progress`, `ready` → `Todo`, `proposed` → `Backlog`.
- Each Linear issue description mirrors the full GitHub issue body (Outcome, Roadmap ID, PRD refs, Prerequisites, Parallel with, Blockers, Unknowns, Risk, Status) and ends with a link back to the source GitHub issue; a matching GitHub-URL attachment was also added to each Linear issue for one-click cross-navigation.

## Refresh log

**2026-09-12** — live state read via `list_issues` (team `Mateusz`, 18 issues) and reconciled against `roadmap.md`. No drift had occurred _in_ Linear; the gap was that Linear had never been advanced past 2026-09-09. Four changes applied:

| Issue        | Was         | Now                               | Driven by                                                        |
| ------------ | ----------- | --------------------------------- | ---------------------------------------------------------------- |
| MAT-5 (F-01) | In Progress | Done                              | `roadmap.md` F-01 `done`                                         |
| MAT-6 (F-02) | In Progress | Done                              | `roadmap.md` F-02 `done`                                         |
| MAT-7 (S-01) | Backlog     | Done (− `status-proposed`)        | `roadmap.md` S-01 `done`                                         |
| MAT-8 (S-02) | Backlog     | In Progress (− `status-proposed`) | `roadmap.md` S-02 `in-progress`; `/10x-implement` Phase 1 landed |

A Phase 1 progress comment was also posted to MAT-8.

**2026-09-13** — live state read via `list_issues` (team `Mateusz`, 18 issues). No drift had occurred _in_ Linear; the gap was that S-04 and S-05 were added to `roadmap.md` on 2026-09-13, after the previous refresh, and had never reached Linear at all. One change applied:

| Issue         | Was             | Now                                                                         | Driven by                                                                |
| ------------- | --------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| MAT-23 (S-04) | _did not exist_ | Created, In Progress, `roadmap-slice`, milestone M-1, GitHub #19 attachment | `roadmap.md` S-04 `in-progress`; `/10x-implement` landed all four phases |

A completion comment was posted to MAT-23.

**Still missing from Linear: S-05 (`channel-profile-avatar`, GitHub [#20](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/20), `roadmap.md` status `in-progress`).** It was added to the roadmap in the same 2026-09-13 pass as S-04 and has since started, but no issue was created for it here yet.

**2026-09-13 (later same day)** — `/10x-implement` landed all three phases of `save-and-view-opportunities` (S-03) and `/10x-impl-review` came back APPROVED. One change applied:

| Issue        | Was                            | Now                                | Driven by                                                                 |
| ------------ | ------------------------------- | ----------------------------------- | -------------------------------------------------------------------------- |
| MAT-9 (S-03) | Backlog (`status-proposed`)    | In Progress (− `status-proposed`)  | `/10x-implement save-and-view-opportunities` landed all 3 phases; `change.md` is `impl_reviewed`, not yet archived |

A completion comment was posted to MAT-9.

**Known inconsistency, still not resolved:** `roadmap.md` still marks S-02 (`MAT-8`) `in-progress` even though S-03 was built on top of its output and treated as functionally complete enough to depend on — the same "roadmap status lags actual state" pattern already flagged for F-02/S-01 below. Not resolved by this refresh since it is out of scope for the S-03 update.

**Known inconsistency, not resolved by this refresh:** `roadmap.md` marks F-02 and S-01 `done`, but their `change.md` files still read `implemented` and `impl_reviewed` respectively, and neither folder has been moved to `context/archive/` (only `google-oauth-login` has). The earlier convention recorded here was that `Done` flips at `/10x-archive` time. This refresh followed `roadmap.md`, since this file's own header names it the source of truth — but the two are genuinely out of step, and running `/10x-archive channel-profile-data-model` and `/10x-archive channel-profile-crud` would close the gap properly.

## Keeping this in sync

This file was generated in one pass: read `context/foundation/tasks-github.md`, pulled full issue bodies via `gh issue list -R Keitar6/10xDevs-YT-Niche-Adviser --state all --json number,title,body,labels,state,closed,milestone`, then created the matching project/milestone/labels/issues in Linear via the `linear-server` MCP tools. Nothing here is live — if issues get closed, relabeled, or new ones get added directly in Linear (bypassing `roadmap.md`), this snapshot goes stale. Re-run the same read-and-recreate pass to refresh it, or ask to have it regenerated.
