# GitHub Task Mirror — YT-Niche-Adviser

> Snapshot of `context/foundation/roadmap.md` as migrated to GitHub Issues in `Keitar6/10xDevs-YT-Niche-Adviser`.
> **Source of truth for planning stays `roadmap.md`** — this file is a read-oriented mirror of what currently exists on GitHub, so anyone using GitHub as their task board doesn't need to open the markdown roadmap to see status. Regenerate (or hand-edit) whenever GitHub state drifts from `roadmap.md` — e.g. after `/10x-plan`, `/10x-implement`, or `/10x-archive` flip an item's status.

- **Repo:** [`Keitar6/10xDevs-YT-Niche-Adviser`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser)
- **Milestone:** [`M-1: MVP core loop`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/milestone/1) — open, 6 open / 0 closed
- **Snapshot taken:** 2026-09-07

## Milestone M-1 — active work (6 issues, all open)

| Issue | Roadmap ID | Type | Title | Status | Prerequisites | Labels |
|-------|------------|------|-------|--------|----------------|--------|
| [#1](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/1) | F-01 | Foundation | Domknięcie must-have logowania (Google OAuth) | ready | — | `roadmap-foundation`, `status-ready` |
| [#2](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/2) | F-02 | Foundation | Model danych profilu kanału (RLS per-owner) | ready | — | `roadmap-foundation`, `status-ready` |
| [#3](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/3) | S-01 | Slice | Użytkownik tworzy i edytuje profil kanału | proposed | [#2](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/2) | `roadmap-slice`, `status-proposed` |
| [#4](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/4) | S-02 | Slice (★ north star) | Użytkownik uruchamia analizę i widzi ranking okazji | proposed | [#3](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/3) | `roadmap-slice`, `status-proposed` |
| [#5](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/5) | S-03 | Slice | Użytkownik zapisuje i przegląda okazje contentowe | proposed | [#4](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/4) | `roadmap-slice`, `status-proposed` |
| [#6](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/6) | — | Question | Shape-notes quality cross-check nie został ukończony | open, non-blocking | — | `question` |

**Dependency chain:** `#2 → #3 → #4 (★) → #5`, z `#1` niezależnym (można równolegle). Ready teraz: **#1** i **#2**. Rekomendowany następny krok: `#2` (odblokowuje `#3` → gwiazdę przewodnią `#4`).

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

## Keeping this in sync

This file was generated in one pass from a fresh `gh api` read (issue state, labels, milestone) cross-referenced against `roadmap.md`'s dependency/risk fields. Nothing here is live — if issues get closed, relabeled, or new ones get added directly on GitHub (bypassing `roadmap.md`), this snapshot goes stale. Re-run the same read-and-cross-reference pass to refresh it, or ask to have it regenerated.
