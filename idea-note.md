# 10xDev - YT-Niche-Adviser

### Główny problem
Przeszukiwanie filmów konkurentów, oraz analiza ich jeden po drugim, tak aby wiedzieć jak zamodelować swoje videa jest niesamowicie czasochłonne i żmudne, co zniechęca do robienia tego typu analizy

### Najmniejszy zestaw funkcjonalności
- Logowanie użytkownika (Supabase auth) 
- każdy user widzi tylko swoje dane
Utworzenie profilu kanału: nisza, sub-nisza, lista 3-5 ID konkurentów
- Uruchomienie analizy przyciskiem "Analyze" - pobranie ostatnich filmów konkurentów z YouTube Data API v3
- Obliczenie outlier_score dla każdego filmu (views / avg_channel_views)
- Zwrócenie top 5 tematów z wynikiem liczbowym i jednozdaniowym uzasadnieniem
- Zapis wybranych okazji contentowych (temat, score, status) w bazie

### Co NIE wchodzi w zakres MVP
- Monitoring newsów z zewnętrznych źródeł
- Planer produkcji / kanban
- Workflow konfigurator (edytor, thumbnail)
- Niche discovery (odkrywanie nowych nisz od zera)
- Śledzenie własnego contentu / analityka własnego kanału
- Płatności i plany subskrypcyjne
- Zaawansowana "trafność niszy" jako osobny, uczony/skomplikowany model — na start prosty, jawnie opisany - współczynnik

### Kryteria sukcesu
- Użytkownik może się zalogować i utworzyć profil kanału z niszą i listą konkurentów
- Kliknięcie "Analyze" zwraca ≥3 ocenione okazje contentowe w rankingu
- Każda zwrócona okazja ma wynik liczbowy oraz jednozdaniowe uzasadnienie
- Zapisane okazje są trwałe (baza danych) i widoczne wyłącznie dla właściciela profilu
- Co najmniej jeden test E2E pokrywający przepływ login → profil → analyze → wynik przechodzi
- Pipeline CI/CD buduje aplikację, uruchamia testy i wdraża na Cloudflare Pages bez ręcznej interwencji