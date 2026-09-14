---
project: "YT-Niche-Adviser"
version: 3
status: draft
created: 2026-09-07
updated: 2026-09-14
prd_version: 2
main_goal: speed
top_blocker: decisions
milestone_id: provable-quality-floor
milestone_seq: 2
milestone_status: open
---

# Roadmap: YT-Niche-Adviser

> Derived from `context/foundation/test-plan.md` (primary — its §3 Phased Rollout owns test sequencing) + `context/foundation/prd.md` (v2) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-2: Provable quality floor — from proven isolation to enforced gates** — Status: open

- **Intent:** Turn the project's written quality claims into enforced ones. M-1 delivered the must-have loop; M-2 proves the parts of it that documents already promise but nothing verifies — starting with per-user isolation, which the PRD names as a requirement to be *verified by test*. Along the way it closes the one create/read/update/delete gap on the product's headline item.
- **Source materials:** `context/foundation/test-plan.md` (risk map §2, phased rollout §3) and `context/foundation/prd.md` (v2)
- **Done when:** every F-NN and S-NN below is `done`.
- **Scope anchors:**
  - MS-01: Per-user isolation across channel profiles, saved opportunities and the avatar objects is proven by automated tests, discharging the non-functional requirement that explicitly names a test (`test-plan.md` §3 Phase 2, risk #3).
  - MS-02: A saved opportunity can be moved through its status lifecycle, giving that record's update path its first caller (surfaced by the MVP audit; un-parks the FR-012 entry).
  - MS-03: Unauthenticated and cross-caller access to every data-touching route is closed by exhaustive, inventory-driven tests (`test-plan.md` §3 Phase 2, risk #4).
  - MS-04: The analyze run degrades into a ranking plus an explanation when an external provider misbehaves, never into an error page or a blank screen (`test-plan.md` §3 Phase 1, risks #1 and #2).
  - MS-05: The score provably matches the definition the PRD states, and the existing suite is able to fail for the right reason (`test-plan.md` §3 Phase 3, risk #5).
  - MS-06: The gates the earlier phases established are enforced on every change rather than merely documented (`test-plan.md` §3 Phase 4).

## Vision recap

Solo-twórca YouTube ręcznie przegląda kanały 3–5 kuratelowanych konkurentów, żeby zrozumieć, co u nich „wystrzeliło" ponad normę — żmudne, czasochłonne, bez twardych liczb. Produkt normalizuje wyniki konkurentów (wyświetlenia filmu względem **mediany** danego kanału z okna czasowego — **outlier_score**) i zwraca ranking okazji contentowych z jednozdaniowym uzasadnieniem, żeby decyzja „o czym nagrać" miała twarde podstawy zamiast być „na czuja".

## North star

**S-06: User moves a saved opportunity through its status lifecycle** — the only element in M-2 with a user-visible outcome, and the one that closes the audit's create/read/update/delete gap on the product's headline record. It is inseparable from **F-03**, which must land first: F-03 proves the ownership guarantee on the very write path S-06 introduces.

> Gwiazda przewodnia (ang. north star) to najmniejszy, kompletny end-to-end fragment, którego udane dostarczenie dowodzi, że kluczowa hipoteza produktu działa — umieszczony tak wcześnie, jak pozwalają na to zależności, bo reszta ma znaczenie tylko wtedy, gdy ten fragment się sprawdzi. Ten gloss pojawia się tylko raz, przy pierwszym użyciu.

Note on ordering: `test-plan.md` §3 sequences its Phase 1 (boundary resilience) first, on the rationale that it defends the stated top worry on the highest-churn value chain. M-2 deliberately leads with §3 Phase 2 instead, because `main_goal: speed` puts the strict must-have path first — the shortest chain of work that satisfies the requirements the PRD marks as required rather than optional, with everything else deferred behind it — and Phase 2 is the only phase that discharges a written requirement *and* closes an audit gap. The two documents therefore disagree on order by design — see F-03's Risk line.

## At a glance

| ID | Change ID | Outcome (user can …) | Prerequisites | PRD refs | Status |
|----|-----------|----------------------|----------------|----------|--------|
| F-03 | `provable-user-isolation` | (foundation) access control is provable — per-user isolation across both tables and the avatar objects, and every data-touching route refuses a caller with no session | — | FR-002, MS-01, MS-03 | done |
| F-04 | `testing-analyze-boundary-resilience` | (foundation) a hostile or broken external response degrades into a ranking plus an explanation, never an error page or a blank screen | — | FR-006, FR-009, MS-04 | done |
| F-05 | `testing-scoring-oracle` | (foundation) the score provably means what the PRD says it means, and the existing suite can fail for the right reason | — | FR-007, FR-008, MS-05 | ready |
| F-06 | `testing-quality-gates` | (foundation) the floor the earlier phases established is enforced on every change | F-03, F-04, F-05 | MS-06 | proposed |
| S-06 | `opportunity-status-transitions` | user moves a saved opportunity through new → in production → done, and the change persists | F-03 | FR-012, MS-02 | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme | Chain | Note |
|--------|-------|-------|------|
| A | Access-control proof and the capability it guards | `F-03` → `S-06` | Leads M-2 under `main_goal: speed` — the only chain that closes both a written requirement and an audit gap. |
| B | Pipeline resilience, scoring correctness, then gates | `F-04` → `F-05` → `F-06` | Registered here so the roadmap reflects the full rollout, but sequencing inside this chain stays owned by `test-plan.md` §3. |

## Baseline

Repo state as of `2026-09-13` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro SSR pages plus React islands, per `tech-stack.md`.
- **Backend / API:** present — SSR API routes covering auth, profile, analyze, saved opportunities and avatar.
- **Data:** present — managed Postgres with four migrations applied and generated types checked in.
- **Auth:** present — cookie-based sessions, both email+password and Google OAuth, with middleware resolving the caller on every request.
- **Deploy / infra:** present — edge runtime with platform bindings declared; CI runs lint, tests and build, then auto-deploys on merge.
- **Observability:** partial — platform logs are enabled, but diagnostics are bare console calls; no logger and no error tracking.
- **Test infrastructure:** partial — a unit runner is configured and green, scoped to one service directory; no database policy tests exist, no boundary-faking library is installed, and no typecheck script is wired. This is the layer M-2 acts on.

## Foundations

### F-03: Provable access control

- **Outcome:** (foundation) Access control is provable rather than asserted: per-user isolation holds across channel profiles, saved opportunities and the avatar objects — per verb and per role — and every data-touching route refuses a caller with no session.
- **Change ID:** `provable-user-isolation`
- **PRD refs:** FR-002, Access Control, the non-functional requirement naming isolation as verifiable by test; MS-01, MS-03
- **Unlocks:** S-06 (proves the ownership guarantee on the update path S-06 introduces, before that path has a caller); the verification path the PRD's isolation requirement demands; the `database policy tests` gate in `test-plan.md` §5; the cookbook entries `test-plan.md` §6.3 and §6.4
- **Prerequisites:** — (a container runtime for the local database stack, already available)
- **Parallel with:** F-04, F-05
- **Blockers:** —
- **Unknowns:**
  - ~~Where policy tests that need a container runtime actually run.~~ **Evidenced, not open.** Measured during this element: local costs nothing and works today — `npm run test:db` runs 77 assertions across five files in under 0.1s CPU against an already-warm stack, and is now a wired local gate documented in `CLAUDE.md`. CI costs a full ~13-image Supabase pull per cold runner, in a job that would need its own definition and secret surface rather than folding into the existing one. What remains is a placement decision, not a question of feasibility, and it sits with `test-plan.md` §3 Phase 4. Owner: user. Block: no.
- **Risk:** Sequenced first, ahead of `test-plan.md` §3's own Phase 1, because `main_goal: speed` favours the strict must-have path and this is the only element discharging a written requirement. That divergence is deliberate and recorded here so a later `/10x-test-plan` run does not silently re-assert §3's order. The substantive risk is proving the wrong thing: `test-plan.md` §2 warns that "row-level security is enabled" is not the same as correct, since a policy can be missing for a single verb and roles carry different grants — and that a stranger's read returning nothing is not proof unless it is paired with a check that the targeted row is unchanged. **Addressed:** `00-harness.test.sql` proves impersonation resolves to two distinct non-null identities before any isolation claim depends on it; `03-policy-shape.test.sql` asserts policy *expressions* rather than counts; every denied write is paired with a row-intactness assertion read back as the owner.
- **Status:** done

### F-04: Analyze-pipeline boundary resilience

- **Outcome:** (foundation) A hostile, malformed or failing external response degrades into a ranking plus an explicit account of what is missing — never an error page, never a blank screen, never a fabricated sentence.
- **Change ID:** `testing-analyze-boundary-resilience`
- **PRD refs:** FR-006, FR-009, Guardrails (Success Criteria); MS-04
- **Unlocks:** the verification path for `test-plan.md` risks #1 and #2 — the only High × High risk in the map; the scope expansion of the `unit + integration` gate in `test-plan.md` §5; the cookbook entry `test-plan.md` §6.2
- **Prerequisites:** —
- **Parallel with:** F-03, F-05, S-06
- **Blockers:** —
- **Unknowns:**
  - `test-plan.md` §3 records this phase's Status as `change opened` against a change folder that does not exist on disk, so that row is stale. Owner: user. Block: no (the orchestrator re-derives status from disk, so it should self-correct on its next run).
- **Risk:** Sequencing ownership for this element stays with `test-plan.md` §3, which rates it the highest risk in the project and places it first; M-2 defers it only because of the `speed` bias. The trap named in §2 is faking the parsing step rather than the transport, which leaves the real parsing code unexercised, and asserting that nothing threw without asserting the scores survived into the user-visible payload.
- **Status:** done

### F-05: Scoring oracle and spec conformance

- **Outcome:** (foundation) The score provably means what the PRD says it means — views over the channel's own median across the window, short-form excluded, sorted descending, with identical input yielding identical output and identical order — and the pre-existing assertions are shown to be capable of failing for the right reason.
- **Change ID:** `testing-scoring-oracle`
- **PRD refs:** FR-007, FR-008, the non-functional requirement on repeatability of the computational core; MS-05
- **Unlocks:** the verification path for `test-plan.md` risk #5; the cookbook entry `test-plan.md` §6.5; removal of the standing caveat in §6.1 that the existing assertions have not been audited
- **Prerequisites:** —
- **Parallel with:** F-03, F-04, S-06
- **Blockers:** —
- **Unknowns:**
  - Whether any existing expected value was captured from the implementation's own output rather than derived from the PRD formula. Owner: TBD (resolved by this element's own research). Block: no.
- **Risk:** This is an audit and extension, not a bootstrap — a partial suite already passes, which is exactly what makes it dangerous: `test-plan.md` §2 names the oracle problem as this element's central threat, since assertions captured from a run can never fail for the right reason. Snapshot assertions over the ranking output are called out as the purest form of that failure and must not be introduced.
- **Status:** ready

### F-06: Quality-gates wiring

- **Outcome:** (foundation) The floor the earlier elements established is enforced on every change rather than documented — including the currently unwired typecheck gate and a resolved placement for the policy-test gate.
- **Change ID:** `testing-quality-gates`
- **PRD refs:** MS-06
- **Unlocks:** the `typecheck` and `database policy tests` gates in `test-plan.md` §5, both of which are recorded there as "required after" a rollout phase and unenforced until this element lands; resolution of the container-runtime placement decision deferred by §5
- **Prerequisites:** F-03, F-04, F-05
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Whether the policy-test gate runs in CI (needs a container runtime in the pipeline) or stays a local gate. Owner: user. Block: no — this element is where the decision is made, not something it waits on.
- **Risk:** Deliberately thin and deliberately last: a gate can only lock a floor the earlier elements have actually built, so wiring it early would enforce a floor that does not exist yet. Sequenced after all three preceding elements for that reason, and the only element in M-2 whose Prerequisites are non-empty.
- **Status:** proposed

## Slices

### S-06: Opportunity status transitions

- **Outcome:** User moves a saved opportunity through new → in production → done, and the change persists across sessions.
- **Change ID:** `opportunity-status-transitions`
- **PRD refs:** FR-012, FR-010, FR-011; MS-02
- **Prerequisites:** F-03
- **Parallel with:** F-04, F-05
- **Blockers:** —
- **Unknowns:**
  - Whether the status control belongs in the saved-opportunities list itself or in a per-item view. Owner: user. Block: no.
- **Risk:** The stored record already carries a status with a constraint on its allowed values, and an owner-scoped update policy already exists — but nothing in the product updates that record, so the update policy has no caller at all. This element is that caller, which is why F-03 is its Prerequisite: the guarantee is proven before the path exists rather than after. FR-012 is a nice-to-have that the PRD deliberately demoted as the seed of a production planner; it is un-parked here on a different argument — create/read/update/delete completeness on the headline record, surfaced by the MVP audit — and that reason is recorded in `## Parked` so the original decision is not silently overwritten.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID | Suggested issue title | GitHub Issue | Ready for `/10x-plan` | Notes |
|------------|-----------|------------------------|--------------|------------------------|-------|
| F-03 | `provable-user-isolation` | Prove per-user isolation and closed routes by test | [#22](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/22) | yes | Run `/10x-plan provable-user-isolation`. North-star enabler; maps to `test-plan.md` §3 Phase 2. |
| S-06 | `opportunity-status-transitions` | Opportunity status transitions (FR-012) | [#18](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/18) — reopened | no | Blocked on F-03 landing. Issue #18 was reopened in place and converted from a parked item; its original parking rationale is preserved in the body. |
| F-04 | `testing-analyze-boundary-resilience` | Analyze pipeline degrades readably on provider failure | [#23](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/23) | yes | Sequencing owned by `test-plan.md` §3 Phase 1; its change folder is named there but absent on disk. |
| F-05 | `testing-scoring-oracle` | Audit the scoring suite against the PRD formula | [#24](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/24) | yes | Sequencing owned by `test-plan.md` §3 Phase 3. |
| F-06 | `testing-quality-gates` | Enforce the quality gates the rollout established | [#25](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/25) | no | Blocked on F-03, F-04, F-05. Sequencing owned by `test-plan.md` §3 Phase 4. |

All roadmap items are mirrored as GitHub Issues in `Keitar6/10xDevs-YT-Niche-Adviser` under milestone [`M-2: Provable quality floor`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/milestone/2), and in Linear under the matching project milestone (`MAT-25`–`MAT-28`, plus `MAT-22` for S-06). Both mirrors — `context/foundation/tasks-github.md` and `context/foundation/tasks-linear.md` — were synced on 2026-09-13 when this milestone opened.

One known drift is recorded rather than fixed: Linear still shows milestone M-1 at 87.5 % because `MAT-10` (an Open Roadmap Question, not a deliverable) remains attached to it. The MCP tooling cannot clear a milestone field, so it needs a manual edit in Linear — see `tasks-linear.md`.

## Open Roadmap Questions

1. **The e2e criterion from shaping contradicts the test plan's negative space.** `shape-notes.md` parked an explicit acceptance criterion — at least one end-to-end test covering login → profile → analyze → result — but `test-plan.md` §7 rules end-to-end testing out entirely, and §5 records that exclusion as a standing trade on cost × signal grounds. Neither document cites the other, so this is an unresolved decision rather than an oversight. — Owner: user. Block: roadmap-wide (it determines whether M-2 needs a fifth element).
2. **Where do policy tests that need a container runtime run?** In CI, which means provisioning a container runtime in the pipeline, or as a local-only gate. — Owner: user. Block: F-06 (`test-plan.md` §5 defers the decision to that element).
3. **Shape-notes quality cross-check nie został ukończony** (`quality_check_status: pending` w checkpoincie wejściowym PRD, faza 7 — cross-check w toku, nie faza 8 finalna). — Owner: user. Block: no (informacyjne; zalecane potwierdzenie, że dokończenie cross-checku w `/10x-shape` nie ujawni dodatkowych luk). GitHub: [#6](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/6).

## Parked

Wszystkie pozycje poniżej są też zamkniętymi issues (`state_reason: not_planned`) z etykietą `roadmap-parked` w `Keitar6/10xDevs-YT-Niche-Adviser` — pełna historia decyzji jest tam, nie tylko tutaj.

- **Monitoring newsów z zewnętrznych źródeł** — Why parked: inny problem niż analiza konkurencji (PRD Non-Goals). GitHub: [#7](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/7).
- **Planer produkcji / kanban** — Why parked: MVP kończy się na wskazaniu i zapisie okazji (PRD Non-Goals). GitHub: [#8](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/8).
- **Konfigurator workflow (edytor, thumbnail)** — Why parked: nie dotyczy analizy okazji (PRD Non-Goals). GitHub: [#9](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/9).
- **Niche discovery (odkrywanie nowych nisz od zera)** — Why parked: insight to kuratela znanych konkurentów, nie odkrywanie (PRD Non-Goals). GitHub: [#10](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/10).
- **Śledzenie / analityka własnego kanału** — Why parked: produkt patrzy na konkurentów, nie na kanał użytkownika (PRD Non-Goals). GitHub: [#11](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/11).
- **Płatności i plany subskrypcyjne** — Why parked: monetyzacja poza MVP (PRD Non-Goals). GitHub: [#12](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/12).
- **Zaawansowany, uczony model „trafności niszy"** — Why parked: MVP używa prostego, jawnego współczynnika (PRD Non-Goals). GitHub: [#13](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/13).
- **Wiele profili kanałów naraz** — Why parked: jeden profil na użytkownika w v1 (PRD Non-Goals). GitHub: [#14](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/14).
- **Automatyczne / cykliczne analizy** — Why parked: wyłącznie on-demand, chroni quota API i upraszcza v1 (PRD Non-Goals). GitHub: [#15](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/15).
- **Analiza Shorts** — Why parked: MVP obejmuje tylko długie filmy (PRD Non-Goals; egzekwowane też przez FR-007). GitHub: [#16](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/16).
- **Usuwanie profilu kanału (FR-005, nice-to-have)** — Why parked: zdemotowane w PRD — zbędne w MVP przy jednym profilu, edycja (FR-004) pokrywa większość potrzeb. GitHub: [#17](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/17).
- **~~Pełny workflow statusów okazji (FR-012, nice-to-have)~~ — UN-PARKED 2026-09-13 into S-06.** Originally parked because the PRD demoted it as the seed of a production planner, outside v1 scope (GitHub: [#18](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/18), closed `not_planned`). Un-parked on a **different** argument, not a reversal of the original one: the MVP audit found the headline record supports create, read and delete but no update, and the owner-scoped update policy that already exists in the schema has no caller at all. The production-planner scope judgement still stands — S-06 delivers the status transition only, not a planner or a board.
- **Strumieniowanie postępu analizy (NDJSON) — wyzwalacz zadziałał, nie zamknięte** — Why parked: plan S-02 ustawił próg „eskalacja do strumieniowanego NDJSON dopiero, gdy zmierzone p95 przekroczy ~10s". Pomiar z fazy 5 na kontraktowym limicie 5 konkurentów dał **p95 ≈ 11,2s** (11,20 / 11,17 / 10,63 / 10,95s), czyli **powyżej progu** — eskalacja jest więc wyzwolona, a nie hipotetyczna. Dźwignia jest zidentyfikowana: pojedyncze batchowane wywołanie Anthropic to ~85% opóźnienia (ten sam profil z odłączonym `ANTHROPIC_API_KEY` wraca w 1,62s), a łańcuch YouTube + scoring to ~1,6s. Nie jest to więc optymalizacja zapytań do YouTube. Pomiar i diagnoza: `context/archive/2026-09-10-analyze-and-rank-opportunities/change.md`. **Nie ma lustrzanego issue na GitHubie** — w przeciwieństwie do pozostałych pozycji w tej sekcji. Tracked as observability rather than as a test subject, per `test-plan.md` §7.

## Milestone History

- **M-1: MVP core loop — od logowania do zapisanej okazji** (`mvp-core-loop`) — closed 2026-09-13. Pełna pętla must-have działa end-to-end: logowanie (email+hasło oraz Google OAuth), profil kanału z 3–5 kuratelowanymi konkurentami, analiza zwracająca ranking okazji z `outlier_score` i uzasadnieniem, oraz trwały zapis i przegląd okazji — wszystko za RLS per-owner. Siedem elementów (F-01, F-02, S-01–S-05) zamkniętych i zarchiwizowanych; zakres rozszerzony w trakcie o S-04 i S-05 bez naruszenia ścieżki must-have.

## Done

- **F-01: (foundation) Użytkownik może zalogować się przez Google OAuth, obok już działającego email+hasło; FR-001 w pełni spełniony.** — Archived 2026-09-10 → `context/archive/2026-09-08-google-oauth-login/`. Lesson: —.
- **S-04: niezalogowany odwiedzający rozumie ze strony głównej, czym jest produkt (kuratela konkurentów → ranking okazji contentowych) zamiast czytać treść szablonu startera; zalogowany i niezalogowany użytkownik loguje się, rejestruje i wylogowuje z dialogu w obrębie bieżącej strony, spójnie z istniejącym dialogiem profilu kanału.** — Archived 2026-09-13 → `context/archive/2026-09-13-landing-and-auth-shell/`. Lesson: —.
- **S-03: user zapisuje wybraną okazję z wyników analizy (temat, score, status) jako trwały rekord i później przegląda swoje zapisane okazje; zapisane okazje widoczne wyłącznie dla właściciela.** — Archived 2026-09-13 → `context/archive/2026-09-13-save-and-view-opportunities/`. Lesson: —.
- **S-02: zalogowany użytkownik z istniejącym profilem klika „Analyze" i widzi ranking ≥3 (docelowo top 5) okazji contentowych, każda z liczbowym `outlier_score` i jednozdaniowym uzasadnieniem, posortowane malejąco; przy błędzie/limicie API użytkownik widzi czytelny komunikat zamiast pustego lub zepsutego ekranu.** — Archived 2026-09-13 → `context/archive/2026-09-10-analyze-and-rank-opportunities/`. Lesson: —.
- **S-05: user wgrywa własny obraz jako awatar profilu kanału albo generuje go automatycznie na podstawie niszy i sub-niszy; awatar jest widoczny w powłoce aplikacji i dostępny wyłącznie dla właściciela.** — Archived 2026-09-13 → `context/archive/2026-09-13-channel-profile-avatar/`. Lesson: —.
- **S-01: user tworzy profil kanału (nisza, sub-nisza, 3–5 ID kanałów konkurentów) i może go później edytować.** — Archived 2026-09-13 → `context/archive/2026-09-09-channel-profile-crud/`. Lesson: —.
- **F-02: (foundation) Tabela `channel_profiles` istnieje w Supabase Postgres z politykami RLS ograniczonymi do właściciela (select/insert/update/delete), migracja w `supabase/migrations/`.** — Archived 2026-09-13 → `context/archive/2026-09-09-channel-profile-data-model/`. Lesson: —.
- **F-03: (foundation) Access control is provable rather than asserted: per-user isolation holds across channel profiles, saved opportunities and the avatar objects — per verb and per role — and every data-touching route refuses a caller with no session.** — Archived 2026-09-14 → `context/archive/2026-09-14-provable-user-isolation/`. Lesson: —.
- **F-04: (foundation) A hostile, malformed or failing external response degrades into a ranking plus an explicit account of what is missing — never an error page, never a blank screen, never a fabricated sentence.** — Archived 2026-09-14 → `context/archive/2026-09-14-testing-analyze-boundary-resilience/`. Lesson: —.
