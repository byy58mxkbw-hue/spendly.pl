import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { inArray } from "drizzle-orm";
import { db, marketPriceBenchmarksTable } from "@workspace/db";

// Publiczna lista grup z medianą: tylko opublikowane, BEZ cen i liczby źródeł, bez logowania.
const RUN_DB = !!process.env.TEST_DATABASE_URL;

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAuth: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  // Brak zalogowanego usera — endpoint ma działać mimo to.
  getAuth: () => ({ userId: null, sessionClaims: {} }),
  clerkClient: { users: { getUser: async () => ({ emailAddresses: [], primaryEmailAddressId: null }) } },
}));

const KEYS = ["pubtest cytryna", "pubtest tajne"];

describe.skipIf(!RUN_DB)("GET /api/public/market-groups", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    await db.delete(marketPriceBenchmarksTable).where(inArray(marketPriceBenchmarksTable.marketGroupKey, KEYS));
    await db.insert(marketPriceBenchmarksTable).values([
      { marketGroupKey: KEYS[0], unit: "kg", category: "warzywa", periodMonth: "2026-09", medianPrice: "7.80", p25Price: "7.20", p75Price: "8.60", distinctUserCount: 5, distinctSupplierCount: 4, sampleRowCount: 9, isPublished: true },
      { marketGroupKey: KEYS[1], unit: "kg", category: "warzywa", periodMonth: "2026-09", medianPrice: "99.99", p25Price: "90", p75Price: "110", distinctUserCount: 1, distinctSupplierCount: 1, sampleRowCount: 1, isPublished: false },
    ]);
    const { __resetPublicMarketCache } = await import("./public-market");
    __resetPublicMarketCache();
    const app = (await import("../app")).default;
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 60_000);

  afterAll(async () => {
    await db.delete(marketPriceBenchmarksTable).where(inArray(marketPriceBenchmarksTable.marketGroupKey, KEYS));
    server?.close();
  });

  it("bez logowania zwraca tylko opublikowane grupy, bez żadnych cen ani liczników źródeł", async () => {
    const res = await fetch(`${baseUrl}/api/public/market-groups`);
    expect(res.status).toBe(200);
    const raw = await res.text();
    const body = JSON.parse(raw) as { groups: Array<Record<string, unknown>> };
    const names = body.groups.map((g) => g.name);
    expect(names).toContain("pubtest cytryna");
    expect(names).not.toContain("pubtest tajne");
    for (const forbidden of ["7.8", "7.20", "8.60", "medianPrice", "distinctUserCount", "sampleRowCount", "p25", "p75"]) {
      expect(raw).not.toContain(forbidden);
    }
    expect(res.headers.get("cache-control")).toContain("max-age=3600");
  });
});
