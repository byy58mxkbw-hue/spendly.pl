import { pgTable, serial, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";

export const aiCfoSessionsTable = pgTable("ai_cfo_sessions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  messages: jsonb("messages").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (t) => [
  index("ai_cfo_sessions_user_id_idx").on(t.userId),
  index("ai_cfo_sessions_expires_at_idx").on(t.expiresAt),
]);

export type AiCfoSession = typeof aiCfoSessionsTable.$inferSelect;
