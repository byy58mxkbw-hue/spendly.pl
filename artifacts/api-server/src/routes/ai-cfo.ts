import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import type {
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
} from "openai/resources/chat/completions";
import { requireOpenAI, aiObservabilityEnabled } from "@workspace/integrations-openai-ai-server";
import { PostAiCfoChatBody } from "@workspace/api-zod";
import { AI_MONTHLY_LIMIT, normalizePlan, currentPeriod } from "../lib/ai-plan.js";
import { captureServer } from "../lib/telemetry.js";
import { AI_CFO_TOOL_SCHEMAS, executeToolCall, toolSpendSummary } from "../lib/ai-cfo-tools.js";

const router: IRouter = Router();

// Zużycie AI bieżącego użytkownika w tym miesiącu (wspólna pula: czat + OCR).
// Do wyświetlenia licznika „X / Y" w UI. Sam endpoint nie jest limitowany.
router.get("/ai-cfo/usage", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const plan = normalizePlan(req.plan);
  const limit = AI_MONTHLY_LIMIT[plan];
  const period = currentPeriod();
  const r = await db.execute(
    sql`SELECT count FROM ai_usage WHERE user_id = ${userId} AND period = ${period}`,
  );
  const used = Number((r.rows[0] as { count: number } | undefined)?.count ?? 0);
  res.json({
    plan,
    used,
    limit,
    remaining: limit == null ? null : Math.max(0, limit - used),
    period,
  });
});

// ─── Entity enrichment for chat actions ──────────────────────────────────────

type RawAction = { label: string; href: string };
type EnrichedAction = { label: string; href: string; productId?: number; supplierId?: number };

async function enrichActions(
  actions: RawAction[],
  fullText: string,
  userId: string,
): Promise<EnrichedAction[]> {
  if (!actions.length) return [];

  const [productsRes, suppliersRes] = await Promise.allSettled([
    db.execute(sql`
      SELECT id, name FROM products WHERE user_id = ${userId} ORDER BY length(name) DESC
    `),
    db.execute(sql`
      SELECT id, name FROM suppliers WHERE user_id = ${userId} AND is_active = true ORDER BY length(name) DESC
    `),
  ]);

  const products = productsRes.status === "fulfilled"
    ? (productsRes.value.rows as Array<{ id: number; name: string }>)
    : [];
  const suppliers = suppliersRes.status === "fulfilled"
    ? (suppliersRes.value.rows as Array<{ id: number; name: string }>)
    : [];

  const lowerText = fullText.toLowerCase();

  function findProduct(): number | undefined {
    for (const p of products) {
      if (lowerText.includes(p.name.toLowerCase())) return p.id;
    }
    return undefined;
  }

  function findSupplier(): number | undefined {
    for (const s of suppliers) {
      if (lowerText.includes(s.name.toLowerCase())) return s.id;
    }
    return undefined;
  }

  let cachedProductId: number | undefined | null = null;
  let cachedSupplierId: number | undefined | null = null;

  function getProductId() {
    if (cachedProductId === null) cachedProductId = findProduct() ?? undefined;
    return cachedProductId;
  }

  function getSupplierId() {
    if (cachedSupplierId === null) cachedSupplierId = findSupplier() ?? undefined;
    return cachedSupplierId;
  }

  return actions.map((action): EnrichedAction => {
    const href = action.href;

    const productIdInHref = href.match(/^\/products\?id=(\d+)/);
    if (productIdInHref) {
      const pid = parseInt(productIdInHref[1], 10);
      const valid = products.some((p) => p.id === pid);
      return valid ? { ...action, productId: pid } : { ...action, href: "/products" };
    }

    const supplierIdInHref = href.match(/^\/suppliers\/(\d+)$/);
    if (supplierIdInHref) {
      const sid = parseInt(supplierIdInHref[1], 10);
      const valid = suppliers.some((s) => s.id === sid);
      return valid ? { ...action, supplierId: sid } : { ...action, href: "/suppliers" };
    }

    if (href === "/products") {
      const pid = getProductId();
      if (pid) return { ...action, href: `/products?id=${pid}`, productId: pid };
    }

    if (href === "/suppliers") {
      const sid = getSupplierId();
      if (sid) return { ...action, href: `/suppliers/${sid}`, supplierId: sid };
    }

    return action;
  });
}

