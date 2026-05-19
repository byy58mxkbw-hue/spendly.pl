import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ksefConfigTable = pgTable("ksef_config", {
  id: serial("id").primaryKey(),
  nip: text("nip").notNull(),
  encryptedToken: text("encrypted_token").notNull(),
  tokenLast4: text("token_last4").notNull(),
  environment: text("environment").notNull().default("production"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertKsefConfigSchema = createInsertSchema(ksefConfigTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertKsefConfig = z.infer<typeof insertKsefConfigSchema>;
export type KsefConfig = typeof ksefConfigTable.$inferSelect;
