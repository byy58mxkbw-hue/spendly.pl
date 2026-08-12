// Walidacja zapytania „zmiana cen wg dostawcy" (AI CFO) na realnych danych.
// TYLKO ODCZYT — same SELECT-y, nic nie zapisuje. Uruchom:
//   pnpm --filter @workspace/scripts exec tsx ./src/check-supplier-price-changes.ts
//
// Po co: SQL-a nie łapie ani typecheck, ani testy jednostkowe. To najtańszy
// sposób sprawdzić, że indeks cenowy się liczy i zwraca sensowne liczby.
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const users = await db.execute(sql`
  SELECT user_id, COUNT(*)::int AS invoices
  FROM invoices
  GROUP BY 1 ORDER BY 2 DESC LIMIT 3
`);
console.log("Użytkownicy wg liczby faktur:", users.rows);

const userId = (users.rows[0] as { user_id: string }).user_id;
const curFrom = daysAgo(30);
const prevFrom = daysAgo(60);
console.log(`\nOkna: teraz >= ${curFrom}, poprzednie ${prevFrom}..${curFrom}\n`);

const res = await db.execute(sql`
  WITH win AS (
    SELECT
      inv.supplier_id AS supplier_id,
      ii.product_id AS product_id,
      ii.unit AS unit,
      CASE WHEN inv.invoice_date >= ${curFrom} THEN 'now' ELSE 'prev' END AS bucket,
      SUM(ii.quantity::numeric) AS qty,
      SUM(ii.total_price::numeric) / NULLIF(SUM(ii.quantity::numeric), 0) AS avg_price
    FROM invoice_items ii
    JOIN invoices inv ON ii.invoice_id = inv.id
    WHERE inv.user_id = ${userId}
      AND inv.excluded = false
      AND inv.parent_invoice_id IS NULL
      AND (inv.invoice_type IS DISTINCT FROM 'KOR')
      AND ii.quantity::numeric > 0
      AND ii.unit_price::numeric > 0
      AND inv.invoice_date >= ${prevFrom}
    GROUP BY 1, 2, 3, 4
  ),
  paired AS (
    SELECT n.supplier_id AS supplier_id,
           n.qty AS qty_now,
           n.avg_price AS price_now,
           p.avg_price AS price_prev
    FROM win n
    JOIN win p
      ON p.supplier_id = n.supplier_id
     AND p.product_id = n.product_id
     AND p.unit IS NOT DISTINCT FROM n.unit
     AND p.bucket = 'prev'
    WHERE n.bucket = 'now'
      AND p.avg_price > 0
  )
  SELECT s.name AS supplier_name,
         COUNT(*)::int AS products,
         ROUND(SUM(pd.qty_now * pd.price_now), 0)::text AS cost_now,
         ROUND(SUM(pd.qty_now * pd.price_prev), 0)::text AS cost_old,
         ROUND(
           (SUM(pd.qty_now * pd.price_now) - SUM(pd.qty_now * pd.price_prev))
           / NULLIF(SUM(pd.qty_now * pd.price_prev), 0) * 100, 1
         )::text AS change_pct
  FROM paired pd
  JOIN suppliers s ON s.id = pd.supplier_id
  GROUP BY s.id, s.name
  HAVING SUM(pd.qty_now * pd.price_prev) > 0
  ORDER BY (SUM(pd.qty_now * pd.price_now) - SUM(pd.qty_now * pd.price_prev))
           / NULLIF(SUM(pd.qty_now * pd.price_prev), 0) DESC
  LIMIT 10
`);

console.log(`Wierszy: ${res.rows.length}`);
console.table(res.rows);
process.exit(0);