// ─── Route: POST /ai-cfo/chat ─────────────────────────────────────────────────
// Function calling: model dostaje startowy kontekst (get_spend_summary, ostatnie
// 90 dni) + listę narzędzi i SAM decyduje, po jakie dane sięgnąć oraz z jakimi
// argumentami biznesowymi (nazwa produktu, ID, zakres dat) — nigdy nie zna i nie
// kontroluje userId (patrz lib/ai-cfo-tools.ts, wstrzykiwane z req.userId, zawsze
// po stronie serwera). Zastępuje stary routing po słowach-kluczach
// (lib/ai-cfo-intent.ts — zostaje jako martwy kod z osobnym evalem w scripts/,
// do usunięcia w kroku porządkowym po potwierdzeniu, że ta wersja działa dobrze).

const MAX_TOOL_ROUNDS = 4;

function isFunctionToolCall(tc: ChatCompletionMessageToolCall): tc is ChatCompletionMessageFunctionToolCall {
  return tc.type === "function";
}

function buildSystemPrompt(baseSummaryJson: string): string {
  return `Jesteś AI CFO (Chief Financial Officer) dla restauracji w Polsce. Analizujesz dane kosztowe z faktur i dostarczasz precyzyjne rekomendacje finansowe.

KONTEKST STARTOWY — podsumowanie wydatków za ostatnie 90 dni (JSON, dostawcy/produkty/miesiące/kategorie/centra kosztów). Jeśli to wystarcza do odpowiedzi — użyj tego, nie wywołuj narzędzi:
${baseSummaryJson}

DOSTĘPNE NARZĘDZIA (wywołuj je, gdy kontekst startowy nie ma potrzebnych danych):
- search_products / search_suppliers — znajdź ID produktu/dostawcy po nazwie (zawsze pierwszy krok, gdy pytanie dotyczy KONKRETNEGO produktu/dostawcy).
- get_product_price_history — historia ceny jednego produktu w czasie.
- get_cheapest_supplier_for_product — porównanie dostawców dla jednego produktu (kto ma najniższą cenę).
- get_supplier_price_changes — zmiana cen w rozbiciu na dostawcę (kto podrożał/staniał), stały koszyk.
- get_price_increases — globalnie największe podwyżki cen (bez wskazanego produktu).
- get_price_alerts — aktywne alerty cenowe.
- get_dish_margins — marże dań (Food cost).
- search_invoices — wyszukaj faktury po dostawcy/numerze/zakresie dat.
- get_invoice_detail — pozycje jednej faktury (potrzebuje invoice_id z search_invoices).
- compare_invoices — porównanie dwóch faktur pozycja po pozycji (potrzebuje dwóch invoice_id).
- get_spend_summary — to samo co kontekst startowy, ale z INNYM zakresem dat (date_from/date_to) — użyj, gdy pytanie dotyczy okresu innego niż ostatnie 90 dni.

Możesz wywołać kilka narzędzi po sobie (np. najpierw search_products, potem get_product_price_history z jego ID). Masz limit ${MAX_TOOL_ROUNDS} rund wywołań — jeśli go wyczerpiesz, odpowiedz na podstawie tego, co już masz.

ZASADA NADRZĘDNA (anty-fabrykacja):
Używaj WYŁĄCZNIE liczb, faktur i pozycji zwróconych przez kontekst startowy lub narzędzia. NIGDY nie wymyślaj faktur, cen, ID ani pozycji. Gdy dane z narzędzi mówią "brak"/"message" o pustym wyniku — napisz to wprost. Gdy nie masz danych do odpowiedzi na pytanie (i narzędzia też ich nie dały) — type: "general" i napisz krótko, czego brakuje.

ZASADA "summary" — NIGDY nie zostawiaj pustego ani samym słowem typu ("general" itp.) — zawsze pełne zdanie po polsku odpowiadające na pytanie, nawet gdy to tylko "Nie mam wystarczających danych, żeby to policzyć — spróbuj X".

DWUZNACZNOŚĆ NAZW: gdy search_products/search_suppliers zwróci KILKA różnych pasujących encji (np. dwie różne spółki z podobną nazwą) i z pytania nie wynika jednoznacznie, o którą chodzi — nie zgaduj cicho i nie podmieniaj jej w locie na inną. Zapytaj wprost w summary, którą encję miał na myśli użytkownik (type: "general", wymień obie nazwy z ID).

INSTRUKCJA ODPOWIEDZI (TYLKO w ostatniej wiadomości, gdy nie wywołujesz już żadnego narzędzia):
Odpowiadaj ZAWSZE jako JSON (bez markdown, bez tekstu poza JSON):
{
  "type": "product_analysis|supplier_comparison|cost_analysis|quantity_anomaly|category_analysis|invoice_comparison|general",
  "summary": "Główny wniosek w 2-3 zdaniach z konkretnymi liczbami PLN i/lub jednostkami.",
  "kpiCards": [
    {"label": "Nazwa KPI", "value": "np. 4 280 zł", "delta": "np. +12%", "deltaPositive": true}
  ],
  "table": {
    "headers": ["Kolumna 1", "Kolumna 2", "Kolumna 3"],
    "rows": [["Wiersz 1 kol 1", "Wiersz 1 kol 2", "Wiersz 1 kol 3"]]
  },
  "recommendation": "Konkretna rekomendacja działania z szacowanym efektem PLN.",
  "actions": [
    {"label": "Etykieta przycisku", "href": "/products"}
  ]
}

ZASADY TABEL wg typu danych, którymi odpowiadasz:
- Porównanie dostawców (get_supplier_price_changes / spend_summary.supplierComparison): "Dostawca", "Wydatki (PLN)"/"Wolumen", "Faktury"/"Produkty", ...
- get_cheapest_supplier_for_product: "Dostawca", "Śr. cena jedn.", "Min", "Zakupy", "Ostatni zakup"
- get_product_price_history: "Data", "Faktura", "Dostawca", "Cena jedn.", "Zmiana %" (zmiana liczona względem poprzedniego, starszego wiersza)
- get_price_increases: "Produkt", "Poprzednia", "Ostatnia", "Zmiana %"
- get_price_alerts: "Produkt", "Dostawca", "Poprzednia", "Aktualna", "Zmiana %", "Próg"
- get_dish_margins: "Danie", "Cena", "Koszt porcji", "Marża %", "Pewność"
- compare_invoices / get_invoice_detail: pozycja po pozycji — "Produkt", "Ilość A", "Cena jedn. A", "Ilość B", "Cena jedn. B", "Zmiana ceny" (dla jednej faktury pomiń kolumny B); zawsze pokazuj WSZYSTKIE pozycje, nie streszczaj do sum
- Kategorie (spend_summary.categories): "Kategoria", "Wydatki (PLN)", "Wolumen (j.)", "Produkty"
Zawsze pokazuj WSZYSTKIE wiersze zwrócone przez narzędzie/kontekst dla danego pytania — bez wymyślania dodatkowych, bez ucinania bez potrzeby.

WAŻNE — zasady tworzenia href w actions:
- Konkretny produkt (znasz jego id): "/products?id=X"
- Konkretny dostawca (znasz jego id): "/suppliers/X"
- Lista produktów: "/products", lista dostawców: "/suppliers", faktury: "/invoices", raporty: "/reports", alerty: "/price-alerts", food cost: "/food-cost"
Tabela i kpiCards mogą mieć null jeśli nieistotne dla pytania, ale recommendation zawsze musi być.
Odpowiadaj wyłącznie po polsku.`;
}

