# GitHub Task Mirror — YT-Niche-Adviser

> Snapshot of `context/foundation/roadmap.md` as migrated to GitHub Issues in `Keitar6/10xDevs-YT-Niche-Adviser`.
> **Source of truth for planning stays `roadmap.md`** — this file is a read-oriented mirror of what currently exists on GitHub, so anyone using GitHub as their task board doesn't need to open the markdown roadmap to see status. Regenerate (or hand-edit) whenever GitHub state drifts from `roadmap.md` — e.g. after `/10x-plan`, `/10x-implement`, or `/10x-archive` flip an item's status.
> **As of the 2026-09-13 close-out, GitHub state and `roadmap.md` agree.** The long-standing "Known inconsistency" recorded in earlier revisions of this file — issues left open and mislabelled regardless of roadmap progress — was resolved by an explicit write-back pass. See "Close-out pass" below.

- **Repo:** [`Keitar6/10xDevs-YT-Niche-Adviser`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser)
- **Milestone:** [`M-1: MVP core loop`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/milestone/1) — **closed**, 0 open / 7 closed
- **Snapshot taken:** 2026-09-13 (read live via `gh issue list` + `gh api .../milestones`, cross-referenced against `roadmap.md`)

## Milestone M-1 — complete (7 issues, all closed)

| Issue | Roadmap ID | Type | Title | Status (roadmap.md) | Archived to | GitHub labels |
|-------|------------|------|-------|--------|----------------|--------|
| [#1](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/1) | F-01 | Foundation | Domknięcie must-have logowania (Google OAuth) | done | `context/archive/2026-09-08-google-oauth-login/` | `roadmap-foundation` |
| [#2](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/2) | F-02 | Foundation | Model danych profilu kanału (RLS per-owner) | done | — *(folder still active)* | `roadmap-foundation` |
| [#3](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/3) | S-01 | Slice | Użytkownik tworzy i edytuje profil kanału | done | — *(folder still active)* | `roadmap-slice` |
| [#4](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/4) | S-02 | Slice (★ north star) | Użytkownik uruchamia analizę i widzi ranking okazji | done | `context/archive/2026-09-10-analyze-and-rank-opportunities/` | `roadmap-slice` |
| [#5](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/5) | S-03 | Slice | Użytkownik zapisuje i przegląda okazje contentowe | done | `context/archive/2026-09-13-save-and-view-opportunities/` | `roadmap-slice` |
| [#19](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/19) | S-04 | Slice | Strona główna mówi o produkcie, a logowanie dzieje się w dialogu | done | `context/archive/2026-09-13-landing-and-auth-shell/` | `roadmap-slice` |
| [#20](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/20) | S-05 | Slice | Profil kanału ma awatar — wgrany albo wygenerowany | done | `context/archive/2026-09-13-channel-profile-avatar/` | `roadmap-slice` |

**Dependency chain (historical):** `#2 → #3 → #4 (★) → #5`, z `#1` niezależnym. `#19` i `#20` były sekwencjonowane po `#5` decyzją zakresową, nie grafem zależności.

## Open, outside any milestone

| Issue | Type | Title | State |
|-------|------|-------|-------|
| [#6](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/6) | Question | Shape-notes quality cross-check nie został ukończony | **open**, non-blocking |

`#6` was **detached from milestone M-1** during the close-out. It is an entry in `roadmap.md`'s `## Open Roadmap Questions`, never an `F-NN`/`S-NN` deliverable, so holding the milestone open for it would have misrepresented the milestone as incomplete. It remains open and unassigned to any milestone.

## Parked / not planned (12 issues, all closed)

Zamknięte z `state_reason: not_planned` — jawnie poza zakresem MVP, nie "do zrobienia później bez decyzji". Unchanged by the close-out.

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
| `question` | Open roadmap question, not yet a plannable item |

`status-ready` and `status-proposed` **still exist as label definitions but are no longer applied to any issue.** They were stripped from all seven milestone issues during the close-out: a closed, completed issue carrying `status-proposed` ("sequenced but blocked on an earlier item") is a contradiction, and leaving them would have preserved exactly the stale-signal problem this pass set out to fix. Re-apply them if a future milestone reintroduces the ready/proposed distinction.

## Close-out pass (2026-09-13)

The first write-back this file has ever performed. Every prior revision was a point-in-time read, which is why GitHub had accumulated seven months' worth of drift: all 8 milestone issues sat open with their original labels regardless of roadmap progress.

| Action | Scope |
|--------|-------|
| Removed `status-proposed` / `status-ready` | `#1`, `#2`, `#3`, `#4`, `#5`, `#19`, `#20` |
| Closed with a close-out comment naming the roadmap ID and archive path | `#1`, `#2`, `#3`, `#4`, `#5`, `#19`, `#20` |
| Detached from milestone M-1, left open | `#6` |
| Milestone `M-1: MVP core loop` set to `closed` | 0 open / 7 closed |

`#2` (F-02) and `#3` (S-01) are closed and `done` on the roadmap, but their change folders are **still under `context/changes/`** rather than `context/archive/` — they predate the archive habit. Running `/10x-archive channel-profile-data-model` and `/10x-archive channel-profile-crud` would close that gap; nothing depends on it.

## Keeping this in sync

Historically this file was a read-only mirror and drifted freely. The 2026-09-13 pass changed that by writing back, so GitHub and `roadmap.md` currently agree — but nothing enforces it. If issues get closed, relabeled, or added directly on GitHub (bypassing `roadmap.md`), this snapshot goes stale again. Re-run the read-and-cross-reference pass to refresh it, or ask to have it regenerated.
