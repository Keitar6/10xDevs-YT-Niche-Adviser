---
project: "YT-Niche-Adviser"
version: 2
status: draft
created: 2026-08-25
updated: 2026-09-13
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: 2026-08-31
  after_hours_only: true
---

# PRD — YT-Niche-Adviser

## Vision & Problem Statement

Solo-twórca YouTube działający w konkretnej niszy, planując kolejny film, musi
zrozumieć, co u konkurencji faktycznie „wystrzeliło" ponad normę. Dziś robi to
ręcznie — przegląda kanały konkurentów film po filmie. Jest to żmudne i
czasochłonne, sygnały są rozproszone po wielu kanałach, więc analiza albo nie
powstaje wcale, albo kończy się decyzją „na czuja". Koszt: godziny pracy bez
twardych liczb.

Insight: wartość nie leży w automatycznym „odkrywaniu nisz", lecz w **kurateli
konkurentów** — użytkownik sam definiuje wąską listę 3–5 realnych konkurentów,
a narzędzie normalizuje ich wyniki (outlier: wyświetlenia względem mediany
danego kanału), by pokazać powtarzalny sygnał niezależny od wielkości kanału.
Wąskie, ręcznie dobrane wejście bije ogólny algorytm na trafności i zaufaniu.

Notka o skali (sonda 100×): przy 100-krotnym wzroście liczby użytkowników sama
reguła (views/mediana) się nie zmienia — wąskim gardłem staje się wspólna,
dzielona dzienna quota zewnętrznego API danych YouTube, nie matematyka scoringu.

## User & Persona

Primary persona: **Solo-twórca w niszy** — pojedynczy twórca (faceless lub
osobowy) prowadzący jeden kanał w określonej niszy/sub-niszy, planujący content
samodzielnie. Sięga po produkt w momencie „o czym nagrać następne video",
zanim usiądzie do ręcznego researchu konkurencji. Zna swoich 3–5 kluczowych
konkurentów z nazwy/ID.

## Success Criteria

### Primary
- Użytkownik loguje się, tworzy profil kanału (nisza, sub-nisza, 3–5 ID
  konkurentów) i po kliknięciu „Analyze" otrzymuje ranking **≥ 3** ocenionych
  okazji contentowych.
- Każda okazja ma wynik liczbowy (outlier_score) oraz jednozdaniowe uzasadnienie.
- Zapisane okazje są trwałe (baza) i widoczne wyłącznie dla właściciela profilu.

### Secondary
- Jednozdaniowe uzasadnienie jest na tyle trafne, że użytkownik faktycznie na
  jego podstawie wybiera temat (jakość uzasadnienia, nie tylko jego obecność).

### Guardrails
- Twarda izolacja danych per-user — żaden wyciek zapisanych okazji między kontami.
- Klik „Analyze" nigdy nie kończy się pustką bez wyjaśnienia — zawsze ranking
  albo czytelny empty/error state.
- Błąd lub przekroczony limit zewnętrznego API danych YouTube nie wywala
  aplikacji — użytkownik dostaje czytelny komunikat (graceful degradation).

## User Stories

### US-01: Twórca uruchamia analizę i dostaje ranking okazji

- **Given** zalogowany twórca z profilem kanału zawierającym 3–5 ID konkurentów
- **When** klika „Analyze"
- **Then** widzi ranking ≥ 3 (docelowo top 5) okazji contentowych, każda z
  wynikiem liczbowym (outlier_score) i jednozdaniowym uzasadnieniem

#### Acceptance Criteria
- Ranking jest posortowany malejąco po outlier_score.
- Każda pozycja pokazuje temat, wynik liczbowy i jedno zdanie uzasadnienia.
- Gdy dane konkurentów są niedostępne lub API zwraca błąd/limit, użytkownik
  widzi czytelny komunikat zamiast pustego lub zepsutego ekranu.
- Wynik dotyczy wyłącznie konkurentów z profilu bieżącego użytkownika.

## Functional Requirements

### Konto i dostęp
- FR-001: Użytkownik może założyć konto i zalogować się (email+hasło oraz OAuth Google). Priority: must-have
  > Socrates: Kontrargument rozważony: „OAuth to nadmiar na start". Rozstrzygnięcie: zachowane — oba tory logowania w MVP (persona i tak jest w ekosystemie Google).
- FR-002: Użytkownik widzi i zarządza wyłącznie własnymi danymi. Priority: must-have
  > Socrates: Kontrargument rozważony: „izolacja to oczywistość, nie FR". Rozstrzygnięcie: zachowane jako jawny FR obronny; dodatkowo wzmocnione guardrailem i NFR z testem.

### Profil kanału
> Założenie MVP: jeden profil kanału na użytkownika. Wiele profili poza zakresem v1 (patrz Non-Goals).
- FR-003: Użytkownik może utworzyć profil kanału (nisza, sub-nisza, 3–5 ID konkurentów). Priority: must-have
  > Socrates: Kontrargument rozważony: „limit 3–5 arbitralny". Rozstrzygnięcie: zachowane — 3–5 jako rekomendowany zakres kuratelowanej listy; to rdzeń insightu produktu.