router.post("/ai-cfo/chat", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const parsedBody = PostAiCfoChatBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: "Nieprawidłowe dane zapytania." });
    return;
  }
  const { question, history = [] } = parsedBody.data;

  if (question.trim().length === 0) {
    res.status(400).json({ error: "Brakuje pytania." });
    return;
  }

  const baseSummary = await toolSpendSummary(userId, {});
  const systemPrompt = buildSystemPrompt(JSON.stringify(baseSummary));

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history.slice(-6).map((h) => ({
      role: h.role as "user" | "assistant",
      content: String(h.content).slice(0, 1000),
    })),
    { role: "user", content: question.trim().slice(0, 500) },
  ];

  // Wywołanie AI w try/catch — brak klucza OpenAI lub błąd API ma dawać czytelny
  // komunikat 503 zamiast generycznego 500 z globalnego handlera. Pętla: model
  // może poprosić o narzędzia do MAX_TOOL_ROUNDS-1 razy; ostatnia runda ma tools
  // wyłączone, żeby model MUSIAŁ odpowiedzieć finalnym JSON-em (twardy limit,
  // żeby pętla nie mogła wisieć w nieskończoność).
  let raw = "";
  try {
    const client = requireOpenAI();
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const includeTools = round < MAX_TOOL_ROUNDS - 1;
      const resp = await client.chat.completions.create({
        model: "gpt-4o-mini",
        max_completion_tokens: 4000,
        messages,
        ...(includeTools ? { tools: AI_CFO_TOOL_SCHEMAS } : {}),
        // Wymuszony JSON — sam prompt ("Odpowiadaj ZAWSZE jako JSON") nie wystarczał:
        // po kilku rundach tool-callingu model potrafił zjechać na markdown/prozę
        // (realny raport użytkownika 2026-09-25, tabele w ### nagłówkach zamiast
        // pola "table"). response_format działa razem z tool calling — nie
        // przeszkadza modelowi wywoływać narzędzi, tylko wymusza poprawny JSON,
        // gdy odpowiada treścią.
        response_format: { type: "json_object" },
        // PostHog AI Observability (metadane, patrz integrations-openai-ai-server/client.ts).
        ...(aiObservabilityEnabled ? { posthogDistinctId: userId } : {}),
      });
      const msg = resp.choices[0]?.message;
      const toolCalls = (msg?.tool_calls ?? []).filter(isFunctionToolCall);

      if (toolCalls.length === 0) {
        raw = (msg?.content ?? "").trim();
        break;
      }

      messages.push({ role: "assistant", content: msg?.content ?? null, tool_calls: toolCalls });
      const toolMessages = await Promise.all(
        toolCalls.map(async (call) => {
          let parsedArgs: unknown = {};
          try {
            parsedArgs = JSON.parse(call.function.arguments || "{}");
          } catch {
            // Model wysłał niepoprawny JSON w argumentach — executeToolCall dostanie {}
            // i sam narzędziowy handler zwróci czytelny błąd walidacji do modelu.
          }
          const content = await executeToolCall(call.function.name, parsedArgs, userId);
          return { role: "tool" as const, tool_call_id: call.id, content };
        }),
      );
      messages.push(...toolMessages);
    }
  } catch (err) {
    const notConfigured = err instanceof Error && err.message.includes("brak konfiguracji OpenAI");
    req.log.error({ err: String(err), notConfigured }, "ai-cfo chat OpenAI call failed");
    res.status(503).json({
      error: notConfigured
        ? "Asystent AI nie jest skonfigurowany na serwerze (brak klucza OpenAI)."
        : "Asystent AI jest chwilowo niedostępny. Spróbuj ponownie za chwilę.",
    });
    return;
  }

  req.log.info({ rawLen: raw.length }, "ai-cfo chat response");

  let parsed: Record<string, unknown>;
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    req.log.warn({ raw: raw.slice(0, 300) }, "ai-cfo chat JSON parse failed");
    parsed = {
      type: "general",
      summary: raw.slice(0, 500) || "Nie udało się dokończyć analizy w limicie prób. Spróbuj zadać bardziej precyzyjne pytanie (np. z nazwą konkretnego produktu lub dostawcy).",
      kpiCards: [],
      table: null,
      recommendation: "",
      actions: [],
    };
  }

  // Server-side enrichment: resolve product/supplier IDs in actions deterministically
  if (Array.isArray(parsed.actions) && parsed.actions.length > 0) {
    const summary = typeof parsed.summary === "string" ? parsed.summary : "";
    const recommendation = typeof parsed.recommendation === "string" ? parsed.recommendation : "";
    const fullText = `${question} ${summary} ${recommendation}`;
    try {
      parsed.actions = await enrichActions(
        parsed.actions as RawAction[],
        fullText,
        userId,
      );
    } catch (err) {
      req.log.warn({ err }, "ai-cfo enrichActions failed, using raw actions");
    }
  }

  captureServer(userId, "ai_chat_message");

  res.json(parsed);
});

export default router;
