import { pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ksefConfigTable = pgTable("ksef_config", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().default("__legacy__"),
  nip: text("nip").notNull(),
  encryptedToken: text("encrypted_token").notNull(),
  tokenLast4: text("token_last4").notNull(),
  environment: text("environment").notNull().default("production"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  // When set, KSeF rate-limited this NIP until this time. Checked before every sync
  // attempt so users don't burn retries against an active cooldown.
  rateLimitedUntil: timestamp("rate_limited_until", { withTimezone: true }),
  syncFromDate: text("sync_from_date"),
  // Cached KSeF access token (AES-encrypted) + its expiry, so repeat syncs reuse
  // a still-valid session instead of running the multi-call auth handshake each time.
  sessionToken: text("session_token"),
  sessionValidUntil: timestamp("session_valid_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("ksef_config_user_id_uniq").on(t.userId),
  // One NIP per Spendly account enforced at the DB level to close race conditions.
  // Application-level ownership check in PUT /ksef/config is authoritative;
  // this constraint is a safety net for concurrent requests.
  uniqueIndex("ksef_config_nip_uniq").on(t.nip),
]);

export const insertKsefConfigSchema = createInsertSchema(ksefConfigTable).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertKsefConfig = z.infer<typeof insertKsefConfigSchema>;
export type KsefConfig = typeof ksefConfigTable.$inferSelect;
