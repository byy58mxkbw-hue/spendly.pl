import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, eq } from "drizzle-orm";
import { db, invoicesTable, invoiceItemsTable, invoiceWzDocumentsTable } from "@workspace/db";
import { GetInvoiceWzParams, ScanInvoiceWzParams, ScanInvoiceWzBody, DeleteInvoiceWzParams } from "@workspace/api-zod";
import { extractWzNumbers } from "@workspace/ksef-xml";
import { requireOpenAI, aiObservabilityEnabled } from "@workspace/integrations-openai-ai-server";
import { compareWzWithInvoice, type WzLine } from "../lib/wz-compare";
import { toNum } from "../lib/parse";
import { captureServer } from "../lib/telemetry";

// Dokumenty WZ (wydanie zewnętrzne) przy fakturze: numery z XML KSeF, odczyt WZ ze
// zdjęcia/PDF (OCR, raz na dokument — reguła 14) i porównanie ilości z pozycjami faktury,
// żeby wyłapać towar zafakturowany, a niewydany. Wszystko w zakresie req.userId.

const router: IRouter = Router();

async function loadInvoice(userId: string, id: number) {
  const [inv] = await db
    .select({ id: invoicesTable.id, xmlContent: invoicesTable.xmlContent })
    .from(invoicesTable)
    .where(and(eq(invoicesTable.id, id), eq(invoicesTable.userId, userId)));
  return inv ?? null;
}

async function buildWz(userId: string, invoice: { id: number; xmlContent: string | null }) {
  const documents = await db
    .select()
    .from(invoiceWzDocumentsTable)
    .where(and(eq(invoiceWzDocumentsTable.invoiceId, invoice.id), eq(invoiceWzDocumentsTable.userId, userId)))
    .orderBy(asc(invoiceWzDocumentsTable.scannedAt));

  const fromXml = invoice.xmlContent ? extractWzNumbers(invoice.xmlContent) : [];
  const wzNumbers = [...fromXml];
  for (const d of documents) if (!wzNumbers.some((n) => n.toLowerCase() === d.wzNumber.toLowerCase())) wzNumbers.push(d.wzNumber);

  let comparison = null;
  if (documents.length > 0) {
    const items = await db
      .select({ productName: invoiceItemsTable.productName, quantity: invoiceItemsTable.quantity, unit: invoiceItemsTable.unit })
      .from(invoiceItemsTable)
      .where(eq(invoiceItemsTable.invoiceId, invoice.id));
    const wzLines: WzLine[] = documents.flatMap((d) => d.items);
    comparison = compareWzWithInvoice(
      items.map((i) => ({ productName: i.productName, quantity: toNum(i.quantity), unit: i.unit ?? "" })),
      wzLines,
    );
  }

  return {
    wzNumbers,
    documents: documents.map((d) => ({
      id: d.id,
      wzNumber: d.wzNumber,
      wzDate: d.wzDate,
      items: d.items,
      scannedAt: d.scannedAt.toISOString(),
    })),
    comparison,
  };
}

router.get("/invoices/:id/wz", async (req: Request, res: Response): Promise<void> => {
  const params = GetInvoiceWzParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Nieprawidłowe id faktury." });
    return;
  }
  const invoice = await loadInvoice(req.userId!, params.data.id);
  if (!invoice) {
    res.status(404).json({ error: "Nie znaleziono faktury." });
    return;
  }
  res.json(await buildWz(req.userId!, invoice));
});

const ALLOWED_MIME = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
const MAX_PAGE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 14 * 1024 * 1024;

