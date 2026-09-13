# GitHub Task Mirror — YT-Niche-Adviser

> Snapshot of `context/foundation/roadmap.md` as migrated to GitHub Issues in `Keitar6/10xDevs-YT-Niche-Adviser`.
> **Source of truth for planning stays `roadmap.md`** — this file is a read-oriented mirror of what currently exists on GitHub, so anyone using GitHub as their task board doesn't need to open the markdown roadmap to see status. Regenerate (or hand-edit) whenever GitHub state drifts from `roadmap.md` — e.g. after `/10x-plan`, `/10x-implement`, or `/10x-archive` flip an item's status.
> **Status column below is `roadmap.md`'s Status field, not GitHub's own open/closed state** — see "Known inconsistency" at the bottom: GitHub issue state and labels are not pushed to when an item progresses, so they lag behind the roadmap.

- **Repo:** [`Keitar6/10xDevs-YT-Niche-Adviser`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser)
- **Milestone:** [`M-1: MVP core loop`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/milestone/1) — open, 8 open / 0 closed (GitHub has not closed any milestone issue regardless of roadmap progress; see "Known inconsistency")
- **Snapshot taken:** 2026-09-13 (refreshed from 2026-09-07; read live via `gh issue list -R Keitar6/10xDevs-YT-Niche-Adviser --state all --json number,title,state,labels,milestone,closed`, cross-referenced against `roadmap.md`)

## Milestone M-1 — active work (8 issues, all open on GitHub)

| Issue | Roadmap ID | Type | Title | Status (roadmap.md) | Prerequisites | GitHub labels (as currently set) |
|-------|------------|------|-------|--------|----------------|--------|
| [#1](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/1) | F-01 | Foundation | Domknięcie must-have logowania (Google OAuth) | done (archived) | — | `roadmap-foundation`, `status-ready` |
| [#2](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/2) | F-02 | Foundation | Model danych profilu kanału (RLS per-owner) | done | — | `roadmap-foundation`, `status-ready` |
| [#3](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/3) | S-01 | Slice | Użytkownik tworzy i edytuje profil kanału | done | [#2](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/2) | `roadmap-slice`, `status-proposed` |
| [#4](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/4) | S-02 | Slice (★ north star) | Użytkownik uruchamia analizę i widzi ranking okazji | in-progress | [#3](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/3) | `roadmap-slice`, `status-proposed` |
| [#5](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/5) | S-03 | Slice | Użytkownik zapisuje i przegląda okazje contentowe | **in-progress** — implemented, impl-reviewed 2026-09-13, pending `/10x-archive` | [#4](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/4) | `roadmap-slice`, `status-proposed` |
| [#19](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/19) | S-04 | Slice | Strona główna mówi o produkcie, a logowanie dzieje się w dialogu | done (archived) | — (po S-03, scope decision not technical) | `roadmap-slice`, `status-proposed` |
| [#20](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/20) | S-05 | Slice | Profil kanału ma awatar — wgrany albo wygenerowany | in-progress | S-01 (po S-03, scope decision not technical) | `roadmap-slice`, `status-proposed` |
| [#6](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/6) | — | Question | Shape-notes quality cross-check nie został ukończony | open, non-blocking | — | `question` |

**Dependency chain:** `#2 → #3 → #4 (★) → #5`, z `#1` niezależnym. `#19` i `#20` są sekwencjonowane po `#5` decyzją zakresową (nie grafem zależności) — patrz `roadmap.md`.

**Progress so far:** F-01, F-02, S-01, S-04 are archived (`done`, moved to `context/archive/`). S-02, S-03, S-05 are actively in flight — S-03 (`save-and-view-opportunities`) landed all three implementation phases plus an APPROVED `/10x-impl-review` pass on 2026-09-13 (`context/changes/save-and-view-opportunities/`), and is the closest of the three to being ready for `/10x-archive`.

## Parked / not planned (12 issues, all closed)

Zamknięte z `state_reason: not_planned` — jawnie poza zakresem MVP, nie "do zrobienia później bez decyzji".

| Issue | Title |
|-------|-------|
| [#7](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/7) | Monitoring newsów z zewnętrznych źródeł |
| [#8](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/8) | Planer produkcji / kanban |
| [#9](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/9) | Konfigurator workflow (edytor, thumbnail) |
| [#10](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/10) | Niche discovery (odkrywanie nowych nisz od zera) |
| [#11](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/11) | Śledzenie / analityka własnego kanału |
| [#12](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/12) | Płatności i plany subskrypcyjne |
| [#13](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/13) | Zaawansowany, uczony model trafności niszy |
| [#14](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/14) | Wiele profili kanałów naraz |
| [#15](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/15) | Automatyczne / cykliczne analizy |
| [#16](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/16) | Analiza Shorts |
| [#17](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/17) | Usuwanie profilu kanału (FR-005) |
| [#18](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/18) | Pełny workflow statusów okazji (FR-012) |

## Labels in use

| Label | Meaning |
|-------|---------|
| `roadmap-foundation` | Cross-cutting enabler (F-NN) — no user-visible outcome on its own |
| `roadmap-slice` | Vertical, user-visible capability (S-NN) |
| `roadmap-parked` | Explicitly out of MVP scope (PRD Non-Goals / demoted nice-to-have) |
| `status-ready` | Prerequisites met — safe to `/10x-plan` now |
| `status-proposed` | Sequenced but blocked on an earlier item |
| `question` | Open roadmap question, not yet a plannable item |

## Known inconsistency

GitHub issue state and labels are **not** pushed to when a roadmap item progresses — this file's Status column follows `roadmap.md` (the source of truth), while the GitHub labels column shows what's actually set on the issue right now. Concretely: `#1` (F-01) and `#19` (S-04) are both archived/`done` in the roadmap, yet remain **open** on GitHub with their original `status-ready`/`status-proposed` labels — confirmed live on 2026-09-13. Unlike `context/foundation/tasks-linear.md`, which actively pushes state changes to Linear via MCP on each refresh, this file has never round-tripped writes back to GitHub; it is a point-in-time read, not a live mirror. If GitHub-side hygiene (closing issues, relabeling) is ever wanted, it would need its own explicit pass with `gh issue edit`/`gh issue close`.

## Keeping this in sync

This file was generated in one pass from a fresh `gh api` read (issue state, labels, milestone) cross-referenced against `roadmap.md`'s dependency/risk fields. Nothing here is live — if issues get closed, relabeled, or new ones get added directly on GitHub (bypassing `roadmap.md`), this snapshot goes stale. Re-run the same read-and-cross-reference pass to refresh it, or ask to have it regenerated.
