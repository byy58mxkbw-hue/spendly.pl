import type { Logger } from "pino";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

// Idempotentna migracja: dokłada kolumny szacowanej ceny AI do dish_ingredients
// (fallback wyceny, gdy składnik nie ma ceny z faktury KSeF). Uruchamiana na
// starcie serwera — prod tak zarządza schematem (patrz ensureRevenueTable).
export async function ensureDishIngredientColumns(log: Logger): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE IF EXISTS dish_ingredients
        ADD COLUMN IF NOT EXISTS est_unit_price numeric(12,4),
        ADD COLUMN IF NOT EXISTS est_unit       text
    `);
    // Ręczne powiązanie dania z pozycją GoPOS.
    await db.execute(sql`ALTER TABLE IF EXISTS dishes ADD COLUMN IF NOT EXISTS pos_product_name text`);
    // Waga/pojemność opakowania na produkcie — do konwersji „za szt" → gramy w recepturach.
    await db.execute(sql`
      ALTER TABLE IF EXISTS products
        ADD COLUMN IF NOT EXISTS package_qty  numeric(12,4),
        ADD COLUMN IF NOT EXISTS package_unit text,
        ADD COLUMN IF NOT EXISTS manual_price numeric(12,4),
        ADD COLUMN IF NOT EXISTS manual_unit  text
    `);
    log.info("dish_ingredients/products: kolumny szacunku i opakowania gotowe");
  } catch (err) {
    log.error({ err: String(err) }, "Nie udało się zapewnić kolumn est_*/package_*");
    throw err;
  }
}
