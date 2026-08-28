import { logger } from "./logger";

/**
 * Telemetria produktowa po stronie SERWERA.
 *
 * Powód: front wysyła zdarzenia do PostHoga dopiero po zgodzie Cookiebota, więc
 * użytkownik, który wyczyści ciasteczka, wejdzie z innej przeglądarki albo ma
 * blokadę reklam, jest w analityce całkowicie niewidzialny (realny przypadek:
 * klient logował się 17.08.2026, a PostHog nie zapisał od niego ani jednego
 * zdarzenia). Zdarzenia z serwera nie zależą od przeglądarki.
 *
 * Zasady:
 * - `distinct_id` = userId z Clerka, czyli TO SAMO id, którym front woła
 *   `posthog.identify()`. Dzięki temu zdarzenia serwerowe doklejają się do
 *   istniejącej osoby zamiast tworzyć drugą.
 * - Bez SDK — zwykły `fetch` (reguła 25: niezbundlowana zależność = crash-loop
 *   api-servera na produkcji).
 * - Bez `POSTHOG_API_KEY` całość jest no-opem, jak Sentry.
 * - Fire-and-forget: nigdy nie wywraca ani nie opóźnia requestu użytkownika.
 * - Do properties trafiają WYŁĄCZNIE liczniki i typy. Żadnych nazw produktów,
 *   dostawców, kwot, NIP-ów, treści czatu ani tokenów — to dane kontrahentów
 *   klienta i nie mają czego szukać w analityce.
 */

const API_KEY = process.env.POSTHOG_API_KEY;
const HOST = process.env.POSTHOG_HOST ?? "https://eu.i.posthog.com";
const TIMEOUT_MS = 3000;

export type TelemetryProps = Record<string, string | number | boolean>;

export function isTelemetryEnabled(): boolean {
  return Boolean(API_KEY);
}

export function captureServer(userId: string, event: string, props?: TelemetryProps): void {
  if (!API_KEY || !userId) return;

  void fetch(`${HOST}/i/v0/e/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: API_KEY,
      event,
      distinct_id: userId,
      properties: { ...props, $lib: "spendly-api" },
      timestamp: new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch((err: unknown) => {
    // Analityka nigdy nie może zepsuć działania aplikacji — tylko ślad w logach.
    logger.debug({ err: String(err), event }, "Telemetry capture failed");
  });
}
