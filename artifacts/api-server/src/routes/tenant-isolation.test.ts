import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { inArray } from "drizzle-orm";
import { db, suppliersTable } from "@workspace/db";

// Faza 2.2 — izolacja tenantów. Uderza w PRAWDZIWY route /api/suppliers,
// więc łapie regresję, gdyby ktoś pominął filtr user_id w zapytaniu.
//
// Wymaga bazy: uruchamia się tylko gdy TEST_DATABASE_URL ustawione (CI z serwisem
// postgres). Lokalnie bez bazy → pominięte, `pnpm test` zostaje zielony.
const RUN_DB = !!process.env.TEST_DATABASE_URL;

// Mock Clerk PRZED importem app (vi.mock jest hoistowany). Sterujemy userId per żądanie.
const authState = vi.hoisted(() => ({ userId: "test_tenant_A" }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAuth: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: authState.userId, sessionClaims: { publicMetadata: {} } }),
  clerkClient: { users: { getUser: async () => ({ emailAddresses: [], primaryEmailAddressId: null }) } },
}));

const USER_A = "test_tenant_A";
const USER_B = "test_tenant_B";

describe.skipIf(!RUN_DB)("izolacja tenantów: GET /api/suppliers", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = (await import("../app")).default;
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    // Idempotentnie: czyść i seeduj po jednym dostawcy dla A i B.
    await db.delete(suppliersTable).where(inArray(suppliersTable.userId, [USER_A, USER_B]));
    await db.insert(suppliersTable).values([
      { userId: USER_A, name: "SUP-A-iso", taxId: "1111111111" },
      { userId: USER_B, name: "SUP-B-iso", taxId: "2222222222" },
    ]);
  });

  afterAll(async () => {
    await db.delete(suppliersTable).where(inArray(suppliersTable.userId, [USER_A, USER_B]));
    server?.close();
  });

  async function supplierNames(): Promise<string[]> {
    const res = await fetch(`${baseUrl}/api/suppliers`);
    expect(res.status).toBe(200);
    const list = (await res.json()) as Array<{ name: string }>;
    return list.map((s) => s.name);
  }

  it("user B widzi swojego dostawcę, NIE widzi dostawcy usera A", async () => {
    authState.userId = USER_B;
    const names = await supplierNames();
    expect(names).toContain("SUP-B-iso");
    expect(names).not.toContain("SUP-A-iso");
  });

  it("user A widzi swojego dostawcę, NIE widzi dostawcy usera B", async () => {
    authState.userId = USER_A;
    const names = await supplierNames();
    expect(names).toContain("SUP-A-iso");
    expect(names).not.toContain("SUP-B-iso");
  });
});
