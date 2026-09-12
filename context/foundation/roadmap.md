---
project: "YT-Niche-Adviser"
version: 1
status: draft
created: 2026-09-07
updated: 2026-09-11
prd_version: 1
main_goal: speed
top_blocker: time
milestone_id: mvp-core-loop
milestone_seq: 1
milestone_status: open
---

# Roadmap: YT-Niche-Adviser

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-1: MVP core loop — od logowania do zapisanej okazji** — Status: open

- **Intent:** Dostarczyć kompletną, działającą pętlę must-have z PRD: pełne logowanie (email+hasło oraz Google OAuth), profil kanału z kuratelowanymi konkurentami, analiza zwracająca ranking okazji contentowych (outlier_score + uzasadnienie), oraz trwały zapis i przegląd okazji — z twardą izolacją danych per-user przez cały czas.
- **Source materials:** `context/foundation/prd.md` (v1)
- **Done when:** F-01, F-02, S-01, S-02, S-03 mają `Status: done`.
- **Scope anchors:** FR-001–FR-004, FR-006–FR-011 (must-have), US-01, Access Control, Guardrails (Success Criteria), NFR (powtarzalność, latencja, izolacja).

## Vision recap

Solo-twórca YouTube ręcznie przegląda kanały 3–5 kuratelowanych konkurentów, żeby zrozumieć, co u nich „wystrzeliło" ponad normę — żmudne, czasochłonne, bez twardych liczb. Produkt normalizuje wyniki konkurentów (wyświetlenia filmu względem **mediany** danego kanału z okna czasowego — **outlier_score**) i zwraca ranking okazji contentowych z jednozdaniowym uzasadnieniem, żeby decyzja „o czym nagrać" miała twarde podstawy zamiast być „na czuja".

## North star

**S-02: Zalogowany użytkownik z profilem uruchamia analizę i widzi ranking okazji** — dowodzi wprost głównej hipotezy produktu (kuratela + outlier scoring bije ogólny algorytm) i jest wprost Primary Success Criterion z PRD.

> Gwiazda przewodnia (ang. north star) to najmniejszy, kompletny end-to-end fragment, którego udane dostarczenie dowodzi, że kluczowa hipoteza produktu działa — umieszczony tak wcześnie, jak pozwalają na to zależności, bo reszta ma znaczenie tylko wtedy, gdy ten fragment się sprawdzi. Poniższy gloss pojawia się tylko raz, przy pierwszym użyciu.

## At a glance

| ID | Change ID | Outcome (user can …) | Prerequisites | PRD refs | Status |
|----|-----------|----------------------|----------------|----------|--------|
| F-01 | `google-oauth-login` | (foundation) domknięcie must-have logowania — Google OAuth obok email+hasła | — | FR-001 | done |
| F-02 | `channel-profile-data-model` | (foundation) tabela `channel_profiles` z RLS per-owner | — | FR-002, FR-003 | in-progress |
| S-01 | `channel-profile-crud` | user tworzy i edytuje profil kanału (nisza, sub-nisza, 3–5 ID konkurentów) | F-02 | FR-003, FR-004, US-01 | in-progress |
| S-02 | `analyze-and-rank-opportunities` | user klika „Analyze" i widzi ranking ≥3 okazji z outlier_score i uzasadnieniem | S-01 | FR-006, FR-007, FR-008, FR-009, US-01 | proposed |
| S-03 | `save-and-view-opportunities` | user zapisuje okazję z rankingu i przegląda zapisane okazje | S-02 | FR-010, FR-011 | proposed |

## Streams

Nawigacja pomocnicza — grupuje elementy dzielące ten sam łańcuch Prerequisites. Kanoniczna kolejność wciąż wynika z grafu zależności poniżej; ta tabela to proponowana kolejność czytania dla równoległych ścieżek.

| Stream | Theme | Chain | Note |
|--------|-------|-------|------|
| A | Domknięcie must-have logowania | `F-01` | Niezależny od głównej pętli danych; można wykonać równolegle z resztą — domyka FR-001 przed końcem milestone'a. |
| B | Główna pętla: profil → analiza → zapis | `F-02` → `S-01` → `S-02` → `S-03` | Ścieżka must-have prowadząca do gwiazdy przewodniej (S-02) i pełnej pętli zapisu (S-03); zgodna z `main_goal: speed`. |

## Baseline

Stan repo na `2026-09-07` (auto-research + potwierdzenie użytkownika, doprecyzowane podczas wywiadu).
Poniższe Foundations zakładają ten stan i NIE re-scaffoldują tego, co już jest.

