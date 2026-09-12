# Linear Task Mirror — YT-Niche-Adviser

> Snapshot of `context/foundation/tasks-github.md` (itself a mirror of `context/foundation/roadmap.md`) as migrated to Linear in the `Mateusz` workspace.
> **Source of truth for planning stays `roadmap.md`** — this file is a read-oriented mirror for anyone using Linear as their task board. Regenerate (or hand-edit) whenever Linear state drifts from `roadmap.md` / `tasks-github.md` — e.g. after `/10x-plan`, `/10x-implement`, or `/10x-archive` flip an item's status, or after issues are relabeled/closed directly in Linear.

- **Workspace / Team:** `Mateusz` (only team in the workspace; team key `MAT`)
- **Project:** [`YT-Niche-Adviser`](https://linear.app/mateusz-yt-niche-advisor/project/yt-niche-adviser-1534140fd428) — linked to the GitHub repo via a project resource link
- **Milestone:** `M-1: MVP core loop` (inside the project above), description copied verbatim from the GitHub milestone
- **Snapshot taken:** 2026-09-07, created in one pass from `context/foundation/tasks-github.md` + full GitHub issue bodies (`gh issue list --state all`)
- **Last refresh:** 2026-09-12 — read live Linear state via `list_issues`, reconciled against `roadmap.md`, applied four status changes, then regenerated this file from the result. See "Refresh log" below.

## Milestone M-1 — active work (6 issues)

| Issue | Roadmap ID | Type | Title | Linear status | Blocked by | Labels | GitHub source |
|-------|------------|------|-------|----------------|------------|--------|----------------|
| [MAT-5](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-5/f-01-domkniecie-must-have-logowania-google-oauth) | F-01 | Foundation | Domknięcie must-have logowania (Google OAuth) | **Done** | — | `roadmap-foundation` | [#1](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/1) |
| [MAT-6](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-6/f-02-model-danych-profilu-kanalu-rls-per-owner) | F-02 | Foundation | Model danych profilu kanału (RLS per-owner) | **Done** | — | `roadmap-foundation` | [#2](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/2) |
| [MAT-7](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-7/s-01-uzytkownik-tworzy-i-edytuje-profil-kanalu) | S-01 | Slice | Użytkownik tworzy i edytuje profil kanału | **Done** | MAT-6 | `roadmap-slice` | [#3](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/3) |
| [MAT-8](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-8/s-02-uzytkownik-uruchamia-analize-i-widzi-ranking-okazji-gwiazda) | S-02 | Slice (★ north star) | Użytkownik uruchamia analizę i widzi ranking okazji | **In Progress** | MAT-7 | `roadmap-slice` | [#4](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/4) |
| [MAT-9](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-9/s-03-uzytkownik-zapisuje-i-przeglada-okazje-contentowe) | S-03 | Slice | Użytkownik zapisuje i przegląda okazje contentowe | Backlog | MAT-8 | `roadmap-slice`, `status-proposed` | [#5](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/5) |
| [MAT-10](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-10/question-shape-notes-quality-cross-check-nie-zostal-ukonczony) | — | Question | Shape-notes quality cross-check nie został ukończony | Todo, non-blocking | — | `question` | [#6](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/6) |

**Dependency chain:** `MAT-6 → MAT-7 → MAT-8 (★) → MAT-9`, with `MAT-5` independent. The chain is now unblocked up to the north star: **MAT-8 is the active item**; `MAT-9` remains blocked until it completes.

Unlike the GitHub mirror (which encodes "Prerequisites" only as body text), the dependency chain here is a real Linear **blocking relation** (`blockedBy`/`blocks`), so Linear's own UI (and any automation reading it) can see the chain directly — not just read it out of the issue description.

`MAT-8` (S-02, the north-star slice) also carries **High priority** in Linear — a field GitHub Issues doesn't have an equivalent for, added here to flag it as the highest-value/highest-risk item in the milestone.

### MAT-8 progress (S-02, in flight)

Implementation runs through `context/changes/analyze-and-rank-opportunities/plan.md`, five phases. A progress comment is posted on MAT-8 at each phase boundary.

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Foundation — secrets, config visibility, shared helpers, test harness | Done — `bac33fe` |
| 2 | Scoring core — pure functions + unit tests | Next |
| 3 | YouTube data client — three-call chain, bounded paging, reconciliation | Pending |
| 4 | Analyze endpoint — auth, rate limit, orchestration, LLM justification | Pending |
| 5 | Dashboard UI — trigger, ranked results, failure surfaces | Pending |

Two deviations from the reviewed plan landed in Phase 1, both recorded in `change.md` and in the MAT-8 comment thread:

1. Competitor input accepts `@handle` / channel URL / `UC…` id, resolved to a canonical id at **profile-save** time (the plan contracted a `UC`-only regex). `forHandle` cannot batch, so resolving at save keeps `/api/analyze` on its contracted single batched `channels.list` call.
2. `competitor_channel_ids text[]` → `competitors jsonb` (`{id, handle, title}`), migration `20260912190947_competitors_as_objects.sql` — so the UI shows `@mkbhd` rather than a raw id, including after a reload.

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

As of the 2026-09-12 refresh, `status-proposed` remains only on `MAT-9` — it is removed from an item once that item starts. `status-ready` is currently unused: items have moved straight from proposed to started.

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

**2026-09-12** — live state read via `list_issues` (team `Mateusz`, 18 issues) and reconciled against `roadmap.md`. No drift had occurred *in* Linear; the gap was that Linear had never been advanced past 2026-09-09. Four changes applied:

| Issue | Was | Now | Driven by |
|-------|-----|-----|-----------|
| MAT-5 (F-01) | In Progress | Done | `roadmap.md` F-01 `done` |
| MAT-6 (F-02) | In Progress | Done | `roadmap.md` F-02 `done` |
| MAT-7 (S-01) | Backlog | Done (− `status-proposed`) | `roadmap.md` S-01 `done` |
| MAT-8 (S-02) | Backlog | In Progress (− `status-proposed`) | `roadmap.md` S-02 `in-progress`; `/10x-implement` Phase 1 landed |

A Phase 1 progress comment was also posted to MAT-8.

**Known inconsistency, not resolved by this refresh:** `roadmap.md` marks F-02 and S-01 `done`, but their `change.md` files still read `implemented` and `impl_reviewed` respectively, and neither folder has been moved to `context/archive/` (only `google-oauth-login` has). The earlier convention recorded here was that `Done` flips at `/10x-archive` time. This refresh followed `roadmap.md`, since this file's own header names it the source of truth — but the two are genuinely out of step, and running `/10x-archive channel-profile-data-model` and `/10x-archive channel-profile-crud` would close the gap properly.

## Keeping this in sync

This file was generated in one pass: read `context/foundation/tasks-github.md`, pulled full issue bodies via `gh issue list -R Keitar6/10xDevs-YT-Niche-Adviser --state all --json number,title,body,labels,state,closed,milestone`, then created the matching project/milestone/labels/issues in Linear via the `linear-server` MCP tools. Nothing here is live — if issues get closed, relabeled, or new ones get added directly in Linear (bypassing `roadmap.md`), this snapshot goes stale. Re-run the same read-and-recreate pass to refresh it, or ask to have it regenerated.
