import { pgTable, serial, text, integer, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { suppliersTable } from "./suppliers";
import { productsTable } from "./products";

export const aiInsightsTable = pgTable("ai_insights", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  type: text("type").notNull(),
  severity: text("severity").notNull().default("medium"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  riskScore: integer("risk_score").notNull().default(0),
  productId: integer("product_id").references(() => productsTable.id, { onDelete: "set null" }),
  supplierId: integer("supplier_id").references(() => suppliersTable.id, { onDelete: "set null" }),
  metadata: jsonb("metadata"),
  readAt: timestamp("read_at", { withTimezone: true }),
  dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("ai_insights_user_id_idx").on(t.userId),
  index("ai_insights_created_at_idx").on(t.createdAt),
]);

export type AiInsight = typeof aiInsightsTable.$inferSelect;