- FR-004: Użytkownik może edytować profil kanału. Priority: must-have
  > Socrates: Brak kontrargumentu — edycja to naturalna, częsta potrzeba; stoi jak jest.
- FR-005: Użytkownik może usunąć profil kanału. Priority: nice-to-have
  > Socrates: Kontrargument przyjęty: „zbędne w MVP przy jednym profilu". Rozstrzygnięcie: zdemotowane do nice-to-have; edycja (FR-004) pokrywa większość potrzeb.

### Analiza
- FR-006: Użytkownik może uruchomić analizę („Analyze") dla profilu kanału. Priority: must-have
  > Socrates: Kontrargument rozważony: „koszt/quota API przy ręcznym przycisku". Rozstrzygnięcie: on-demand zachowane (najprostsze dla MVP); ryzyko limitów adresowane guardrailem graceful-degradation i NFR.
- FR-007: System pobiera ostatnie długie filmy konkurentów z okna czasowego podczas analizy, wykluczając Shorts. Priority: must-have
  > Socrates: Kontrargument przyjęty: „Shorts zaburzają porównania wyświetleń". Rozstrzygnięcie: doprecyzowane — Shorts wykluczone; brane pod uwagę tylko długie filmy z okna czasowego.
- FR-008: System liczy outlier_score = wyświetlenia filmu / **mediana** wyświetleń kanału z okna czasowego, dla każdego filmu. Priority: must-have
  > Socrates: Kontrargument przyjęty: „średnia z całej historii zawyżona przez stare virale". Rozstrzygnięcie: wartość bazowa liczona z okna czasowego, nie z całej historii kanału.
  > Poprawka 2026-09-11 (decyzja użytkownika, PRD v1 draft): **średnia → mediana**. Uzasadnienie: średnia ma punkt załamania 0 — pojedynczy stary hit trwale zawyża własną wartość bazową kanału, więc metryka systematycznie nie wykrywa tego, po co istnieje. Każdy kurateli wart konkurent ma już takie outliery. Dowody: `context/changes/analyze-and-rank-opportunities/yt-library-research.md` (Architecture Insights §2, Leys et al.; zbieżność narzędzi analitycznych YouTube) oraz decyzja D2 w `research.md` tego samego change'a. Okno czasowe pozostaje bez zmian. Docelowo (poza MVP) liczone będą obie wartości — mediana jako score, średnia jako dodatkowa statystyka prezentowana użytkownikowi.
- FR-009: Użytkownik otrzymuje top 5 okazji (tematów) z wynikiem liczbowym i jednozdaniowym uzasadnieniem. Priority: must-have
  > Socrates: Brak kontrargumentu — ranking top 5 z uzasadnieniem to rdzeń dostarczanej wartości; stoi jak jest.

### Okazje contentowe
- FR-010: Użytkownik może zapisać wybraną okazję contentową (temat, score, status). Priority: must-have
  > Socrates: Brak kontrargumentu — trwały zapis wybranych okazji to jedno z kryteriów sukcesu; stoi jak jest.
- FR-011: Użytkownik może przeglądać zapisane okazje. Priority: must-have
  > Socrates: Kontrargument rozważony: „trywialne, połączyć z FR-010". Rozstrzygnięcie: zachowane osobno — bez przeglądania zapis jest bezużyteczny; FR jest nośny.
- FR-012: Użytkownik może zmienić status zapisanej okazji (nowa → w produkcji → zrobione). Priority: nice-to-have
  > Socrates: Kontrargument przyjęty: „workflow statusów to zalążek plannera produkcji, wykluczonego z MVP". Rozstrzygnięcie: zdemotowane do nice-to-have; status ustawiany przy zapisie (FR-010) zostaje, pełna zmiana stanów poza rdzeniem v1.

### Prezentacja i tożsamość produktu
> Dodane 2026-09-13 z obserwacji UX zgłoszonych podczas implementacji S-02 (`analyze-and-rank-opportunities`). Nie przeszły przez pełne shapingowe Socrates-review — zostały wprowadzone jako jawne nice-to-have, żeby slice'y roadmapy miały źródłowy anchor. Przy następnym `/10x-shape`/`/10x-prd` warto je przepuścić przez kontrargumenty.
- FR-013: Strona główna komunikuje wartość produktu (kuratela konkurentów → ranking okazji contentowych) zamiast treści szablonu startera. Priority: nice-to-have
  > Stan zastany: `src/components/Welcome.astro` i domyślny `title` w `src/layouts/Layout.astro` nadal reklamują „10x Astro Starter" (Supabase auth, ESLint, „Astro 5") — niezalogowany odwiedzający nie dowiaduje się, czym jest produkt.
