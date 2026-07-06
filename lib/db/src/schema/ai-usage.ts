import { pgTable, text, integer, timestamp, primaryKey } from "drizzle-orm/pg-core";

// Miesięczne zużycie AI per użytkownik (czat AI CFO + OCR skanowania faktur).
// Licznik w bazie (nie in-memory), bo limit jest miesięczny i musi przetrwać
// redeploye. Reset jest automatyczny — nowy `period` (YYYY-MM) = nowy wiersz = 0.
export const aiUsageTable = pgTable("ai_usage", {
  userId: text("user_id").notNull(),
  period: text("period").notNull(), // 'YYYY-MM' (strefa Europe/Warsaw)
  count: integer("count").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (t) => [
  primaryKey({ columns: [t.userId, t.period] }),
]);

export type AiUsage = typeof aiUsageTable.$inferSelect;
