/**
 * Jednorazowy (idempotentny) merge duplikatów produktów powstałych zanim
 * naprawiono normalizację spacji (bug ws-normalize-fix, 2026-07).
 *
 * "POMIDOR  CHERRY" i "POMIDOR CHERRY" (różna liczba spacji) trafiały jako osobne
 * wiersze w `products`, bo findOrCreateProduct porównywał surowe nazwy. Po fixie
 * nowe fakturki już nie tworzą duplikatów — ten krok scala te, które już istnieją.
 *
 * Algorytm:
 *  1. Dla każdego (user_id) znajdź grupy produktów gdzie
 *     `regexp_replace(lower(btrim(name)), '\s+', ' ', 'g')` jest identyczne.
 *  2. W grupie zostaje JEDEN kanoniczny produkt: ten z największą liczbą pozycji
 *     faktur (najlepiej zasilony danymi), tiebreak: najniższe id.
 *  3. Reszta grupy (duplikaty) dostaje przepięte FK:
 *     - invoice_items.product_id → kanoniczny
 *     - product_corrections.product_id → kanoniczny (lub usunięte, jeśli kolizja)
 *     - dish_ingredients.product_id → kanoniczny
 *  4. Duplikaty zostają usunięte z `products`.
 *     ai_insights.product_id ma ON DELETE SET NULL — nie wymaga ręcznego przepinania.
 *
 * Bezpieczne przy każdym starcie: po pierwszym przebiegu żadna para nie spełnia
 * warunku HAVING count(*)>1 → 0 zmian.
 */

import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger as rootLogger } from "../lib/logger.js";

const log = rootLogger.child({ service: "merge-duplicate-products" });

type DupGroup = {
  user_id: string;
  normalized: string;
  ids: string;
  item_counts: string;
};

export async function mergeDuplicateProducts(): Promise<void> {
  try {
    // Znajdź grupy duplikatów — produkty z identyczną znormalizowaną nazwą per user.
    const result = await db.execute<{
      user_id: string;
      normalized: string;
      ids: string;         // postgres array_agg → string "1,2,3"
      item_counts: string; // dopasowane do ids
    }>(sql`
      SELECT
        p.user_id,
        regexp_replace(lower(btrim(p.name)), '\\s+', ' ', 'g') AS normalized,
        string_agg(p.id::text, ',' ORDER BY
          COALESCE(ic.cnt, 0) DESC,  -- kanoniczny = najwięcej faktur
          p.id ASC                    -- tiebreak: niższe id
        ) AS ids,
        string_agg(COALESCE(ic.cnt, 0)::text, ',' ORDER BY
          COALESCE(ic.cnt, 0) DESC,
          p.id ASC
        ) AS item_counts
      FROM products p
      LEFT JOIN (
        SELECT product_id, COUNT(*)::int AS cnt
        FROM invoice_items
        GROUP BY product_id
      ) ic ON ic.product_id = p.id
      GROUP BY p.user_id, regexp_replace(lower(btrim(p.name)), '\\s+', ' ', 'g')
      HAVING COUNT(*) > 1
    `);

    const groups = result.rows as unknown as DupGroup[];

    if (groups.length === 0) {
      log.info("merge-duplicates: brak duplikatów produktów — nic do zrobienia");
      return;
    }

    let mergedGroups = 0;
    let removedProducts = 0;
    let relinkedItems = 0;

    for (const group of groups) {
      const ids = group.ids.split(",").map(Number);
      const canonicalId = ids[0]!;   // pierwszy = ten z najwięcej faktur
      const duplicateIds = ids.slice(1);

      // Przepnij invoice_items
      const itemsResult = await db.execute(sql`
        UPDATE invoice_items
        SET product_id = ${canonicalId}
        WHERE product_id = ANY(ARRAY[${sql.raw(duplicateIds.join(","))}]::int[])
      `);
      relinkedItems += (itemsResult as unknown as { rowCount?: number }).rowCount ?? 0;

      // Przepnij dish_ingredients
      await db.execute(sql`
        UPDATE dish_ingredients
        SET product_id = ${canonicalId}
        WHERE product_id = ANY(ARRAY[${sql.raw(duplicateIds.join(","))}]::int[])
      `);

      // product_corrections: usuń duplikaty dla duplikatów produktów
      // (nie przepinamy, żeby uniknąć kolizji klucza (user_id, normalized_name) — korekty
      // dla kanonicznego produktu zostają; dla duplikatów można je skasować bo to ta sama nazwa)
      await db.execute(sql`
        DELETE FROM product_corrections
        WHERE product_id = ANY(ARRAY[${sql.raw(duplicateIds.join(","))}]::int[])
      `);

      // Usuń duplikaty produktów (ai_insights.product_id → SET NULL automatycznie)
      await db.execute(sql`
        DELETE FROM products
        WHERE id = ANY(ARRAY[${sql.raw(duplicateIds.join(","))}]::int[])
      `);

      mergedGroups++;
      removedProducts += duplicateIds.length;
    }

    log.info(
      { mergedGroups, removedProducts, relinkedItems },
      "merge-duplicates: scalono duplikaty produktów"
    );
  } catch (err) {
    log.warn({ err }, "merge-duplicate-products: nieudane (non-fatal)");
  }
}