- FR-014: Użytkownik loguje się, rejestruje i wylogowuje z dialogu w obrębie bieżącej strony, spójnie z dialogiem profilu kanału. Priority: nice-to-have
  > Stan zastany: profil jest dialogiem (`src/components/profile/ProfileDialog.tsx`), a logowanie/rejestracja to osobne trasy (`src/pages/auth/{signin,signup}.astro`), wylogowanie zaś to goły `form method="POST"` w `Topbar.astro` — powłoka aplikacji jest niespójna.
- FR-015: Profil kanału ma awatar — wgrany przez użytkownika albo wygenerowany przez AI na podstawie niszy i sub-niszy. Priority: nice-to-have
  > Decyzja użytkownika 2026-09-13: tor automatyczny to **generowanie obrazu przez API AI** (nie deterministyczny SVG). Konsekwencje do rozstrzygnięcia w `/10x-plan`: nowy sekret/dostawca, koszt i latencja na generowanie, ścieżka błędu przy nieudanej generacji, bucket Supabase Storage z RLS per-owner oraz kolumna `avatar_url` w `channel_profiles` (dziś tabela ma tylko `niche`, `sub_niche`, `competitors`).

## Non-Functional Requirements

- Ta sama analiza na tych samych danych wejściowych zwraca ten sam outlier_score
  i tę samą kolejność rankingu (powtarzalność rdzenia obliczeniowego).
  Interpretacyjne, jednozdaniowe uzasadnienie może się różnić między
  uruchomieniami i nie jest objęte tym wymogiem.
- Uruchomienie „Analyze" dla profilu z 3–5 konkurentami zwraca wynik w czasie
  odczuwalnym jako akceptowalny (cel: < ~30 s p95); przy dłuższym przetwarzaniu
  użytkownik widzi ciągły, widoczny postęp zamiast wrażenia zawieszenia.
- Zapisane okazje i profile jednego użytkownika są nieosiągalne dla innych
  użytkowników (izolacja weryfikowalna testem).

## Business Logic

Aplikacja wskazuje twórcy najlepsze tematy na kolejny film, rankingując ostatnie
długie filmy jego kuratelowanych konkurentów po outlier_score (wyświetlenia
filmu względem mediany wyświetleń danego kanału z okna czasowego) i zwracając
top 5 z jednozdaniowym uzasadnieniem.

Wejścia (widziane przez użytkownika): wąska, ręcznie dobrana lista 3–5
konkurentów (ID kanałów) w profilu oraz okno czasowe, z którego brane są filmy.
Reguła pomija Shorts, liczy dla każdego kwalifikującego się filmu iloraz jego
wyświetleń do mediany wyświetleń danego kanału w oknie, i porządkuje wyniki
malejąco.

Wyjście: ranking top 5 okazji contentowych, każda z liczbowym outlier_score i
jednozdaniowym uzasadnieniem interpretacyjnym — tłumaczącym, dlaczego dany temat
mógł chwycić (poza samą liczbą). Użytkownik napotyka ten wynik po kliknięciu
„Analyze" i może wybrane pozycje zapisać jako trwałe okazje.

## Access Control

Multi-user z uwierzytelnianiem. Wejście przez **logowanie email + hasło oraz
OAuth (Google)**. Model ról **płaski** — jedna rola „twórca"; brak podziału
admin/member w MVP. Twarda izolacja danych: każdy użytkownik widzi i zarządza
wyłącznie własnymi profilami kanałów i zapisanymi okazjami. Trafienie na trasę
chronioną bez sesji → przekierowanie do logowania.

## Non-Goals

### Funkcjonalne (z notatki)
- Monitoring newsów z zewnętrznych źródeł — inny problem, poza rdzeniem analizy konkurencji.
- Planer produkcji / kanban — MVP kończy się na wskazaniu i zapisie okazji.
- Konfigurator workflow (edytor, thumbnail) — nie dotyczy analizy okazji.
- Niche discovery (odkrywanie nowych nisz od zera) — insight to kuratela znanych konkurentów, nie odkrywanie.
- Śledzenie / analityka własnego kanału — produkt patrzy na konkurentów, nie na kanał użytkownika.
- Płatności i plany subskrypcyjne — monetyzacja poza MVP.
- Zaawansowany, uczony model „trafności niszy" — MVP używa prostego, jawnego współczynnika.

### Dodatkowe (wykryte podczas shapingu)
- Wiele profili kanałów naraz — jeden profil na użytkownika w v1.
- Automatyczne / cykliczne analizy — wyłącznie on-demand (chroni quota API, upraszcza v1).
- Analiza Shorts — MVP obejmuje tylko długie filmy.
- Pełny workflow statusów / planer — status okazji tylko lekki (zmiana statusu jako nice-to-have).

## Open Questions

1. **Shape-notes quality cross-check nie został ukończony** (`quality_check_status: pending` w checkpoint wejściowym, faza 7 — cross-check w toku, nie faza 8 finalna). — Owner: user. Blokuje: nie (treść wejścia jest kompletna dla wszystkich sekcji PRD), ale zalecane potwierdzenie, że żadne dodatkowe luki nie wyjdą na jaw przy dokończeniu cross-checku w `/10x-shape`.
