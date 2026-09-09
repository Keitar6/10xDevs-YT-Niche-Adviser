# Linear Task Mirror — YT-Niche-Adviser

> Snapshot of `context/foundation/tasks-github.md` (itself a mirror of `context/foundation/roadmap.md`) as migrated to Linear in the `Mateusz` workspace.
> **Source of truth for planning stays `roadmap.md`** — this file is a read-oriented mirror for anyone using Linear as their task board. Regenerate (or hand-edit) whenever Linear state drifts from `roadmap.md` / `tasks-github.md` — e.g. after `/10x-plan`, `/10x-implement`, or `/10x-archive` flip an item's status, or after issues are relabeled/closed directly in Linear.

- **Workspace / Team:** `Mateusz` (only team in the workspace; team key `MAT`)
- **Project:** [`YT-Niche-Adviser`](https://linear.app/mateusz-yt-niche-advisor/project/yt-niche-adviser-1534140fd428) — linked to the GitHub repo via a project resource link
- **Milestone:** `M-1: MVP core loop` (inside the project above), description copied verbatim from the GitHub milestone
- **Snapshot taken:** 2026-09-07, created in one pass from `context/foundation/tasks-github.md` + full GitHub issue bodies (`gh issue list --state all`)
- **Last hand-edit:** 2026-09-09 — `/10x-implement google-oauth-login` finished both plan phases (commits `b313653`, `5b47201`, `3bb6167`, `05a2e7b`); `MAT-5` moved `Todo` → `In Progress` and `status-ready` label removed to match. Not yet `Done` — that flip happens at `/10x-archive google-oauth-login` time, matching `roadmap.md`'s forward-only status convention (still `in-progress` there too).
- **Last hand-edit:** 2026-09-09 — `/10x-plan` + `/10x-implement channel-profile-data-model` created and finished the plan's single phase (`channel_profiles` table, RLS, `updated_at` trigger, generated types); `MAT-6` moved `Todo` → `In Progress` and `status-ready` label removed to match. Not yet `Done` — same forward-only convention, flips at `/10x-archive channel-profile-data-model` time (`roadmap.md` also still `in-progress`).

## Milestone M-1 — active work (6 issues)

| Issue | Roadmap ID | Type | Title | Linear status | Blocked by | Labels | GitHub source |
|-------|------------|------|-------|----------------|------------|--------|----------------|
| [MAT-5](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-5/f-01-domkniecie-must-have-logowania-google-oauth) | F-01 | Foundation | Domknięcie must-have logowania (Google OAuth) | In Progress | — | `roadmap-foundation` | [#1](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/1) |
| [MAT-6](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-6/f-02-model-danych-profilu-kanalu-rls-per-owner) | F-02 | Foundation | Model danych profilu kanału (RLS per-owner) | In Progress | — | `roadmap-foundation` | [#2](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/2) |
| [MAT-7](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-7/s-01-uzytkownik-tworzy-i-edytuje-profil-kanalu) | S-01 | Slice | Użytkownik tworzy i edytuje profil kanału | Backlog | MAT-6 | `roadmap-slice`, `status-proposed` | [#3](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/3) |
| [MAT-8](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-8/s-02-uzytkownik-uruchamia-analize-i-widzi-ranking-okazji-gwiazda) | S-02 | Slice (★ north star) | Użytkownik uruchamia analizę i widzi ranking okazji | Backlog | MAT-7 | `roadmap-slice`, `status-proposed` | [#4](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/4) |
| [MAT-9](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-9/s-03-uzytkownik-zapisuje-i-przeglada-okazje-contentowe) | S-03 | Slice | Użytkownik zapisuje i przegląda okazje contentowe | Backlog | MAT-8 | `roadmap-slice`, `status-proposed` | [#5](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/5) |
| [MAT-10](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-10/question-shape-notes-quality-cross-check-nie-zostal-ukonczony) | — | Question | Shape-notes quality cross-check nie został ukończony | Todo, non-blocking | — | `question` | [#6](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/6) |

**Dependency chain:** `MAT-6 → MAT-7 → MAT-8 (★) → MAT-9`, with `MAT-5` independent (can run in parallel). Ready now: **MAT-5** and **MAT-6**. Recommended next step: `MAT-6` (unblocks `MAT-7` → the north-star slice `MAT-8`).

Unlike the GitHub mirror (which encodes "Prerequisites" only as body text), the dependency chain here is a real Linear **blocking relation** (`blockedBy`/`blocks`), so Linear's own UI (and any automation reading it) can see the chain directly — not just read it out of the issue description.

`MAT-8` (S-02, the north-star slice) also carries **High priority** in Linear — a field GitHub Issues doesn't have an equivalent for, added here to flag it as the highest-value/highest-risk item in the milestone.

## Parked / not planned (12 issues, all Canceled)

Set to Linear state `Canceled` — mirrors GitHub's `state_reason: not_planned` (explicitly out of MVP scope, not "later without a decision").

| Issue | Title | GitHub source |
|-------|-------|----------------|
| [MAT-11](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-11/parked-monitoring-newsow-z-zewnetrznych-zrodel) | Monitoring newsów z zewnętrznych źródeł | [#7](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/7) |
| [MAT-12](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-12/parked-planer-produkcji-kanban) | Planer produkcji / kanban | [#8](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/8) |
| [MAT-13](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-13/parked-konfigurator-workflow-edytor-thumbnail) | Konfigurator workflow (edytor, thumbnail) | [#9](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/9) |
| [MAT-14](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-14/parked-niche-discovery-odkrywanie-nowych-nisz-od-zera) | Niche discovery (odkrywanie nowych nisz od zera) | [#10](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/10) |
| [MAT-15](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-15/parked-sledzenie-analityka-wlasnego-kanalu) | Śledzenie / analityka własnego kanału | [#11](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/11) |
| [MAT-16](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-16/parked-platnosci-i-plany-subskrypcyjne) | Płatności i plany subskrypcyjne | [#12](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/12) |
| [MAT-17](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-17/parked-zaawansowany-uczony-model-trafnosci-niszy) | Zaawansowany, uczony model trafności niszy | [#13](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/13) |
| [MAT-18](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-18/parked-wiele-profili-kanalow-naraz) | Wiele profili kanałów naraz | [#14](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/14) |
| [MAT-19](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-19/parked-automatyczne-cykliczne-analizy) | Automatyczne / cykliczne analizy | [#15](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/15) |
| [MAT-20](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-20/parked-analiza-shorts) | Analiza Shorts | [#16](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/16) |
| [MAT-21](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-21/parked-usuwanie-profilu-kanalu-fr-005) | Usuwanie profilu kanału (FR-005) | [#17](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/17) |
| [MAT-22](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-22/parked-pelny-workflow-statusow-okazji-fr-012) | Pełny workflow statusów okazji (FR-012) | [#18](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/18) |

## Labels in use

Created as **team-scoped labels** on `Mateusz` (not workspace-wide), same names/colors/descriptions as the GitHub labels:

| Label | Color | Meaning |
|-------|-------|---------|
| `roadmap-foundation` | `#5319e7` | Cross-cutting enabler (F-NN) — no user-visible outcome on its own |
| `roadmap-slice` | `#0e8a16` | Vertical, user-visible capability (S-NN) |
| `roadmap-parked` | `#cccccc` | Explicitly out of MVP scope (PRD Non-Goals / demoted nice-to-have) |
| `status-ready` | `#0e8a16` | Prerequisites met — safe to `/10x-plan` now |
| `status-proposed` | `#fbca04` | Sequenced but blocked on an earlier item |
| `question` | `#d876e3` | Open roadmap question, not yet a plannable item |

Note: the workspace also ships three unrelated default labels (`Feature`, `Bug`, `Improvement`) from Linear's onboarding — not part of the roadmap mirror, left untouched. Four unrelated onboarding issues (`MAT-1`–`MAT-4`: "Get familiar with Linear", "Connect your tools", "Set up your teams", "Import your data") also pre-existed in the team and were left as-is.

## Mapping notes — how GitHub state translates to Linear

Linear has richer primitives than GitHub Issues for a couple of fields used here, so the mapping isn't 1:1:

- **Open/ready or blocked (GitHub label `status-ready`/`status-proposed`)** → Linear workflow state: `Todo` for ready items, `Backlog` for blocked/proposed items. The `status-ready`/`status-proposed` labels are still applied too, so both signals are visible.
- **Closed as `not_planned` (GitHub)** → Linear state `Canceled` (not `Done` — these were never completed, they were descoped).
- **GitHub "Prerequisites" body text** (e.g. "Prerequisites: #2 (F-02)") → real Linear `blockedBy` issue relations on MAT-7/MAT-8/MAT-9, in addition to keeping the text in the description for readability.
- **North-star slice (★ in roadmap.md / GitHub title)** → additionally marked **High priority** in Linear (MAT-8), since GitHub Issues has no priority field to carry that signal.
- Each Linear issue description mirrors the full GitHub issue body (Outcome, Roadmap ID, PRD refs, Prerequisites, Parallel with, Blockers, Unknowns, Risk, Status) and ends with a link back to the source GitHub issue; a matching GitHub-URL attachment was also added to each Linear issue for one-click cross-navigation.

## Keeping this in sync

This file was generated in one pass: read `context/foundation/tasks-github.md`, pulled full issue bodies via `gh issue list -R Keitar6/10xDevs-YT-Niche-Adviser --state all --json number,title,body,labels,state,closed,milestone`, then created the matching project/milestone/labels/issues in Linear via the `linear-server` MCP tools. Nothing here is live — if issues get closed, relabeled, or new ones get added directly in Linear (bypassing `roadmap.md`), this snapshot goes stale. Re-run the same read-and-recreate pass to refresh it, or ask to have it regenerated.