- **Frontend:** present — Astro 6 + React 19 islands (`astro.config.mjs`, `src/pages/*.astro`).
- **Backend / API:** present — Astro SSR API routes (`src/pages/api/auth/*`).
- **Data:** absent — brak `supabase/migrations`, brak encji domenowych w `src/types.ts` (tylko wbudowana `auth.users` z Supabase Auth).
- **Auth:** partial — email+hasło w pełni działa (`src/lib/supabase.ts`, `src/middleware.ts` z `PROTECTED_ROUTES`, `src/pages/api/auth/{signin,signup,signout}.ts`); Google OAuth (must-have per FR-001) NIE jest jeszcze podpięty — `signin.ts` woła wyłącznie `signInWithPassword`.
- **Deploy / infra:** present — Cloudflare Workers przez `wrangler`, CI auto-deploy on merge (per `infrastructure.md`).
- **Observability:** absent — brak Sentry/Datadog/OTel, brak loggera.

## Foundations

### F-01: Domknięcie must-have logowania (Google OAuth)

- **Outcome:** (foundation) Użytkownik może zalogować się przez Google OAuth, obok już działającego email+hasło; FR-001 w pełni spełniony.
- **Change ID:** `google-oauth-login`
- **GitHub:** [#1](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/1)
- **PRD refs:** FR-001
- **Unlocks:** Ścieżka weryfikacji zamknięcia milestone'a — „Done when" wymaga wszystkich must-have FR spełnionych, a FR-001 (oba tory logowania) nie może być odhaczony bez tego; bez F-01 milestone M-1 nie może zostać formalnie zamknięty.
- **Prerequisites:** —
- **Parallel with:** F-02, S-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Mały, izolowany dodatek do istniejącego scaffoldu auth (Supabase ma wbudowane wsparcie dla providera Google) — niskie ryzyko naruszenia innych warstw. Sekwencjonowany wcześnie, bo `main_goal: speed` faworyzuje domykanie małych must-have luk teraz, zanim staną się zapomnianym długiem tuż przed deadline'em.
- **Status:** done

### F-02: Model danych profilu kanału (RLS per-owner)

- **Outcome:** (foundation) Tabela `channel_profiles` istnieje w Supabase Postgres z politykami RLS ograniczonymi do właściciela (select/insert/update/delete), migracja w `supabase/migrations/`.
- **Change ID:** `channel-profile-data-model`
- **GitHub:** [#2](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/2)
- **PRD refs:** FR-002, FR-003
- **Unlocks:** S-01 (tworzenie/edycja profilu) — bez tej tabeli S-01 nie da się zaplanować ani zweryfikować.
- **Prerequisites:** —
- **Parallel with:** F-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Poprawność polityk RLS to jedyny obszar, w który warto zainwestować mocniej mimo `main_goal: speed` — to twardy guardrail PRD (izolacja danych), a wszystko downstream na tym polega. Sekwencjonowany jako pierwszy w warstwie danych, bo S-01 nie da się zaplanować bez niego.
- **Status:** in-progress

## Slices

### S-01: Użytkownik tworzy i edytuje profil kanału

- **Outcome:** user tworzy profil kanału (nisza, sub-nisza, 3–5 ID kanałów konkurentów) i może go później edytować.
- **Change ID:** `channel-profile-crud`
- **GitHub:** [#3](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/3)
- **PRD refs:** FR-003, FR-004, US-01 (kontekst wstępny — profil jest warunkiem analizy)
- **Prerequisites:** F-02
- **Parallel with:** F-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Prosty CRUD; główne ryzyko to walidacja formatu i liczby ID konkurentów (3–5) po stronie klienta i serwera. Sekwencjonowany zaraz po F-02, bo to pierwsza user-facing zdolność i odblokowuje gwiazdę przewodnią (S-02).
- **Status:** in-progress

### S-02: Użytkownik uruchamia analizę i widzi ranking okazji (gwiazda przewodnia)

- **Outcome:** zalogowany użytkownik z istniejącym profilem klika „Analyze" i widzi ranking ≥3 (docelowo top 5) okazji contentowych, każda z liczbowym `outlier_score` i jednozdaniowym uzasadnieniem, posortowane malejąco; przy błędzie/limicie API użytkownik widzi czytelny komunikat zamiast pustego lub zepsutego ekranu.
- **Change ID:** `analyze-and-rank-opportunities`
- **GitHub:** [#4](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/4)
- **PRD refs:** FR-006, FR-007, FR-008, FR-009, US-01
- **Prerequisites:** S-01 (potrzebny istniejący profil z 3–5 ID konkurentów)
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Dokładna definicja „okna czasowego" do pobierania filmów i liczenia wartości bazowej (ile dni/miesięcy) — Owner: user. Block: no (reguła deterministyczna stoi; dokładny parametr można ustalić podczas `/10x-plan`).
  - Realne limity quoty YouTube Data API v3 dla wybranego trybu uwierzytelnienia nie zostały jeszcze zweryfikowane w praktyce — Owner: user. Block: no (guardrail z PRD już zakłada graceful degradation). **Częściowo rozstrzygnięte 2026-09-11**: klucz API (bez OAuth), 10 000 jednostek/dobę na projekt Google Cloud, ~15 jednostek na przebieg przy 5 konkurentach — szczegóły w `context/changes/analyze-and-rank-opportunities/yt-library-research.md`; w praktyce nadal niezweryfikowane.
- **Rozstrzygnięcia (2026-09-11):**
  - **Wartość bazowa: mediana, nie średnia** — PRD FR-008 poprawione; decyzja D2 w `context/changes/analyze-and-rank-opportunities/research.md`.
  - **Limit konkurentów: max 5, egzekwowany w profilu (S-01)** — profil jest źródłem prawdy dla analizy; przywraca zgodność z FR-003 („3–5"). Decyzja D1 tamże; wymaga domknięcia w S-01.
- **Risk:** To jest gwiazda przewodnia — najbardziej ryzykowny i najbardziej wartościowy fragment (integracja z YouTube Data API + LLM-owe uzasadnienie + rdzeń logiki scoringu w jednym miejscu). Sekwencjonowany możliwie wcześnie (zaraz po S-01), zgodnie z `main_goal: speed` i zasadą, że gwiazdy przewodniej nie odkłada się dla symetrii.
- **Status:** proposed

### S-03: Użytkownik zapisuje i przegląda okazje contentowe

- **Outcome:** user zapisuje wybraną okazję z wyników analizy (temat, score, status) jako trwały rekord i później przegląda swoje zapisane okazje; zapisane okazje widoczne wyłącznie dla właściciela.
- **Change ID:** `save-and-view-opportunities`
- **GitHub:** [#5](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/5)
- **PRD refs:** FR-010, FR-011
- **Prerequisites:** S-02 (potrzebne wyniki rankingu do zapisania)
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Nowa tabela `content_opportunities` + polityka RLS wprowadzana dopiero tutaj (progresywne ujawnianie — tylko ten slice jej potrzebuje, więc nie ma osobnego Foundation). Główne ryzyko to kolejna polityka RLS do poprawnego wdrożenia; mitygacja: powielić wzorzec już zweryfikowany w F-02.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID | Suggested issue title | GitHub Issue | Ready for `/10x-plan` | Notes |
|------------|-----------|------------------------|--------------|------------------------|-------|
| F-01 | `google-oauth-login` | Add Google OAuth login alongside email+password | [#1](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/1) | yes | Run `/10x-plan google-oauth-login` |
| F-02 | `channel-profile-data-model` | Create `channel_profiles` table with per-owner RLS | [#2](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/2) | yes | Run `/10x-plan channel-profile-data-model` |
| S-01 | `channel-profile-crud` | Channel profile create/edit UI | [#3](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/3) | no | Waiting on F-02 |
| S-02 | `analyze-and-rank-opportunities` | Analyze competitors → ranked content opportunities | [#4](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/4) | no | Waiting on S-01; north star |
| S-03 | `save-and-view-opportunities` | Save and browse content opportunities | [#5](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/5) | no | Waiting on S-02 |

All roadmap items are tracked as GitHub Issues in `Keitar6/10xDevs-YT-Niche-Adviser`, milestone [`M-1: MVP core loop`](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/milestone/1). Parked items and the open roadmap question are also mirrored as issues (see their sections below) — this table only lists active milestone work.

## Open Roadmap Questions

1. **Shape-notes quality cross-check nie został ukończony** (`quality_check_status: pending` w checkpoincie wejściowym PRD, faza 7 — cross-check w toku, nie faza 8 finalna). — Owner: user. Block: no (informacyjne; zalecane potwierdzenie, że dokończenie cross-checku w `/10x-shape` nie ujawni dodatkowych luk). GitHub: [#6](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/6).

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
- **Pełny workflow statusów okazji (FR-012, nice-to-have)** — Why parked: zdemotowane w PRD — zalążek plannera produkcji poza zakresem v1; status ustawiany przy zapisie (FR-010) wystarcza. GitHub: [#18](https://github.com/Keitar6/10xDevs-YT-Niche-Adviser/issues/18).

## Milestone History

(brak — pierwszy milestone)

## Done

- **F-01: (foundation) Użytkownik może zalogować się przez Google OAuth, obok już działającego email+hasło; FR-001 w pełni spełniony.** — Archived 2026-09-10 → `context/archive/2026-09-08-google-oauth-login/`. Lesson: —.
