# Backlog — pomysły odłożone na później

## Powiadomienia e-mail (odłożone 2026-07-04 — wracamy jak Patryk da znać)

**Cel:** alerty cenowe i podsumowania trafiają na skrzynkę użytkownika bez otwierania appki.

**Architektura (ustalona):**
- Dostawca: **Resend** (resend.com) — darmowe 3000 maili/mies., konto zakłada Patryk (pełny dostęp: historia wysyłek, treści, statusy doręczeń w panelu Resend).
- Domena nadawcy: własna (np. `alerty@spendly.pl`) — wymaga 3 rekordów DNS u rejestratora domeny; do testów działa `onboarding@resend.dev` bez konfiguracji.
- `reply-to` ustawione na prawdziwą skrzynkę (np. kontakt@spendly.pl) — odpowiedzi użytkowników trafiają do Patryka.
- Klucz `RESEND_API_KEY` w zmiennych Railway (api-server). Kod nie wysyła nic, dopóki klucz nie jest ustawiony.

**Zakres do zbudowania:**
1. Serwis mailowy w api-server (`lib/email` lub `services/email.ts`) — szablony HTML w stylu appki (teal, bez emoji).
2. Alert cenowy po syncu KSeF — gdy `checkAlertsAfterImport` wykryje przekroczenie progu: mail „{produkt} u {dostawca} +X% ({cena})" z linkiem do wykresu cen.
3. Tygodniowe podsumowanie — wydatki tygodnia, top wzrosty cen, faktury z terminem płatności w nadchodzącym tygodniu. Wymaga schedulera (patrz: auto-sync KSeF w tle — wspólna infrastruktura).
4. Ustawienia powiadomień per użytkownik (tabela `notification_preferences` lub kolumny w istniejącej) + UI w ustawieniach: włącz/wyłącz alerty, włącz/wyłącz podsumowanie.
5. Link rezygnacji (unsubscribe) w stopce każdego maila — wymóg antyspamowy.

**Warunek wstępny od Patryka:** konto Resend + (docelowo) dostęp do DNS domeny + klucz API na Railway.

---

## Pozostałe z przeglądu 2026-07-04 (priorytetyzacja u Claude'a w pamięci)
- Automatyczna synchronizacja KSeF w tle (scheduler, co ~6h, rate-limit per NIP + advisory lock już istnieją) — fundament pod maile.
- Reguły centrów kosztów: ekran dostawca→centrum, „zastosuj wstecz", nauka z ręcznych przypisań.
- Przypomnienia o terminach płatności (paymentDueDate/isPaid już w bazie, nic z nich nie alarmuje).
- Sentry (monitoring błędów front+back).
- Testy unit dla logiki KSeF (okna, dedup, rate-limit guard).
- Rozbicie dużych plików; rate-limit per-user (przy skali).
