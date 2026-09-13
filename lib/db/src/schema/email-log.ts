import { pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// Log wysłanych maili transakcyjnych (powitanie, w przyszłości alerty/tygodniówki
// z docs/backlog.md) — chroni przed podwójną wysyłką tego samego typu do usera
// (webhooki Clerk mogą przyjść więcej niż raz). `(user_id, type)` unikalne:
// insert z ON CONFLICT DO NOTHING to "claim" prawa do wysyłki (patrz email-service.ts).
export const emailLogTable = pgTable("email_log", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  type: text("type").notNull(), // np. 'welcome'
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("email_log_user_type_uniq").on(t.userId, t.type),
]);

export type EmailLogRow = typeof emailLogTable.$inferSelect;
