import OpenAI from "openai";

export const openai = process.env.AI_INTEGRATIONS_OPENAI_API_KEY && process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
  ? new OpenAI({
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
