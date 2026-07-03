# Spendly Mobile (Capacitor) — instrukcja

Aplikacja mobilna to ten sam frontend React opakowany w natywną powłokę
(Capacitor). Web działa jak dotychczas — build mobilny jest osobnym trybem.

## Struktura

- `artifacts/ksef-monitor/capacitor.config.ts` — konfiguracja appki (appId `pl.spendly.app`, splash, status bar)
- `artifacts/ksef-monitor/android/` — natywny projekt Android (commitowany; buildy wykluczone przez własny .gitignore)
- `artifacts/ksef-monitor/assets/logo.svg` — źródło ikon; regeneracja: `npx capacitor-assets generate --android --assetPath assets`
- `.env.mobile` — konfiguracja buildu mobilnego (gitignored; wzór w `.env.mobile.example`)

## Build krok po kroku

```bash
# 1. Uzupełnij .env.mobile (raz):
cp artifacts/ksef-monitor/.env.mobile.example artifacts/ksef-monitor/.env.mobile
#    → wpisz prawdziwy VITE_CLERK_PUBLISHABLE_KEY (pk_live_... z Railway/panelu Clerk)

# 2. Zbuduj web + zsynchronizuj do Androida:
pnpm --filter @workspace/ksef-monitor run build:mobile

# 3. Otwórz w Android Studio i zbuduj APK/AAB:
cd artifacts/ksef-monitor && npx cap open android
#    Android Studio: Build → Generate Signed App Bundle (do Play) lub Run na telefonie
```

## Wymagania jednorazowe

| Co | Skąd | Koszt |
|---|---|---|
| Android Studio + SDK | developer.android.com/studio | 0 zł |
| Konto Google Play Console | play.google.com/console | 25 USD raz |
| Konto Apple Developer (etap iOS) | developer.apple.com | 99 USD/rok |
| Build iOS bez Maca | codemagic.io (darmowy tier) | 0 zł na start |

## Jak to działa w środku

- Vite w trybie `--mode mobile` czyta `.env.mobile`: absolutny adres API
  (Railway) + klucz Clerk + proxy Clerk. W appce natywnej nie ma domeny frontu,
  więc nic nie może być względne.
- CORS api-server przepuszcza originy natywne: `https://localhost` (Android)
  i `capacitor://localhost` (iOS) — dodane w `app.ts`.
- Auth: Clerk działa w WebView jak na stronie (proxy przez
  `/api/__clerk` na api-serverze). **Do zweryfikowania na prawdziwym
  urządzeniu w etapie 2** — to główne ryzyko techniczne.

## Stan etapów

- [x] Etap 1 — Capacitor w repo, Android scaffold, ikony/splash z logo, tryb build:mobile, CORS
- [ ] Etap 2 — build APK w Android Studio, test na telefonie (auth Clerk!), konto Play Console, publikacja
- [ ] Etap 3 — iOS: `pnpm --filter @workspace/ksef-monitor exec cap add ios`, konto Apple, build w Codemagic, review
- [ ] Etap 4 (później) — push notifications (alerty cenowe), natywna kamera do OCR