router.post("/invoices/:id/wz/scan", async (req: Request, res: Response): Promise<void> => {
  const params = ScanInvoiceWzParams.safeParse(req.params);
  const body = ScanInvoiceWzBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Podaj numer WZ i co najmniej jedną stronę (zdjęcie)." });
    return;
  }
  const userId = req.userId!;
  const invoice = await loadInvoice(userId, params.data.id);
  if (!invoice) {
    res.status(404).json({ error: "Nie znaleziono faktury." });
    return;
  }

  const wzNumber = body.data.wzNumber.trim();
  let total = 0;
  const pages: Array<{ base64: string; mimeType: string }> = [];
  for (const pg of body.data.pages) {
    if (!ALLOWED_MIME.includes(pg.mimeType)) {
      res.status(400).json({ error: "Nieobsługiwany format obrazu. Użyj JPEG, PNG, WebP lub GIF." });
      return;
    }
    const b64 = pg.imageBase64.includes(",") ? pg.imageBase64.split(",").pop()! : pg.imageBase64;
    const bytes = Math.floor((b64.length * 3) / 4);
    if (bytes > MAX_PAGE_BYTES) {
      res.status(400).json({ error: "Strona jest za duża (max 10 MB)." });
      return;
    }
    total += bytes;
    pages.push({ base64: b64, mimeType: pg.mimeType });
  }
  if (total > MAX_TOTAL_BYTES) {
    res.status(400).json({ error: "Strony są łącznie za duże (max 14 MB)." });
    return;
  }

  const prompt = `${pages.length > 1 ? `The ${pages.length} images are consecutive PAGES of ONE document, in order. Combine line items from all pages; skip repeated headers and totals.\n\n` : ""}This is a Polish warehouse dispatch note "WZ" (wydanie zewnętrzne) from a food supplier. Extract the delivered goods as JSON.

Return ONLY a JSON object:
{
  "wzNumber": "string or null — document number as printed",
  "wzDate": "string or null — issue date YYYY-MM-DD",
  "items": [ { "productName": "exact product name", "quantity": number, "unit": "unit as printed (kg, szt, opak, l…)" } ]
}

Rules:
- quantity is the DELIVERED/issued quantity (column "ilość", "wydano"); ignore ordered quantities if a separate column exists
- quantity must be a number (2.5, not "2,5")
- skip total/summary rows, signatures, prices
- return an empty items array if no goods are visible`;

  try {
    const response = await requireOpenAI().chat.completions.create({
      model: "gpt-4.1",
      messages: [
        {
          role: "user",
          content: [
            ...pages.map((pg) => ({ type: "image_url" as const, image_url: { url: `data:${pg.mimeType};base64,${pg.base64}`, detail: "high" as const } })),
            { type: "text" as const, text: prompt },
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: Math.min(8000, 2000 + 1500 * (pages.length - 1)),
      temperature: 0,
      ...(aiObservabilityEnabled ? { posthogDistinctId: userId } : {}),
    });
    let extracted: { wzDate?: string | null; items?: Array<{ productName?: unknown; quantity?: unknown; unit?: unknown }> } = {};
    try {
      extracted = JSON.parse(response.choices[0]?.message?.content ?? "{}");
    } catch {
      extracted = {};
    }
    const items = (Array.isArray(extracted.items) ? extracted.items : [])
      .map((i) => ({
        productName: String(i.productName ?? "").trim().slice(0, 300),
        quantity: Number(typeof i.quantity === "string" ? i.quantity.replace(",", ".") : i.quantity),
        unit: String(i.unit ?? "").trim().slice(0, 20),
      }))
      .filter((i) => i.productName && Number.isFinite(i.quantity))
      .slice(0, 500);
    if (items.length === 0) {
      res.status(422).json({ error: "Nie udało się odczytać pozycji z WZ. Zrób wyraźniejsze zdjęcie całej tabeli i spróbuj ponownie." });
      return;
    }
    const wzDate = typeof extracted.wzDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(extracted.wzDate) ? extracted.wzDate : null;

    await db
      .insert(invoiceWzDocumentsTable)
      .values({ userId, invoiceId: invoice.id, wzNumber, wzDate, items, pageCount: pages.length })
      .onConflictDoUpdate({
        target: [invoiceWzDocumentsTable.invoiceId, invoiceWzDocumentsTable.wzNumber],
        set: { items, wzDate, pageCount: pages.length, scannedAt: new Date() },
      });
    captureServer(userId, "wz_scanned", { pages: pages.length, items: items.length });
    res.json(await buildWz(userId, invoice));
  } catch (err) {
    req.log.error({ err }, "wz-scan: OpenAI Vision error");
    res.status(500).json({ error: "Nie udało się odczytać WZ. Sprawdź jakość zdjęcia i spróbuj ponownie." });
  }
});

router.delete("/invoices/:id/wz/:wzId", async (req: Request, res: Response): Promise<void> => {
  const params = DeleteInvoiceWzParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Nieprawidłowe parametry." });
    return;
  }
  const userId = req.userId!;
  const invoice = await loadInvoice(userId, params.data.id);
  if (!invoice) {
    res.status(404).json({ error: "Nie znaleziono faktury." });
    return;
  }
  await db
    .delete(invoiceWzDocumentsTable)
    .where(and(
      eq(invoiceWzDocumentsTable.id, params.data.wzId),
      eq(invoiceWzDocumentsTable.invoiceId, invoice.id),
      eq(invoiceWzDocumentsTable.userId, userId),
    ));
  res.json(await buildWz(userId, invoice));
});

export default router;
