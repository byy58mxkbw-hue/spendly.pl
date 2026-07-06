// Plany i miesięczne limity AI (czat AI CFO + OCR skanowania faktur — wspólna pula).
// Plan trzymany w Clerk `publicMetadata.plan` (jak `blocked`), nadawany w panelu admina.
// `null` = bez limitu (business).

export type Plan = "free" | "pro" | "business";

export const AI_MONTHLY_LIMIT: Record<Plan, number | null> = {
  free: 50,
  pro: 1000,
  business: null,
};

export function normalizePlan(value: unknown): Plan {
  return value === "pro" || value === "business" ? value : "free";
}

/** Klucz miesiąca 'YYYY-MM' w strefie Europe/Warsaw (spójny reset dla polskich użytkowników). */
export function currentPeriod(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}
