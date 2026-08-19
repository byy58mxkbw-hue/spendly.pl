// Ranking zmian ILOŚCI — CZYSTY moduł (bez Reacta, bez aliasów @/), żeby dało się
// go testować headless. Ten sam wzorzec co lib/ai-cfo-intent.ts po stronie serwera.
import type { ReportProductRow } from "@workspace/api-client-react";

export type QtyChange = {
  productName: string;
  unit: string;          // do wyświetlenia (oryginalny napis z pierwszego wiersza grupy)
  qty: number;
  prevQty: number;
  qtyDelta: number;      // w TEJ SAMEJ jednostce
  qtyPct: number;
  avgPrice: number;      // ważona, wyłącznie do progu istotności
  supplierCount: number;
};

type QtyInput = Pick<ReportProductRow, "productName" | "unit" | "totalQuantity" | "totalCost"> & {
  prevMonthTotalQuantity?: number | null;
};

/**
 * Trzy rzeczy, które muszą tu zostać:
 *
 * 1. GRUPUJEMY po (nazwa, jednostka) — /reports/monthly zwraca wiersze per
 *    (nazwa, jednostka, DOSTAWCA), więc ten sam produkt od dwóch dostawców to
 *    dwa wiersze. Bez sumowania karta pokazałaby połowę zamówienia.
 * 2. Grupa wchodzi do rankingu tylko, gdy KAŻDY jej wiersz ma poprzednią ilość.
 *    computeImpacts zeruje qtyPct przy braku historii, więc bez tego filtra nowy
 *    dostawca udawałby „bez zmian", a jego ilość zawyżałaby sumę → fałszywy wzrost.
 *    Odrzucone lądują w `skipped` i są pokazane w stopce, nie ukryte.
 * 3. SORTUJEMY po procencie, nie po delcie ilości. Delta jest w jednostkach, więc
 *    posortowanie po niej stawia 400 szt. serwetek nad 30 kg polędwicy.
 */
export function rankQuantityChanges(
  products: QtyInput[],
  opts?: { limit?: number; minImpactPln?: number },
): { up: QtyChange[]; down: QtyChange[]; skipped: number } {
  const limit = opts?.limit ?? 5;
  const minImpact = opts?.minImpactPln ?? 100;

  type Acc = QtyChange & { comparable: boolean; cost: number };
  const groups = new Map<string, Acc>();

  for (const p of products) {
    const unitRaw = p.unit ?? "";
    const unitKey = unitRaw.toLowerCase().trim().replace(/\.+$/, "");
    const key = `${p.productName}|${unitKey}`;
    const hasPrev = p.prevMonthTotalQuantity != null && p.prevMonthTotalQuantity > 0;

    const g = groups.get(key);
    if (!g) {
      groups.set(key, {
        productName: p.productName,
        unit: unitRaw,
        qty: p.totalQuantity,
        prevQty: p.prevMonthTotalQuantity ?? 0,
        qtyDelta: 0,
        qtyPct: 0,
        avgPrice: 0,
        supplierCount: 1,
        comparable: hasPrev,
        cost: p.totalCost ?? 0,
      });
    } else {
      g.qty += p.totalQuantity;
      g.prevQty += p.prevMonthTotalQuantity ?? 0;
      g.supplierCount += 1;
      g.cost += p.totalCost ?? 0;
      g.comparable = g.comparable && hasPrev;
    }
  }

  let skipped = 0;
  const rows: QtyChange[] = [];
  for (const g of groups.values()) {
    if (!g.comparable || g.prevQty <= 0) { skipped++; continue; }
    const qtyDelta = g.qty - g.prevQty;
    const avgPrice = g.qty > 0 ? g.cost / g.qty : 0;
    // Próg istotności — bez niego 1 kg → 3 kg (+200%) wypycha realne zmiany z top-5.
    if (g.prevQty < 1 || Math.abs(qtyDelta) * avgPrice < minImpact) { skipped++; continue; }
    rows.push({
      productName: g.productName,
      unit: g.unit,
      qty: g.qty,
      prevQty: g.prevQty,
      qtyDelta,
      qtyPct: (qtyDelta / g.prevQty) * 100,
      avgPrice,
      supplierCount: g.supplierCount,
    });
  }

  const up = rows.filter((r) => r.qtyDelta > 0).sort((a, b) => b.qtyPct - a.qtyPct).slice(0, limit);
  const down = rows.filter((r) => r.qtyDelta < 0).sort((a, b) => a.qtyPct - b.qtyPct).slice(0, limit);
  return { up, down, skipped };
}
