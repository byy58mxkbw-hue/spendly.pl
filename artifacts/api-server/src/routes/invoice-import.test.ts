import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { and, eq, inArray } from "drizzle-orm";
import { db, suppliersTable, invoicesTable, productsTable } from "@workspace/db";

// Krytyczne ścieżki POST /api/invoices/import NIE pokryte przez invoice-dedup.test.ts:
// route-level guard XXE (400), import z XML (parser→route→DB + tworzenie produktów),
// faktura korygująca KOR (link do parenta), limit pozycji, izolacja tenantów (cudzy dostawca → 404).
// DB-gated: tylko z TEST_DATABASE_URL (CI).
const RUN_DB = !!process.env.TEST_DATABASE_URL;

const authState = vi.hoisted(() => ({ userId: "test_imp_R" }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAuth: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: authState.userId, sessionClaims: { publicMetadata: {} } }),
  clerkClient: { users: { getUser: async () => ({ emailAddresses: [], primaryEmailAddressId: null }) } },
}));

const IMP_R = "test_imp_R";
const IMP_OTHER = "test_imp_OTHER";

// Minimalny FA(3) z jedną pozycją (bez DOCTYPE/ENTITY).
const FA3 = (num: string, extraHeader = "") => `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/">
  <Fa>
    <P_1>2026-07-10</P_1>
    <P_2>${num}</P_2>
    <P_13_1>100.00</P_13_1>
    <P_15>123.00</P_15>
    <RodzajFaktury>VAT</RodzajFaktury>${extraHeader}
    <FaWiersz>
      <P_7>Mleko 3.2% import-test</P_7>
      <P_8A>l</P_8A>
      <P_8B>10</P_8B>
      <P_9A>10.00</P_9A>
      <P_11>100.00</P_11>
      <P_12>23</P_12>
    </FaWiersz>
  </Fa>
</Faktura>`;

