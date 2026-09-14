import OpenAI from "openai";
import { PostHog } from "posthog-node";
import { OpenAI as PostHogOpenAI } from "@posthog/ai/openai";

// PostHog AI Observability (koszt/tokeny/czas/model dla wywołań OpenAI) — TYLKO
// metadane, nigdy treść promptu/odpowiedzi: `privacyMode: true` na kliencie
// PostHog wymusza redakcję dla WSZYSTKICH wywołań AI globalnie (nie trzeba
// pamiętać o fladze przy każdym .create()). Zgodne z zasadą z api-server/lib/telemetry.ts
// — do analityki nie trafia treść czatu/faktur klienta, tylko liczniki.
// Bez POSTHOG_API_KEY — no-op, zwykły klient OpenAI (jak przy braku klucza w ogóle).
const posthogApiKey = process.env.POSTHOG_API_KEY;
const posthogHost = process.env.POSTHOG_HOST ?? "https://eu.i.posthog.com";
const posthogClient = posthogApiKey ? new PostHog(posthogApiKey, { host: posthogHost, privacyMode: true }) : null;

// Wołający dokładają `posthogDistinctId` do body TYLKO gdy to true — bez tego
// pole trafiłoby do żądania nawet przy zwykłym (nie-PostHog) kliencie OpenAI,
// a wtedy leciałoby jako nieznany parametr wprost do API OpenAI.
export const aiObservabilityEnabled = Boolean(posthogClient);

// Adnotacja typu `OpenAI` (nie unia z PostHogOpenAI) celowo — biblioteka PostHog
// przeciąża `.chat.completions.create` dodatkowymi sygnaturami, a unia dwóch
// zestawów przeciążeń robi się niewywoływalna dla TS. `PostHogOpenAI extends OpenAI`,
// więc zawężenie do bazowej klasy jest bezpieczne; `posthogDistinctId` na wywołaniach
// idzie przez `aiObservabilityEnabled` + `@ts-expect-error` (patrz call site'y).
export const openai: OpenAI | null = process.env.AI_INTEGRATIONS_OPENAI_API_KEY && process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
  ? posthogClient
    ? new PostHogOpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
        posthog: posthogClient,
      })
    : new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      })
  : null;

/**
 * Zwraca skonfigurowanego klienta OpenAI lub rzuca czytelnym błędem.
 * Używaj zamiast `openai!`, żeby brak konfiguracji AI dawał jasny komunikat
 * zamiast `Cannot read properties of null`.
 */
export function requireOpenAI(): OpenAI {
  if (!openai) {
    throw new Error("Funkcje AI są niedostępne — brak konfiguracji OpenAI (AI_INTEGRATIONS_OPENAI_API_KEY / _BASE_URL).");
  }
  return openai;
}
