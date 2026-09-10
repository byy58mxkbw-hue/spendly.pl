// Klient API GoPOS (read-only): OAuth token + raport sprzedaży per pozycja.
// Kontrakt potwierdzony na żywo — patrz pamięć „gopos-api-contract".
const TOKEN_URL = "https://app.gopos.io/oauth/token";
const API_BASE = "https://app.gopos.io/api/v3";
const ACCEPT = "application/json;charset=UTF-8";

export class GoposError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "GoposError";
  }
}

// Token OAuth2 (grant_type=organization). organizationId = LICZBA (np. "3130").
export async function getGoposToken(clientId: string, clientSecret: string, organizationId: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "organization",
    client_id: clientId,
    client_secret: clientSecret,
    organization_id: organizationId,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; error_description?: string; error?: string };
  if (!res.ok || !json.access_token) {
    throw new GoposError(res.status, json.error_description || json.error || `Błąd autoryzacji GoPOS (HTTP ${res.status}).`);
  }
  return json.access_token;
}

export type GoposSalesItem = { name: string; productId: string | null; qty: number; net: number };
export type GoposMonthlySales = { revenueNet: number; items: GoposSalesItem[] };

// amount z GoPOS bywa liczbą lub {amount, currency} — normalizacja.
function amount(v: unknown): number {
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && typeof (v as { amount?: unknown }).amount === "number") return (v as { amount: number }).amount;
  return 0;
}

// DIAGNOSTYKA (tymczasowa, do usunięcia po ustaleniu kontraktu) — pierwsza próba,
// groups=NONE,CATEGORY,PRODUCT, odrzucona przez GoPOS: group_not_exists_category.
// Więc dalej próbujemy innych nazw wymiaru grupowania + osobnych endpointów katalogu/menu,
// żeby znaleźć jak GoPOS udostępnia przypisanie pozycji do kategorii z zakładki „Konfiguracja Menu".
const GROUP_DIMENSION_CANDIDATES = ["GROUP", "PRODUCT_GROUP", "MENU_GROUP", "MENU_CATEGORY", "PRODUCT_CATEGORY", "CATEGORY_GROUP", "TAG"];
const CATALOG_ENDPOINT_CANDIDATES = ["/products", "/menus", "/menu", "/pos_groups", "/groups", "/categories", "/product_groups"];

async function probeOne(url: string, token: string): Promise<{ url: string; status: number; body: unknown }> {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: ACCEPT } });
    const text = await res.text();
    let body: unknown = text.slice(0, 500);
    try { body = JSON.parse(text); } catch { /* zostaw jako urwany tekst */ }
    // Dla sukcesu okrawamy duże odpowiedzi (sama struktura kluczy + parę pierwszych elementów
    // tablic wystarczy do rozpoznania kształtu), dla błędu zostawiamy całość (zwykle krótka).
    if (res.ok && body && typeof body === "object") body = trimForLog(body);
    return { url, status: res.status, body };
  } catch (err) {
    return { url, status: -1, body: String(err) };
  }
}

// Skraca duże odpowiedzi do logów: tablice → pierwsze 2 elementy + licznik, głębokość ograniczona.
function trimForLog(v: unknown, depth = 0): unknown {
  if (depth > 4) return "…";
  if (Array.isArray(v)) return { _count: v.length, _sample: v.slice(0, 2).map((x) => trimForLog(x, depth + 1)) };
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = trimForLog(val, depth + 1);
    return out;
  }
  return v;
}

export async function probeCategoryGrouping(token: string, organizationId: string, from: string, to: string): Promise<unknown> {
  const dr = `${from.replace("T", "'T'")},${to.replace("T", "'T'")}`;
  const groupAttempts = await Promise.all(
    GROUP_DIMENSION_CANDIDATES.map((dim) =>
      probeOne(`${API_BASE}/reports/order_items?organization_id=${organizationId}&groups=NONE,${dim},PRODUCT&date_range=${dr}`, token),
    ),
  );
  const catalogAttempts = await Promise.all(
    CATALOG_ENDPOINT_CANDIDATES.map((path) => probeOne(`${API_BASE}${path}?organization_id=${organizationId}`, token)),
  );
  return { groupAttempts, catalogAttempts };
}

// Sprzedaż w zakresie [from,to] (ISO 'YYYY-MM-DDTHH:mm:ss'): obrót netto + pozycje.
// Jedno wywołanie order_items z groups=NONE,PRODUCT daje sumę i rozbicie per pozycja.
export async function fetchSales(token: string, organizationId: string, from: string, to: string): Promise<GoposMonthlySales> {
  // Uwaga (dziwactwo GoPOS): filtr to `date_range` z LITERALNYMI apostrofami wokół T,
  // dokładnie jak w docsach: `2026-07-01'T'00:00:00,2026-07-31'T'23:59:59`. ISO bez
  // apostrofów albo `closed_at` zwracają pusto/500. Wartość idzie surowo (bez enkodowania).
  const dr = `${from.replace("T", "'T'")},${to.replace("T", "'T'")}`;
  const url = `${API_BASE}/reports/order_items?organization_id=${organizationId}&groups=NONE,PRODUCT&date_range=${dr}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: ACCEPT } });
  if (!res.ok) throw new GoposError(res.status, `GoPOS raport sprzedaży: HTTP ${res.status}.`);
  const json = (await res.json()) as {
    reports?: Array<{
      aggregate?: { sales?: { net_total_money?: unknown } };
      sub_report?: Array<{ group_by_value?: { name?: string; id?: string | number }; aggregate?: { sales?: { product_quantity?: number; net_total_money?: unknown } } }>;
    }>;
  };
  const rep = json.reports?.[0];
  const revenueNet = amount(rep?.aggregate?.sales?.net_total_money);
  const items: GoposSalesItem[] = (rep?.sub_report ?? [])
    .map((s) => ({
      name: (s.group_by_value?.name ?? "").trim(),
      productId: s.group_by_value?.id != null ? String(s.group_by_value.id) : null,
      qty: Number(s.aggregate?.sales?.product_quantity ?? 0),
      net: amount(s.aggregate?.sales?.net_total_money),
    }))
    .filter((i) => i.name);
  return { revenueNet, items };
}
