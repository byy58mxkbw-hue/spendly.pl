import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { Logger } from "pino";
import { inArray, eq } from "drizzle-orm";
import { db, suppliersTable, invoicesTable, invoiceItemsTable, invoiceWzDocumentsTable } from "@workspace/db";

// WZ przy fakturze: numery z XML, odczyt WZ (AI zamockowane) i porównanie z pozycjami
// faktury, izolacja kont. DB-gated (TEST_DATABASE_URL).
const RUN_DB = !!process.env.TEST_DATABASE_URL;

const authState = vi.hoisted(() => ({ userId: "test_wz_owner" }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAuth: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: authState.userId, sessionClaims: { publicMetadata: {} } }),
  clerkClient: { users: { getUser: async () => ({ emailAddresses: [], primaryEmailAddressId: null }) } },
}));

const aiCalls = vi.hoisted(() => ({ n: 0 }));
vi.mock("@workspace/integrations-openai-ai-server", () => ({
  aiObservabilityEnabled: false,
  openai: null,
  requireOpenAI: () => ({
    chat: {
      completions: {
        create: async () => {
          aiCalls.n++;
          return {
            choices: [{
              message: {
                content: JSON.stringify({
                  wzNumber: "WZ/101/10/2026",
                  wzDate: "2026-10-10",
                  items: [
                    { productName: "Cytryna RPA", quantity: 10, unit: "kg" },
                    { productName: "Boczek wędzony Laskopol", quantity: "5,0", unit: "kg" },
                  ],
                }),
              },
            }],
          };
        },
      },
    },
  }),
}));

const log = { info: () => {}, error: () => {}, warn: () => {} } as unknown as Logger;
const OWNER = "test_wz_owner";
const OTHER = "test_wz_other";
const XML = `<Faktura><Fa><P_2>FV/1/10/2026</P_2><WZ>WZ/101/10/2026</WZ><WZ>WZ/102/10/2026</WZ></Fa></Faktura>`;

describe.skipIf(!RUN_DB)("WZ przy fakturze: /invoices/:id/wz", () => {
  let server: Server;
  let baseUrl: string;
  let invoiceId = 0;
  let supplierId = 0;

  beforeAll(async () => {
    const { ensurePreListenColumns } = await import("../services/ensure-invoice-source");
    await ensurePreListenColumns(log);
    const app = (await import("../app")).default;
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const [s] = await db.insert(suppliersTable).values({ userId: OWNER, name: "Stelma test WZ", taxId: "1111111111" }).returning({ id: suppliersTable.id });
    supplierId = s!.id;
    const [inv] = await db
      .insert(invoicesTable)
      .values({ userId: OWNER, supplierId, invoiceNumber: "FV/1/10/2026", invoiceDate: "2026-10-10", totalAmount: "200.00", excluded: false, xmlContent: XML })
      .returning({ id: invoicesTable.id });
    invoiceId = inv!.id;
    await db.insert(invoiceItemsTable).values([
      { invoiceId, productName: "CYTRYNA RPA", quantity: "10", unit: "kg", unitPrice: "8", totalPrice: "80" },
      { invoiceId, productName: "LASKOPOL BOCZEK WĘDZONY", quantity: "5.5", unit: "kg", unitPrice: "20", totalPrice: "110" },
    ]);
  }, 90_000);

  afterAll(async () => {
    await db.delete(invoiceWzDocumentsTable).where(eq(invoiceWzDocumentsTable.invoiceId, invoiceId));
    await db.delete(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, invoiceId));
    await db.delete(invoicesTable).where(eq(invoicesTable.id, invoiceId));
    await db.delete(suppliersTable).where(inArray(suppliersTable.id, [supplierId]));
    server?.close();
  });

  const call = (path: string, init?: RequestInit) => fetch(`${baseUrl}/api${path}`, init);

  it("GET: numery WZ z XML faktury, bez porównania dopóki nic nie odczytano", async () => {
    authState.userId = OWNER;
    const res = await call(`/invoices/${invoiceId}/wz`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { wzNumbers: string[]; documents: unknown[]; comparison: unknown };
    expect(body.wzNumbers).toEqual(["WZ/101/10/2026", "WZ/102/10/2026"]);
    expect(body.documents).toHaveLength(0);
    expect(body.comparison).toBeNull();
  });

  it("cudza faktura → 404 (GET i odczyt WZ, bez wywołania AI)", async () => {
    authState.userId = OTHER;
    expect((await call(`/invoices/${invoiceId}/wz`)).status).toBe(404);
    const before = aiCalls.n;
    const scan = await call(`/invoices/${invoiceId}/wz/scan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wzNumber: "WZ/101/10/2026", pages: [{ imageBase64: "aGVsbG8=", mimeType: "image/jpeg" }] }),
    });
    expect(scan.status).toBe(404);
    expect(aiCalls.n).toBe(before);
  });

  it("odczyt WZ zapisuje pozycje i porównuje je z fakturą; usunięcie odpina dokument", async () => {
    authState.userId = OWNER;
    const res = await call(`/invoices/${invoiceId}/wz/scan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wzNumber: "WZ/101/10/2026", pages: [{ imageBase64: "aGVsbG8=", mimeType: "image/jpeg" }] }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      documents: Array<{ id: number; wzDate: string; items: Array<{ quantity: number }> }>;
      comparison: { rows: Array<{ invoiceName: string; status: string; difference: number | null }>; summary: Record<string, number> };
    };
    expect(body.documents).toHaveLength(1);
    expect(body.documents[0]!.wzDate).toBe("2026-10-10");
    expect(body.documents[0]!.items[1]!.quantity).toBe(5); // „5,0” → 5
    const boczek = body.comparison.rows.find((r) => r.invoiceName === "LASKOPOL BOCZEK WĘDZONY")!;
    expect(boczek.status).toBe("difference");
    expect(boczek.difference).toBe(-0.5);
    expect(body.comparison.summary.ok).toBe(1);

    const del = await call(`/invoices/${invoiceId}/wz/${body.documents[0]!.id}`, { method: "DELETE" });
    const after = (await del.json()) as { documents: unknown[]; comparison: unknown };
    expect(after.documents).toHaveLength(0);
    expect(after.comparison).toBeNull();
  });
});
