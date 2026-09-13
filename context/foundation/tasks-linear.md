# Linear Task Mirror — YT-Niche-Adviser

> Snapshot of `context/foundation/tasks-github.md` (itself a mirror of `context/foundation/roadmap.md`) as migrated to Linear in the `Mateusz` workspace.
> **Source of truth for planning stays `roadmap.md`** — this file is a read-oriented mirror for anyone using Linear as their task board. Regenerate (or hand-edit) whenever Linear state drifts from `roadmap.md` / `tasks-github.md` — e.g. after `/10x-plan`, `/10x-implement`, or `/10x-archive` flip an item's status, or after issues are relabeled/closed directly in Linear.

- **Workspace / Team:** `Mateusz` (only team in the workspace; team key `MAT`)
- **Project:** [`YT-Niche-Adviser`](https://linear.app/mateusz-yt-niche-advisor/project/yt-niche-adviser-1534140fd428) — linked to the GitHub repo via a project resource link
- **Milestone:** `M-1: MVP core loop` (inside the project above) — **complete, all 7 issues Done**
- **Snapshot taken:** 2026-09-07, created in one pass from `context/foundation/tasks-github.md` + full GitHub issue bodies
- **Last refresh:** 2026-09-13 (close-out) — `MAT-8` (S-02), `MAT-9` (S-03) and `MAT-23` (S-04) moved In Progress → Done; `MAT-24` (S-05) created directly as Done, closing the gap flagged in the previous two refreshes. Milestone M-1 is now closed in `roadmap.md`. See "Refresh log".

## Milestone M-1 — complete (7 issues, all Done)

| Issue | Roadmap ID | Type | Title | Linear status | Labels | GitHub source |
| ----- | ---------- | ---- | ----- | ------------- | ------ | ------------- |
| [MAT-5](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-5/f-01-domkniecie-must-have-logowania-google-oauth) | F-01 | Foundation | Domknięcie must-have logowania (Google OAuth) | **Done** | `roadmap-foundation` | [#1](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/1) |
| [MAT-6](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-6/f-02-model-danych-profilu-kanalu-rls-per-owner) | F-02 | Foundation | Model danych profilu kanału (RLS per-owner) | **Done** | `roadmap-foundation` | [#2](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/2) |
| [MAT-7](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-7/s-01-uzytkownik-tworzy-i-edytuje-profil-kanalu) | S-01 | Slice | Użytkownik tworzy i edytuje profil kanału | **Done** | `roadmap-slice` | [#3](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/3) |
| [MAT-8](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-8/s-02-uzytkownik-uruchamia-analize-i-widzi-ranking-okazji-gwiazda) | S-02 | Slice (★ north star) | Użytkownik uruchamia analizę i widzi ranking okazji | **Done** | `roadmap-slice` | [#4](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/4) |
| [MAT-9](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-9/s-03-uzytkownik-zapisuje-i-przeglada-okazje-contentowe) | S-03 | Slice | Użytkownik zapisuje i przegląda okazje contentowe | **Done** | `roadmap-slice` | [#5](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/5) |
| [MAT-23](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-23/s-04-strona-glowna-mowi-o-produkcie-a-logowanie-dzieje-sie-w-dialogu) | S-04 | Slice | Strona główna mówi o produkcie, a logowanie dzieje się w dialogu | **Done** | `roadmap-slice` | [#19](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/19) |
| [MAT-24](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-24/s-05-profil-kanalu-ma-awatar-wgrany-albo-wygenerowany) | S-05 | Slice | Profil kanału ma awatar — wgrany albo wygenerowany | **Done** | `roadmap-slice` | [#20](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/20) |

**Dependency chain (historical):** `MAT-6 → MAT-7 → MAT-8 (★) → MAT-9`, with `MAT-5`, `MAT-23` and `MAT-24` independent. The `blockedBy` relations are left in place as documentation of the technical graph; they are inert now that every item is Done.

`MAT-8` (S-02, the north-star slice) carries **High priority** — a field GitHub Issues has no equivalent for, added to flag it as the highest-value/highest-risk item in the milestone. It remains set.

## Open, outside the milestone

| Issue | Type | Title | Linear status |
| ----- | ---- | ----- | ------------- |
| [MAT-10](https://linear.app/mateusz-yt-niche-advisor/issue/MAT-10/question-shape-notes-quality-cross-check-nie-zostal-ukonczony) | Question | Shape-notes quality cross-check nie został ukończony | Todo, non-blocking |

Mirrors GitHub `#6`, which was detached from milestone M-1 in the same close-out: it is a `roadmap.md` **Open Roadmap Question**, never an `F-NN`/`S-NN` deliverable.

## What closed the milestone

`MAT-8` (S-02) and `MAT-24` (S-05) were the last two items, both closed on 2026-09-13:

- **S-02** — `/10x-impl-review` on the full 5-phase plan returned **NEEDS ATTENTION**: 0 critical, 3 warnings, 3 observations, and no *undocumented* plan drift. Triaged 5 fixed / 1 accepted. The fixes: a `AbortSignal.timeout` on the YouTube fetch (the sibling Anthropic call already had one), `Promise.allSettled` in both `fetchCompetitorVideos` and `resolveChannelRefs` so one failing competitor no longer discards the whole run, and containment of raw PostgREST error strings that were reaching the browser. Archived to `context/archive/2026-09-10-analyze-and-rank-opportunities/`.
- **S-05** — already `impl_reviewed`; its last automated row (`5.1 CI is green on push to master`) was closed against `99a63ea`. Archived to `context/archive/2026-09-13-channel-profile-avatar/`.

### The CI finding, worth carrying forward

`5.1` could never have been satisfied before 2026-09-13, and not for a code reason: **the repo is a fork**, and GitHub disables workflows on forks until the owner enables them explicitly. `gh api .../actions/runs` returned `total_count: 0` — CI had never executed once. Every "CI is green" criterion recorded in every earlier slice was assumed, not observed.

Once Actions was enabled and six repository secrets provisioned (there were **zero**), the first run failed at `npx astro sync` — and the cause was **S-05 itself**. Its `ai` binding has no local emulation, so `@cloudflare/vite-plugin` opens a remote proxy session during `astro sync`/`astro build`, but `ci.yml` set `env:` only on the `npm run build` step. Fixed in `99a63ea`. S-05 broke the check meant to catch S-05.

Three consecutive green runs followed, including the project's first CI deploy: `https://yt-niche-adviser.statkiewicz-mateusz.workers.dev`.

### Deferred, not lost

- **S-02 rows 3.6, 3.8, 5.13** and **S-05 rows 5.3–5.5** were archived open. All need a human at a console (Google Cloud quota, Workers Logs, a browser against production). `5.13` is the one that matters: a 10 ms CPU overrun on the free plan surfaces as an intermittent Error 1102 with no clean error.
- **NDJSON streaming escalation** — S-02's measured p95 of ~11.2 s at the 5-competitor cap exceeded the plan's own ~10 s escalation line, with the single batched Anthropic call isolated as ~85 % of latency. Moved into `roadmap.md`'s `## Parked` before archiving, so it survives the change folder going read-only. **It has no mirror issue here or on GitHub** — unlike every other parked item.

## Parked / not planned (12 issues, all Canceled)

Set to Linear state `Canceled` — mirrors GitHub's `state_reason: not_planned` (explicitly out of MVP scope, not "later without a decision"). Unchanged by the close-out.

| Issue | Title | GitHub source |
| ----- | ----- | ------------- |
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
| ----- | ----- | ------- |
| `roadmap-foundation` | `#5319e7` | Cross-cutting enabler (F-NN) — no user-visible outcome on its own |
| `roadmap-slice` | `#0e8a16` | Vertical, user-visible capability (S-NN) |
| `roadmap-parked` | `#cccccc` | Explicitly out of MVP scope (PRD Non-Goals / demoted nice-to-have) |
| `status-ready` | `#0e8a16` | Prerequisites met — safe to `/10x-plan` now |
| `status-proposed` | `#fbca04` | Sequenced but blocked on an earlier item |
| `question` | `#d876e3` | Open roadmap question, not yet a plannable item |

`status-ready` and `status-proposed` are defined but **applied to nothing**. They were progressively removed as items started, and the last holdouts were stripped on the GitHub side during the close-out. Items went straight from proposed to started to done, so the ready state never got used in practice.

Note: the workspace also ships three unrelated default labels (`Feature`, `Bug`, `Improvement`) from Linear's onboarding — not part of the roadmap mirror, left untouched. Four unrelated onboarding issues (`MAT-1`–`MAT-4`) also pre-existed in the team and were left as-is.

## Mapping notes — how GitHub state translates to Linear

- **Open/ready or blocked (GitHub label `status-ready`/`status-proposed`)** → Linear workflow state: `Todo` for ready items, `Backlog` for blocked/proposed items.
- **Closed as `not_planned` (GitHub)** → Linear state `Canceled` (not `Done` — these were never completed, they were descoped).
- **GitHub "Prerequisites" body text** → real Linear `blockedBy` issue relations, in addition to keeping the text in the description for readability.
- **North-star slice (★)** → additionally marked **High priority** in Linear (MAT-8), since GitHub Issues has no priority field to carry that signal.
- **`roadmap.md` status → Linear state:** `done` → `Done`, `in-progress` → `In Progress`, `ready` → `Todo`, `proposed` → `Backlog`.
- Each Linear issue description mirrors the full GitHub issue body and ends with a link back to the source GitHub issue; a matching GitHub-URL attachment gives one-click cross-navigation.

## Refresh log

**2026-09-12** — reconciled against `roadmap.md`; Linear had never been advanced past 2026-09-09. Four changes: `MAT-5` (F-01) and `MAT-6` (F-02) In Progress → Done; `MAT-7` (S-01) Backlog → Done; `MAT-8` (S-02) Backlog → In Progress. A Phase 1 progress comment was posted to MAT-8.

**2026-09-13** — S-04 and S-05 had been added to `roadmap.md` after the previous refresh and had never reached Linear. `MAT-23` (S-04) created as In Progress with a completion comment. **S-05 was flagged as still missing and not created.**

**2026-09-13 (later)** — `/10x-implement` landed all three phases of S-03 and `/10x-impl-review` returned APPROVED. `MAT-9` Backlog → In Progress, with a completion comment.

**2026-09-13 (close-out)** — milestone M-1 closed in `roadmap.md` after S-02 and S-05 were reviewed, triaged and archived. Four changes applied:

| Issue | Was | Now | Driven by |
| ----- | --- | --- | --------- |
| MAT-8 (S-02) | In Progress | **Done** | `/10x-impl-review` NEEDS ATTENTION → triaged 5 fixed / 1 accepted → `/10x-archive` |
| MAT-9 (S-03) | In Progress | **Done** | archived 2026-09-13; roadmap S-03 `done` |
| MAT-23 (S-04) | In Progress | **Done** | archived 2026-09-13; roadmap S-04 `done` |
| MAT-24 (S-05) | *did not exist* | **Created, Done** | roadmap S-05 `done`; closes the gap open since the 2026-09-13 refresh |

The three "Known inconsistency" notes carried by previous revisions of this file are now **all resolved**: S-02's roadmap status no longer lags its real state; F-02 and S-01 are `done` in both the roadmap and Linear; and GitHub state was written back for the first time (see `tasks-github.md` → "Close-out pass").

One bookkeeping gap remains: **F-02 and S-01's change folders are still under `context/changes/`**, not `context/archive/`. Both are `done` everywhere else. `/10x-archive channel-profile-data-model` and `/10x-archive channel-profile-crud` would close it.

## Keeping this in sync

This file was generated by reading `context/foundation/tasks-github.md` and live GitHub issue bodies, then creating the matching project/milestone/labels/issues in Linear via the `linear-server` MCP tools. Unlike `tasks-github.md` — historically read-only until the 2026-09-13 close-out — this file has always pushed state changes to Linear on each refresh, which is why Linear stayed closer to reality. Nothing here is live, though: if issues get closed, relabeled, or added directly in Linear (bypassing `roadmap.md`), this snapshot goes stale. Re-run the read-and-reconcile pass to refresh it.