describe.skipIf(!RUN_DB)("POST /api/invoices/import — ścieżki krytyczne", () => {
  let server: Server;
  let baseUrl: string;
  let supplierId: number;
  let otherSupplierId: number;

  const postImport = (body: Record<string, unknown>, asUser = IMP_R) => {
    authState.userId = asUser;
    return fetch(`${baseUrl}/api/invoices/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  };

  beforeAll(async () => {
    const app = (await import("../app")).default;
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    await db.delete(invoicesTable).where(inArray(invoicesTable.userId, [IMP_R, IMP_OTHER]));
    await db.delete(productsTable).where(inArray(productsTable.userId, [IMP_R, IMP_OTHER]));
    await db.delete(suppliersTable).where(inArray(suppliersTable.userId, [IMP_R, IMP_OTHER]));

    const [sup] = await db.insert(suppliersTable)
      .values({ userId: IMP_R, name: "Dostawca-import", taxId: "1112223334" })
      .returning({ id: suppliersTable.id });
    supplierId = sup.id;
    const [supO] = await db.insert(suppliersTable)
      .values({ userId: IMP_OTHER, name: "Dostawca-obcy", taxId: "9998887776" })
      .returning({ id: suppliersTable.id });
    otherSupplierId = supO.id;
  });

  afterAll(async () => {
    await db.delete(invoicesTable).where(inArray(invoicesTable.userId, [IMP_R, IMP_OTHER]));
    await db.delete(productsTable).where(inArray(productsTable.userId, [IMP_R, IMP_OTHER]));
    await db.delete(suppliersTable).where(inArray(suppliersTable.userId, [IMP_R, IMP_OTHER]));
    server?.close();
  });

  it("guard XXE: xmlContent z <!DOCTYPE> → 400 (route, nie parser)", async () => {
    const res = await postImport({
      supplierId,
      invoiceDate: "2026-07-01", // wymagane przez schemat — by dojść do guardu XXE, nie 400 z walidacji
      xmlContent: `<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY x "y">]><Faktura></Faktura>`,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/DOCTYPE\/ENTITY/i);
  });

  it("import z XML: parsuje pozycje, tworzy fakturę i produkt (201)", async () => {
    // invoiceDate: "" → route wyprowadza datę z XML (P_1); numer też z XML (P_2).
    const res = await postImport({ supplierId, invoiceDate: "", xmlContent: FA3("FV/IMP/XML/1") });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      id: number; invoiceNumber: string; invoiceDate: string;
      items: Array<{ productName: string; productId: number | null; quantity: number; vatRate: number | null }>;
    };
    expect(body.invoiceNumber).toBe("FV/IMP/XML/1");
    expect(body.invoiceDate).toBe("2026-07-10");
    expect(body.items).toHaveLength(1);
    expect(body.items[0].productName).toBe("Mleko 3.2% import-test");
    expect(body.items[0].productId).toBeTypeOf("number");
    expect(body.items[0].quantity).toBeCloseTo(10, 4);
    expect(body.items[0].vatRate).toBe(23);

    // Produkt faktycznie powstał u tego usera.
    const prods = await db.select({ id: productsTable.id }).from(productsTable)
      .where(and(eq(productsTable.userId, IMP_R), eq(productsTable.name, "Mleko 3.2% import-test")));
    expect(prods).toHaveLength(1);
  });

  it("faktura korygująca (KOR) linkuje parenta i zapisuje typ/numer korygowany", async () => {
    // Parent (zwykła faktura) — import ręczny.
    const parentRes = await postImport({
      supplierId,
      invoiceNumber: "FV/IMP/PARENT/1",
      invoiceDate: "2026-07-01",
      items: [{ productName: "Ser import-test", quantity: 1, unit: "kg", unitPrice: 20, totalPrice: 20 }],
    });
    expect(parentRes.status).toBe(201);
    const parent = (await parentRes.json()) as { id: number };

    // KOR wskazująca parenta przez <NrFaKorygowanej>.
    const korXml = FA3("KOR/IMP/1", `<NrFaKorygowanej>FV/IMP/PARENT/1</NrFaKorygowanej>`)
      .replace("<RodzajFaktury>VAT</RodzajFaktury>", "<RodzajFaktury>KOR</RodzajFaktury>")
      .replace("<P_13_1>100.00</P_13_1>", "<P_13_1>-100.00</P_13_1>")
      .replace("<P_15>123.00</P_15>", "<P_15>-123.00</P_15>");
    const res = await postImport({ supplierId, invoiceDate: "", xmlContent: korXml });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      invoiceType: string | null; correctedInvoiceNumber: string | null; parentInvoiceId: number | null;
      items: Array<{ quantity: number; totalPrice: number }>;
    };
    expect(body.invoiceType).toBe("KOR");
    expect(body.correctedInvoiceNumber).toBe("FV/IMP/PARENT/1");
    expect(body.parentInvoiceId).toBe(parent.id);
    // Ujemny nagłówek KOR → odwrócone znaki pozycji.
    expect(body.items[0].quantity).toBeLessThan(0);
    expect(body.items[0].totalPrice).toBeLessThan(0);
  });

  it("import z podglądu bez supplierId: dostawca tworzony z NIP-u sprzedawcy, source=viewer, ponowny import → 409", async () => {
    const seller = (nip: string, name: string) =>
      `<Podmiot1><DaneIdentyfikacyjne><NIP>${nip}</NIP><Nazwa>${name}</Nazwa></DaneIdentyfikacyjne></Podmiot1>`;
    const xml = FA3("FV/PODGLAD/1").replace("<Fa>", `${seller("555-666-77-78", "Zielony Rynek test")}<Fa>`);

    const res = await postImport({ xmlContent: xml, invoiceDate: "2026-07-10", source: "viewer" });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: number; supplierName: string };
    expect(body.supplierName).toBe("Zielony Rynek test");

    const [inv] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, body.id));
    expect(inv.source).toBe("viewer");
    const created = await db.select().from(suppliersTable)
      .where(and(eq(suppliersTable.userId, IMP_R), eq(suppliersTable.taxId, "5556667778")));
    expect(created).toHaveLength(1);

    // Ta sama faktura drugi raz: duplikat (409 z existingInvoiceId), bez drugiego dostawcy.
    const again = await postImport({ xmlContent: xml, invoiceDate: "2026-07-10", source: "viewer" });
    expect(again.status).toBe(409);
    expect(((await again.json()) as { existingInvoiceId: number }).existingInvoiceId).toBe(body.id);
    const stillOne = await db.select().from(suppliersTable)
      .where(and(eq(suppliersTable.userId, IMP_R), eq(suppliersTable.taxId, "5556667778")));
    expect(stillOne).toHaveLength(1);
  });

  it("GET /invoices/:id/xml: właściciel dostaje odszyfrowany XML, inne konto 404", async () => {
    const xml = FA3("FV/XML/1");
    const res = await postImport({ supplierId, xmlContent: xml, invoiceDate: "2026-07-11", force: true });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: number };

    authState.userId = IMP_R;
    const own = await fetch(`${baseUrl}/api/invoices/${id}/xml`);
    expect(own.status).toBe(200);
    expect(((await own.json()) as { xml: string }).xml).toBe(xml);

    authState.userId = IMP_OTHER;
    const foreign = await fetch(`${baseUrl}/api/invoices/${id}/xml`);
    expect(foreign.status).toBe(404);
  });

  it("import bez supplierId: istniejący dostawca dopasowany po NIP (z myślnikami w bazie bez)", async () => {
    const xml = FA3("FV/PODGLAD/2").replace(
      "<Fa>",
      `<Podmiot1><DaneIdentyfikacyjne><NIP>111-222-33-34</NIP><Nazwa>Inna nazwa</Nazwa></DaneIdentyfikacyjne></Podmiot1><Fa>`,
    );
    const res = await postImport({ xmlContent: xml, invoiceDate: "2026-07-10", force: true });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { supplierId: number };
    expect(body.supplierId).toBe(supplierId);
  });

  it("import bez supplierId i bez XML → 400", async () => {
    const res = await postImport({ invoiceDate: "2026-07-10", items: [{ productName: "x", quantity: 1, unit: "szt", unitPrice: 1, totalPrice: 1 }] });
    expect(res.status).toBe(400);
  });

  it("limit pozycji: > 200 → 400", async () => {
    const items = Array.from({ length: 201 }, (_, i) => ({
      productName: `Prod ${i}`, quantity: 1, unit: "szt", unitPrice: 1, totalPrice: 1,
    }));
    const res = await postImport({ supplierId, invoiceNumber: "FV/IMP/BIG/1", invoiceDate: "2026-07-01", items });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/zbyt wiele pozycji/i);
  });

  it("izolacja tenantów: import na cudzego dostawcę → 404", async () => {
    const res = await postImport({
      supplierId: otherSupplierId, // należy do IMP_OTHER
      invoiceNumber: "FV/IMP/HACK/1",
      invoiceDate: "2026-07-01",
      items: [{ productName: "Cokolwiek", quantity: 1, unit: "szt", unitPrice: 1, totalPrice: 1 }],
    }, IMP_R);
    expect(res.status).toBe(404);
  });
});
