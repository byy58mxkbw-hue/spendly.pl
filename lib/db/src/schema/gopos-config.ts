import { pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Konfiguracja integracji GoPOS (per użytkownik/restauracja). Client secret trzymany
// ZASZYFROWANY (AES-256-GCM, jak token KSeF — encryptSecret/decryptSecret, rule 9).
// Na razie funkcja admin-only (gated w routes/gopos.ts), do czasu podłączenia API.
export const goposConfigTable = pgTable("gopos_config", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  clientId: text("client_id").notNull(),
  encryptedClientSecret: text("encrypted_client_secret").notNull(),
  clientSecretLast4: text("client_secret_last4").notNull().default(""),
  locationId: text("location_id"),
  // Opcjonalny host/base URL, jeśli API GoPOS jest per-merchant (do potwierdzenia z docsów).
  baseUrl: text("base_url"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("gopos_config_user_uniq").on(t.userId)]);

export const insertGoposConfigSchema = createInsertSchema(goposConfigTable).omit({
  id: true, userId: true, encryptedClientSecret: true, clientSecretLast4: true, createdAt: true, updatedAt: true,
});
export type GoposConfig = typeof goposConfigTable.$inferSelect;
export type InsertGoposConfig = z.infer<typeof insertGoposConfigSchema>;
