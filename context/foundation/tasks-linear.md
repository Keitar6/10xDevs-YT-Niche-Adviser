# Linear Task Mirror — YT-Niche-Adviser

> Snapshot of `context/foundation/tasks-github.md` (itself a mirror of `context/foundation/roadmap.md`) as migrated to Linear in the `Mateusz` workspace.
> **Source of truth for planning stays `roadmap.md`** — this file is a read-oriented mirror for anyone using Linear as their task board. Regenerate (or hand-edit) whenever Linear state drifts from `roadmap.md` / `tasks-github.md` — e.g. after `/10x-plan`, `/10x-implement`, or `/10x-archive` flip an item's status, or after issues are relabeled/closed directly in Linear.

- **Workspace / Team:** `Mateusz` (only team in the workspace; team key `MAT`)
- **Project:** [`YT-Niche-Adviser`](https://linear.app/mateusz-yt-niche-advisor/project/yt-niche-adviser-1534140fd428) — linked to the GitHub repo via a project resource link
- **Active milestone:** `M-2: Provable quality floor` (inside the project above) — **open, 0 % progress, 5 issues**
- **Previous milestone:** `M-1: MVP core loop` — complete on the roadmap; shows **87.5 %** in Linear because of a known drift (see below)
- **Snapshot taken:** 2026-09-13 (M-2 opening pass — milestone and issues created live via the `linear-server` MCP tools, then read back)

## Milestone M-2 — active (5 issues)

| Issue | Roadmap ID | Type | Title | Linear status | Priority | Labels | GitHub source |
|-------|------------|------|-------|---------------|----------|--------|---------------|
| [MAT-25](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-25/f-03-provable-access-control) | F-03 | Foundation | Provable access control | **Todo** | — | `roadmap-foundation` | [#22](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/22) |
| [MAT-26](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-26/f-04-analyze-pipeline-boundary-resilience) | F-04 | Foundation | Analyze-pipeline boundary resilience | **Todo** | — | `roadmap-foundation` | [#23](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/23) |
| [MAT-27](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-27/f-05-scoring-oracle-and-spec-conformance) | F-05 | Foundation | Scoring oracle and spec conformance | **Todo** | — | `roadmap-foundation` | [#24](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/24) |
| [MAT-28](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-28/f-06-quality-gates-wiring) | F-06 | Foundation | Quality-gates wiring | **Backlog** | — | `roadmap-foundation` | [#25](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/25) |
| [MAT-22](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-22/s-06-opportunity-status-transitions-fr-012) | S-06 | Slice (★ north star) | Opportunity status transitions (FR-012) | **Backlog** | **High** | `roadmap-slice` | [#18](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/18) |

**`blockedBy` relations created:** `MAT-22` blocked by `MAT-25`; `MAT-28` blocked by `MAT-25`, `MAT-26`, `MAT-27`. These mirror the roadmap's Prerequisites as real Linear relations, not just description text.

`MAT-22` (S-06, the north-star slice) carries **High priority** — a field GitHub Issues has no equivalent for — following the same convention used for `MAT-8` in M-1.

### MAT-22 was un-parked in place, not recreated

`MAT-22` previously existed as `[Parked] Pełny workflow statusów okazji (FR-012)` in Linear state `Canceled` with label `roadmap-parked`. On 2026-09-13 it was **updated in place**: `Canceled` → `Backlog`, retitled, `roadmap-parked` → `roadmap-slice`, attached to M-2, set to High priority, and given a `blockedBy` relation on `MAT-25`. Its original parking rationale is quoted verbatim inside the description, because the reopen rests on a *different* argument rather than a reversal — see `tasks-github.md` for the full reasoning.

Reusing the issue rather than creating a new one keeps the decision history (park → un-park) on a single record, in both trackers.

### Status label note

Unlike GitHub, M-2's Linear issues carry **only** `roadmap-foundation` / `roadmap-slice`. The ready-vs-proposed distinction is expressed by the Linear workflow state (`Todo` vs `Backlog`) per the mapping below, so applying `status-ready` / `status-proposed` here as well would duplicate it. GitHub needs those labels because it has no state field between open and closed; Linear does not.

## Milestone M-1 — complete on the roadmap (7 deliverables, all Done)

| Issue | Roadmap ID | Type | Title | Linear status | GitHub source |
|-------|------------|------|-------|---------------|---------------|
| [MAT-5](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-5/f-01-domkniecie-must-have-logowania-google-oauth) | F-01 | Foundation | Domknięcie must-have logowania (Google OAuth) | **Done** | [#1](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/1) |
| [MAT-6](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-6/f-02-model-danych-profilu-kanalu-rls-per-owner) | F-02 | Foundation | Model danych profilu kanału (RLS per-owner) | **Done** | [#2](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/2) |
| [MAT-7](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-7/s-01-uzytkownik-tworzy-i-edytuje-profil-kanalu) | S-01 | Slice | Użytkownik tworzy i edytuje profil kanału | **Done** | [#3](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/3) |
| [MAT-8](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-8/s-02-uzytkownik-uruchamia-analize-i-widzi-ranking-okazji-gwiazda) | S-02 | Slice (★) | Użytkownik uruchamia analizę i widzi ranking okazji | **Done** (High) | [#4](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/4) |
| [MAT-9](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-9/s-03-uzytkownik-zapisuje-i-przeglada-okazje-contentowe) | S-03 | Slice | Użytkownik zapisuje i przegląda okazje contentowe | **Done** | [#5](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/5) |
| [MAT-23](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-23/s-04-strona-glowna-mowi-o-produkcie-a-logowanie-dzieje-sie-w-dialogu) | S-04 | Slice | Strona główna mówi o produkcie, a logowanie dzieje się w dialogu | **Done** | [#19](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/19) |
| [MAT-24](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-24/s-05-profil-kanalu-ma-awatar-wgrany-albo-wygenerowany) | S-05 | Slice | Profil kanału ma awatar — wgrany albo wygenerowany | **Done** | [#20](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/20) |

### Known drift: M-1 reads 87.5 %, not 100 %

Linear reports milestone M-1 at **87.5 % (7 of 8)**, because **`MAT-10`** — the Open Roadmap Question mirroring GitHub `#6` — is still attached to M-1 in state `Todo`. It is not a deliverable and should not be in the milestone at all: `#6` was detached from M-1 on the GitHub side during the close-out, and earlier revisions of this file already described `MAT-10` as "outside the milestone". Linear was never updated to match, so that description was **wrong**, and the 87.5 % is the visible symptom.

This was **not fixed in the M-2 opening pass**: the `linear-server` MCP `save_issue` tool accepts a milestone name or ID but exposes no way to clear the field (passing `null` resolves as a literal milestone name and errors). **Manual fix:** open `MAT-10` in Linear and clear its Milestone field — M-1 then reads 100 %.

## Open, outside any milestone

| Issue | Type | Title | Linear status |
|-------|------|-------|---------------|
| [MAT-10](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-10/question-shape-notes-quality-cross-check-nie-zostal-ukonczony) | Question | Shape-notes quality cross-check nie został ukończony | Todo, non-blocking — **but still attached to M-1, see drift above** |

The two Open Roadmap Questions added when M-2 opened (the end-to-end criterion contradiction, and the container-runtime gate placement) have **no mirror issues in Linear yet**.

## Parked / not planned (11 issues, all Canceled)

Linear state `Canceled` — mirrors GitHub's `state_reason: not_planned`. **Down from 12:** `MAT-22` left this set when it was un-parked into S-06.

| Issue | Title | GitHub source |
|-------|-------|---------------|
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

## Labels in use

Created as **team-scoped labels** on `Mateusz` (not workspace-wide), same names/colors/descriptions as the GitHub labels:

| Label | Color | Meaning |
|-------|-------|---------|
| `roadmap-foundation` | `#5319e7` | Cross-cutting enabler (F-NN) — no user-visible outcome on its own |
| `roadmap-slice` | `#0e8a16` | Vertical, user-visible capability (S-NN) |
| `roadmap-parked` | `#cccccc` | Explicitly out of MVP scope (PRD Non-Goals / demoted nice-to-have) |
| `status-ready` | `#0e8a16` | Defined but unused in Linear — the workflow state carries this (see "Status label note") |
| `status-proposed` | `#fbca04` | Defined but unused in Linear — the workflow state carries this |
| `question` | `#d876e3` | Open roadmap question, not yet a plannable item |

Note: the workspace also ships three unrelated default labels (`Feature`, `Bug`, `Improvement`) from Linear's onboarding — not part of the roadmap mirror, left untouched. Four unrelated onboarding issues (`MAT-1`–`MAT-4`) also pre-existed in the team and were left as-is.

## Mapping notes — how GitHub state translates to Linear

- **`roadmap.md` status → Linear state:** `done` → `Done`, `in-progress` → `In Progress`, `ready` → `Todo`, `proposed` → `Backlog`.
- **Closed as `not_planned` (GitHub)** → Linear state `Canceled` (not `Done` — these were never completed, they were descoped).
- **GitHub "Prerequisites" body text** → real Linear `blockedBy` issue relations, in addition to keeping the text in the description for readability.
- **North-star slice (★)** → additionally marked **High priority** in Linear, since GitHub Issues has no priority field to carry that signal.
- Each Linear issue description mirrors the full GitHub issue body and ends with a link back to the source GitHub issue; a matching GitHub-URL attachment gives one-click cross-navigation.

## Refresh log

**2026-09-12** — reconciled against `roadmap.md`; Linear had never been advanced past 2026-09-09. Four changes: `MAT-5` (F-01) and `MAT-6` (F-02) In Progress → Done; `MAT-7` (S-01) Backlog → Done; `MAT-8` (S-02) Backlog → In Progress.

**2026-09-13** — `MAT-23` (S-04) created as In Progress. S-05 flagged as missing and not created.

**2026-09-13 (later)** — S-03 implemented and reviewed APPROVED; `MAT-9` Backlog → In Progress.

**2026-09-13 (M-1 close-out)** — `MAT-8`, `MAT-9`, `MAT-23` → Done; `MAT-24` (S-05) created directly as Done. All three "Known inconsistency" notes from earlier revisions resolved, and GitHub state written back for the first time.

**2026-09-13 (M-2 opening)** — milestone `M-2: Provable quality floor` created in the project. Four issues created (`MAT-25`–`MAT-28`) for F-03–F-06, with `blockedBy` relations and GitHub link attachments. `MAT-22` un-parked in place: `Canceled` → `Backlog`, relabelled, attached to M-2, set High priority. Parked set dropped 12 → 11. One new drift recorded and **left unfixed** — `MAT-10` is still attached to M-1, which is why M-1 reads 87.5 %; the MCP tool cannot clear a milestone field, so it needs a manual edit in Linear.

## Keeping this in sync

This file is generated by reading `context/foundation/tasks-github.md` and live Linear state, then creating or updating the matching project/milestone/labels/issues in Linear via the `linear-server` MCP tools. Nothing here is live: if issues get closed, relabeled, or added directly in Linear (bypassing `roadmap.md`), this snapshot goes stale. Re-run the read-and-reconcile pass to refresh it.
