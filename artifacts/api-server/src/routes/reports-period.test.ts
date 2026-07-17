import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { inArray } from "drizzle-orm";
import { db, suppliersTable, invoicesTable, invoiceItemsTable } from "@workspace/db";

// Testy okresu w /reports/monthly. Uderzają w PRAWDZIWY route, więc łapią regresję,
// gdyby ktoś ruszył filtr zakresu [from,to] albo porównanie do poprzedniego okresu.
// Wymaga bazy: uruchamia się tylko gdy TEST_DATABASE_URL ustawione (CI). Lokalnie → pominięte.
const RUN_DB = !!process.env.TEST_DATABASE_URL;

const authState = vi.hoisted(() => ({ userId: "test_reports_R" }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAuth: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: authState.userId, sessionClaims: { publicMetadata: {} } }),
  clerkClient: { users: { getUser: async () => ({ emailAddresses: [], primaryEmailAddressId: null }) } },
}));

const USER_R = "test_reports_R";
const USER_OTHER = "test_reports_OTHER";

type MonthlyResponse = {
  month: string;
  totalSpend: number;
  invoiceCount: number;
  productCount: number;
  topProducts: Array<{ productName: string; totalCost: number }>;
};

describe.skipIf(!RUN_DB)("/reports/monthly — okres [from,to] + porównanie", () => {
  let server: Server;
  let baseUrl: string;

  async function seedInvoice(
    userId: string,
    supplierId: number,
    invoiceDate: string,
    items: Array<{ name: string; qty: number; unitPrice: number; total: number }>,
    opts: { excluded?: boolean; number?: string } = {},
  ) {
    const [inv] = await db
      .insert(invoicesTable)
      .values({
        userId,
        supplierId,
        invoiceNumber: opts.number ?? `T-${invoiceDate}-${Math.random().toString(36).slice(2, 7)}`,
        invoiceDate,
        totalAmount: String(items.reduce((s, it) => s + it.total, 0)),
        excluded: opts.excluded ?? false,
      })
      .returning({ id: invoicesTable.id });
    await db.insert(invoiceItemsTable).values(
      items.map((it) => ({
        invoiceId: inv.id,
        productName: it.name,
        quantity: String(it.qty),
        unit: "kg",
        unitPrice: String(it.unitPrice),
        totalPrice: String(it.total),
      })),
    );
    return inv.id;
  }

  beforeAll(async () => {
    const app = (await import("../app")).default;
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    // Sprzątanie po ewentualnym poprzednim biegu (kaskada usuwa items + invoices).
    await db.delete(suppliersTable).where(inArray(suppliersTable.userId, [USER_R, USER_OTHER]));

    const [supR] = await db
      .insert(suppliersTable)
      .values({ userId: USER_R, name: "SUP-R", taxId: "5555555555" })
      .returning({ id: suppliersTable.id });
    const [supO] = await db
      .insert(suppliersTable)
      .values({ userId: USER_OTHER, name: "SUP-O", taxId: "6666666666" })
      .returning({ id: suppliersTable.id });

    // USER_R:
    // Lipiec 2026: Mleko 50 + Ser 100 = 150 (2 faktury)
    await seedInvoice(USER_R, supR.id, "2026-07-10", [{ name: "Mleko", qty: 10, unitPrice: 5, total: 50 }]);
    await seedInvoice(USER_R, supR.id, "2026-07-20", [{ name: "Ser", qty: 4, unitPrice: 25, total: 100 }]);
    // Czerwiec 2026 (poprzedni okres): Ser 60
    await seedInvoice(USER_R, supR.id, "2026-06-15", [{ name: "Ser", qty: 2, unitPrice: 30, total: 60 }]);
    // Poza zakresem (maj): NIE ma prawa wejść do lipca/czerwca
    await seedInvoice(USER_R, supR.id, "2026-05-01", [{ name: "Szynka", qty: 1, unitPrice: 999, total: 999 }]);
    // Wykluczona faktura w lipcu: NIE liczy się do sum
    await seedInvoice(USER_R, supR.id, "2026-07-05", [{ name: "Kawior", qty: 1, unitPrice: 500, total: 500 }], {
      excluded: true,
    });

    // USER_OTHER: lipiec 7777 — nie ma prawa wyciec do sum USER_R
    await seedInvoice(USER_OTHER, supO.id, "2026-07-12", [{ name: "Trufle", qty: 1, unitPrice: 7777, total: 7777 }]);
  });

  afterAll(async () => {
    await db.delete(suppliersTable).where(inArray(suppliersTable.userId, [USER_R, USER_OTHER]));
    server?.close();
  });

  async function monthly(query: string, asUser = USER_R): Promise<MonthlyResponse> {
    authState.userId = asUser;
    const res = await fetch(`${baseUrl}/api/reports/monthly?${query}`);
    expect(res.status).toBe(200);
    return (await res.json()) as MonthlyResponse;
  }

  it("pojedynczy miesiąc sumuje tylko swoje faktury (excluded i poza-zakresem pominięte)", async () => {
    const r = await monthly("month=2026-07");
    expect(r.totalSpend).toBe(150); // 50 + 100; NIE 650 (excluded 500), NIE 7777 (inny user)
    expect(r.invoiceCount).toBe(2);
    const names = r.topProducts.map((p) => p.productName);
    expect(names).toContain("Mleko");
    expect(names).toContain("Ser");
    expect(names).not.toContain("Kawior"); // excluded
    expect(names).not.toContain("Szynka"); // maj, poza zakresem
    expect(names).not.toContain("Trufle"); // inny tenant
  });

  it("zakres from/to obejmujący dwa miesiące SUMUJE cały okres", async () => {
    const r = await monthly("from=2026-06-01&to=2026-07-31");
    expect(r.totalSpend).toBe(210); // czerwiec 60 + lipiec 150
    expect(r.invoiceCount).toBe(3);
  });

  it("miesiąc == równoważny from/to daje IDENTYCZNY wynik (zero regresji)", async () => {
    const byMonth = await monthly("month=2026-07");
    const byRange = await monthly("from=2026-07-01&to=2026-07-31");
    expect(byRange.totalSpend).toBe(byMonth.totalSpend);
    expect(byRange.invoiceCount).toBe(byMonth.invoiceCount);
  });

  it("zakres własnych dni filtruje dokładnie po dacie", async () => {
    // tylko 2026-07-10 (Mleko 50) — 2026-07-20 (Ser) już poza
    const r = await monthly("from=2026-07-08&to=2026-07-15");
    expect(r.totalSpend).toBe(50);
    expect(r.invoiceCount).toBe(1);
    expect(r.topProducts.map((p) => p.productName)).toEqual(["Mleko"]);
  });

  it("izolacja tenantów: USER_OTHER nie widzi sum USER_R", async () => {
    const r = await monthly("month=2026-07", USER_OTHER);
    expect(r.totalSpend).toBe(7777); // tylko własna faktura
    expect(r.invoiceCount).toBe(1);
  });

  it("tryb all zwraca sumę wszystkich nie-wykluczonych faktur usera", async () => {
    const r = await monthly("month=all");
    // Mleko 50 + Ser 100 + Ser 60 + Szynka 999 = 1209 (bez excluded 500)
    expect(r.totalSpend).toBe(1209);
    expect(r.invoiceCount).toBe(4);
    expect(r.month).toBe("all");
  });
});
