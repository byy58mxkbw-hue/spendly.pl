import { pgTable, serial, text, timestamp, numeric, integer, boolean, uniqueIndex } from "drizzle-orm/pg-core";

// Stan subskrypcji — źródło prawdy o dostępie. `Clerk.publicMetadata.plan` zostaje
// jako szybki cache czytany w requireUser.ts (bez zmian tam), synchronizowany przy
// każdej zmianie tutaj (patrz lib/subscriptions.ts). Per-user (jeden wiersz na
// userId) — Spendly nie ma dziś Clerk Organizations.
//
// Faza A (2026-09): tylko trial, bez płatności — `provider='none'`, bez tokenu.
// Faza B (płatności Tpay) dopisze provider/token/next_charge_at do realnego użytku.
export const subscriptionsTable = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  provider: text("provider").notNull().default("none"), // 'none' | 'tpay' (Faza B)
  providerCustomerRef: text("provider_customer_ref"),
  // Zaszyfrowany token karty/zgoda BLIK do obciążeń cyklicznych (Faza B) — lib/encryption.ts.
  recurringTokenEnc: text("recurring_token_enc"),
  plan: text("plan").notNull().default("pro"), // 'pro' | 'business'
  billingCycle: text("billing_cycle"), // 'monthly' | 'yearly' — null dopóki nie ma realnej płatności
  status: text("status").notNull().default("trialing"), // 'trialing' | 'active' | 'past_due' | 'canceled'
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  nextChargeAt: timestamp("next_charge_at", { withTimezone: true }),
  lastChargeStatus: text("last_charge_status"),
  failedCharges: integer("failed_charges").notNull().default(0),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("subscriptions_user_id_uniq").on(t.userId),
]);

export type SubscriptionRow = typeof subscriptionsTable.$inferSelect;

// Log transakcji — pusta w Fazie A (trial nic nie płaci). `providerTxId` unikalne
// (gdy nie null) chroni webhook Tpay przed podwójnym zapisem tej samej płatności (Faza B).
export const paymentsTable = pgTable("payments", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  subscriptionId: integer("subscription_id"),
  provider: text("provider").notNull(),
  providerTxId: text("provider_tx_id"),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("PLN"),
  status: text("status").notNull(), // 'pending' | 'paid' | 'failed' | 'refunded'
  invoiceNumber: text("invoice_number"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("payments_provider_tx_id_uniq").on(t.provider, t.providerTxId),
]);

export type PaymentRow = typeof paymentsTable.$inferSelect;
