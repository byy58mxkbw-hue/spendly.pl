import { pgTable, serial, text, numeric, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";

export const dishesTable = pgTable("dishes", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  sellPrice: numeric("sell_price", { precision: 10, scale: 2 }).notNull().default("0"),
  category: text("category"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("dishes_user_id_idx").on(t.userId)]);

export const dishIngredientsTable = pgTable("dish_ingredients", {
  id: serial("id").primaryKey(),
  dishId: integer("dish_id").notNull().references(() => dishesTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  quantity: numeric("quantity", { precision: 10, scale: 4 }).notNull(),
  unit: text("unit").notNull().default("g"),
}, (t) => [index("dish_ingredients_dish_id_idx").on(t.dishId)]);

export const insertDishSchema = createInsertSchema(dishesTable).omit({ id: true, userId: true, createdAt: true, updatedAt: true });
export type InsertDish = z.infer<typeof insertDishSchema>;
export type Dish = typeof dishesTable.$inferSelect;
export type DishIngredient = typeof dishIngredientsTable.$inferSelect;
