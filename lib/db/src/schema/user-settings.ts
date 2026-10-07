import { pgTable, serial, text, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// Ustawienia per-user, które muszą być odpytywalne z SQL (join/WHERE w batchu),
// więc nie mogą żyć jedynie w Clerk publicMetadata (jak plan/blocked). Jedna
// tabela na przyszłe flagi tego typu — zaczynamy od benchmarkOptIn.
export const userSettingsTable = pgTable("user_settings", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  // Domyślnie true: user bierze udział w benchmarku rynkowym (i widzi go), dopóki
  // sam nie wyłączy w Ustawieniach -> Prywatność. Wyłączenie działa w OBIE strony —
  // patrz market-benchmark-job.ts (WHERE) i routes/benchmarks.ts (guard w GET).
  benchmarkOptIn: boolean("benchmark_opt_in").notNull().default(true),
  // Kiedy user zamknął powitanie po założeniu konta. W bazie, nie w localStorage —
  // inaczej powitanie wracałoby na każdym nowym urządzeniu/przeglądarce.
  welcomeSeenAt: timestamp("welcome_seen_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("user_settings_user_id_uniq").on(t.userId),
]);

export type UserSettings = typeof userSettingsTable.$inferSelect;
