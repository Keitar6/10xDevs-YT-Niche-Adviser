# GitHub Task Mirror — YT-Niche-Adviser

> Snapshot of `context/foundation/roadmap.md` as migrated to GitHub Issues in `Keitar6/10xDevs-YT-Niche-Adviser`.
> **Source of truth for planning stays `roadmap.md`** — this file is a read-oriented mirror of what currently exists on GitHub, so anyone using GitHub as their task board doesn't need to open the markdown roadmap to see status. Regenerate (or hand-edit) whenever GitHub state drifts from `roadmap.md` — e.g. after `/10x-plan`, `/10x-implement`, or `/10x-archive` flip an item's status.

- **Repo:** [`Keitar6/10xDevs-YT-Niche-Adviser`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser)
- **Active milestone:** [`M-2: Provable quality floor`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/milestone/2) — **open**, 5 open / 0 closed
- **Previous milestone:** [`M-1: MVP core loop`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/milestone/1) — closed, 0 open / 7 closed
- **Snapshot taken:** 2026-09-13 (M-2 opening pass — milestone and issues created live via `gh`, then read back)

## Milestone M-2 — active (5 issues, all open)

| Issue                                                                | Roadmap ID | Type                 | Title                                   | Status (roadmap.md) | Prerequisites    | GitHub labels                           |
| -------------------------------------------------------------------- | ---------- | -------------------- | --------------------------------------- | ------------------- | ---------------- | --------------------------------------- |
| [#22](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/22) | F-03       | Foundation           | Provable access control                 | ready               | —                | `roadmap-foundation`, `status-ready`    |
| [#23](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/23) | F-04       | Foundation           | Analyze-pipeline boundary resilience    | ready               | —                | `roadmap-foundation`, `status-ready`    |
| [#24](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/24) | F-05       | Foundation           | Scoring oracle and spec conformance     | ready               | —                | `roadmap-foundation`, `status-ready`    |
| [#25](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/25) | F-06       | Foundation           | Quality-gates wiring                    | proposed            | F-03, F-04, F-05 | `roadmap-foundation`, `status-proposed` |
| [#18](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/18) | S-06       | Slice (★ north star) | Opportunity status transitions (FR-012) | proposed            | F-03             | `roadmap-slice`, `status-proposed`      |

**Dependency chain:** `#22 → #18 (★)` is the leading chain; `#23` and `#24` are independent and parallel to it; `#25` depends on all three foundations (`#22`, `#23`, `#24`).

**Mapping to `test-plan.md` §3:** F-03 → Phase 2, F-04 → Phase 1, F-05 → Phase 3, F-06 → Phase 4. S-06 has no §3 counterpart — it is the product addition surfaced by the MVP audit, not a test phase. Note that M-2 deliberately leads with §3's _Phase 2_ rather than its Phase 1, because `main_goal: speed` prioritises the element that discharges a written requirement; see F-03's Risk line in `roadmap.md`.

### #18 was un-parked, not newly created

`#18` previously existed as `[Parked] Pełny workflow statusów okazji (FR-012)`, closed with `state_reason: not_planned` and labelled `roadmap-parked`. On 2026-09-13 it was **reopened in place** (not replaced by a new issue), retitled, relabelled `roadmap-slice` + `status-proposed`, and assigned to M-2. Its original parking rationale is preserved verbatim inside the issue body, because the reopen rests on a _different_ argument rather than a reversal: the MVP audit found the headline record has no update path, and the owner-scoped update policy already in the schema has no caller. The production-planner scope judgement that justified parking still stands.

## Milestone M-1 — complete (7 issues, all closed)

| Issue                                                                | Roadmap ID | Type       | Title                                                            | Archived to                                                  |
| -------------------------------------------------------------------- | ---------- | ---------- | ---------------------------------------------------------------- | ------------------------------------------------------------ |
| [#1](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/1)   | F-01       | Foundation | Domknięcie must-have logowania (Google OAuth)                    | `context/archive/2026-09-08-google-oauth-login/`             |
| [#2](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/2)   | F-02       | Foundation | Model danych profilu kanału (RLS per-owner)                      | `context/archive/2026-09-09-channel-profile-data-model/`     |
| [#3](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/3)   | S-01       | Slice      | Użytkownik tworzy i edytuje profil kanału                        | `context/archive/2026-09-09-channel-profile-crud/`           |
| [#4](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/4)   | S-02       | Slice (★)  | Użytkownik uruchamia analizę i widzi ranking okazji              | `context/archive/2026-09-10-analyze-and-rank-opportunities/` |
| [#5](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/5)   | S-03       | Slice      | Użytkownik zapisuje i przegląda okazje contentowe                | `context/archive/2026-09-13-save-and-view-opportunities/`    |
| [#19](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/19) | S-04       | Slice      | Strona główna mówi o produkcie, a logowanie dzieje się w dialogu | `context/archive/2026-09-13-landing-and-auth-shell/`         |
| [#20](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/20) | S-05       | Slice      | Profil kanału ma awatar — wgrany albo wygenerowany               | `context/archive/2026-09-13-channel-profile-avatar/`         |

All seven change folders are now under `context/archive/`. The bookkeeping gap flagged by earlier revisions of this file — F-02 and S-01 still sitting in `context/changes/` — was closed on 2026-09-13 by `/10x-archive channel-profile-data-model` and `/10x-archive channel-profile-crud`.

### The CI finding, worth carrying forward

`S-05`'s last automated criterion could never have been satisfied before 2026-09-13, and not for a code reason: **the repo is a fork**, and GitHub disables workflows on forks until the owner enables them explicitly. `gh api .../actions/runs` returned `total_count: 0` — CI had never executed once. Every "CI is green" criterion recorded in every earlier slice was assumed, not observed.

Once Actions was enabled and six repository secrets provisioned (there were **zero**), the first run failed at `npx astro sync` — and the cause was S-05 itself. Its `ai` binding has no local emulation, so the Cloudflare vite plugin opens a remote proxy session during `astro sync`/`astro build`, but `ci.yml` set `env:` only on the `npm run build` step. Fixed in `99a63ea`. S-05 broke the check meant to catch S-05.

Three consecutive green runs followed, including the project's first CI deploy: `https://yt-niche-adviser.statkiewicz-mateusz.workers.dev`.

## Open, outside any milestone

| Issue                                                              | Type     | Title                                                | State                  |
| ------------------------------------------------------------------ | -------- | ---------------------------------------------------- | ---------------------- |
| [#6](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/6) | Question | Shape-notes quality cross-check nie został ukończony | **open**, non-blocking |

`#6` was detached from milestone M-1 during the M-1 close-out and was **not** attached to M-2. It is an entry in `roadmap.md`'s `## Open Roadmap Questions`, never an `F-NN`/`S-NN` deliverable.

Two further Open Roadmap Questions were added when M-2 opened and have **no mirror issues yet**:

1. The end-to-end test criterion parked in `shape-notes.md` contradicts `test-plan.md` §7, which rules end-to-end testing out entirely. Neither document cites the other. Gates whether M-2 needs a fifth element.
2. Where policy tests that need a container runtime run — CI or local-only. Gates F-06 (`#25`).

## Parked / not planned (11 issues, all closed)

Closed with `state_reason: not_planned` — explicitly out of MVP scope, not "to be done later without a decision". **Down from 12:** `#18` left this set when it was un-parked into S-06 (see above).

| Issue                                                                | Title                                            |
| -------------------------------------------------------------------- | ------------------------------------------------ |
| [#7](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/7)   | Monitoring newsów z zewnętrznych źródeł          |
| [#8](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/8)   | Planer produkcji / kanban                        |
| [#9](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/9)   | Konfigurator workflow (edytor, thumbnail)        |
| [#10](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/10) | Niche discovery (odkrywanie nowych nisz od zera) |
| [#11](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/11) | Śledzenie / analityka własnego kanału            |
| [#12](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/12) | Płatności i plany subskrypcyjne                  |
| [#13](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/13) | Zaawansowany, uczony model „trafności niszy"     |
| [#14](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/14) | Wiele profili kanałów naraz                      |
| [#15](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/15) | Automatyczne / cykliczne analizy                 |
| [#16](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/16) | Analiza Shorts                                   |
| [#17](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/17) | Usuwanie profilu kanału (FR-005, nice-to-have)   |

The **NDJSON streaming escalation** remains parked in `roadmap.md` with no mirror issue here — unlike every other parked item. `test-plan.md` §7 additionally classes it as observability rather than a test subject.

## Labels in use

| Label                | Color     | Meaning                                                            |
| -------------------- | --------- | ------------------------------------------------------------------ |
| `roadmap-foundation` | `#5319e7` | Cross-cutting enabler (F-NN) — no user-visible outcome on its own  |
| `roadmap-slice`      | `#0e8a16` | Vertical, user-visible capability (S-NN)                           |
| `roadmap-parked`     | `#cccccc` | Explicitly out of MVP scope (PRD Non-Goals / demoted nice-to-have) |
| `status-ready`       | `#0e8a16` | Prerequisites met — safe to `/10x-plan` now                        |
| `status-proposed`    | `#fbca04` | Sequenced but blocked on an earlier item                           |
| `question`           | `#d876e3` | Open roadmap question, not yet a plannable item                    |

`status-ready` / `status-proposed` went unused throughout M-1 (items jumped straight from proposed to started to done). They are **applied for the first time in M-2**, since GitHub has no state field between open and closed and the ready/proposed distinction is load-bearing for picking the next `/10x-plan` target.

## Refresh log

**2026-09-13 (M-1 close-out)** — first write-back pass to GitHub. Resolved the long-standing "Known inconsistency" where issues were left open and mislabelled regardless of roadmap progress; `#6` detached from M-1.

**2026-09-13 (M-2 opening)** — milestone `M-2: Provable quality floor` created (`milestone/2`). Four issues created (`#22`–`#25`) for F-03–F-06. `#18` reopened in place and converted from a parked item into S-06. Parked set dropped 12 → 11. Triggered by an MVP audit of the repository plus the arrival of `context/foundation/test-plan.md`, whose §3 rollout supplies M-2's test sequencing.
