import type { Logger } from "pino";
import { db, goposConfigTable, restaurantRevenueTable, posSalesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { decryptSecret } from "../lib/encryption";
import { getGoposToken, fetchSales } from "./gopos-client";

// Ostatnie n miesięcy jako 'YYYY-MM' (bieżący + poprzednie).
function lastMonths(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

// Granice miesiąca jako ISO 'YYYY-MM-DDTHH:mm:ss' (dla closed_at GoPOS).
function monthBounds(period: string): { from: string; to: string } {
  const [y, m] = period.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${period}-01T00:00:00`, to: `${period}-${String(lastDay).padStart(2, "0")}T23:59:59` };
}

export type GoposSyncSummary = { months: number; revenueUpserts: number; itemUpserts: number };

// Synchronizuje przychód + sprzedaż per pozycja z GoPOS dla usera (ostatnie `monthsBack` mies.).
// Read-only po stronie GoPOS; u nas upsert do restaurant_revenue + pos_sales.
export async function syncGoposForUser(userId: string, log: Logger, monthsBack = 3): Promise<GoposSyncSummary> {
  const [cfg] = await db.select().from(goposConfigTable).where(eq(goposConfigTable.userId, userId)).limit(1);
  if (!cfg) throw new Error("Brak konfiguracji GoPOS.");
  if (!cfg.locationId) throw new Error("Brak organization_id (pole locationId) w konfiguracji GoPOS.");

  const secret = decryptSecret(cfg.encryptedClientSecret);
  const token = await getGoposToken(cfg.clientId, secret, cfg.locationId);

  let revenueUpserts = 0;
  let itemUpserts = 0;
  const months = lastMonths(monthsBack);

  for (const period of months) {
    const { from, to } = monthBounds(period);
    const { revenueNet, items } = await fetchSales(token, cfg.locationId, from, to);

    await db
      .insert(restaurantRevenueTable)
      .values({ userId, period, amountNet: revenueNet.toFixed(2) })
      .onConflictDoUpdate({
        target: [restaurantRevenueTable.userId, restaurantRevenueTable.period],
        set: { amountNet: revenueNet.toFixed(2), updatedAt: new Date() },
      });
    revenueUpserts++;

    // Dedupe po nazwie (GoPOS grupuje po produkcie, ale asekuracyjnie) + bulk upsert.
    const byName = new Map<string, { qty: number; net: number; productId: string | null }>();
    for (const it of items) byName.set(it.name, { qty: it.qty, net: it.net, productId: it.productId });
    const rows = [...byName.entries()].map(([productName, v]) => ({
      userId, period, productName, posProductId: v.productId, qty: v.qty.toString(), netValue: v.net.toFixed(2), source: "gopos",
    }));
    if (rows.length > 0) {
      await db
        .insert(posSalesTable)
        .values(rows)
        .onConflictDoUpdate({
          target: [posSalesTable.userId, posSalesTable.period, posSalesTable.productName],
          set: { posProductId: sql`excluded.pos_product_id`, qty: sql`excluded.qty`, netValue: sql`excluded.net_value`, source: sql`excluded.source`, updatedAt: sql`now()` },
        });
      itemUpserts += rows.length;
    }
    log.info({ userId, period, items: rows.length, revenueNet }, "GoPOS: zsynchronizowano miesiąc");
  }

  await db.update(goposConfigTable).set({ lastSyncedAt: new Date() }).where(eq(goposConfigTable.userId, userId));
  return { months: months.length, revenueUpserts, itemUpserts };
}
