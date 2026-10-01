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

export type GoposSalesItem = { name: string; productId: string | null; category: string | null; qty: number; net: number };
export type GoposMonthlySales = { revenueNet: number; items: GoposSalesItem[] };

// amount z GoPOS bywa liczbą lub {amount, currency} — normalizacja.
function amount(v: unknown): number {
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && typeof (v as { amount?: unknown }).amount === "number") return (v as { amount: number }).amount;
  return 0;
}

type GoposProductNode = {
  group_by_value?: { name?: string; id?: string | number };
  aggregate?: { sales?: { product_quantity?: number; net_total_money?: unknown } };
};
type GoposCategoryNode = { group_by_value?: { name?: string }; sub_report?: GoposProductNode[] };

// Sprzedaż w zakresie [from,to] (ISO 'YYYY-MM-DDTHH:mm:ss'): obrót netto + pozycje,
// z kategorią menu z GoPOS (zakładka „Konfiguracja Menu" w panelu GoPOS).
// Kontrakt potwierdzony na żywo 2026-09-10 (org 3130): `groups=NONE,PRODUCT_CATEGORY,PRODUCT`
// zwraca DWUPOZIOMOWE zagnieżdżenie — `reports[0].sub_report[]` to kategorie
// (`group_by_type: "PRODUCT_CATEGORY"`), a ich WŁASNE `sub_report[]` to produkty w tej
// kategorii (`group_by_type: "PRODUCT"`). Same nazwy kategorii co w „Konfiguracja Menu"
// (DANIA GŁÓWNE, NAPOJE, LUNCH, Inne, ...). Próby innych nazw wymiaru (CATEGORY, GROUP,
// MENU_GROUP, MENU_CATEGORY, PRODUCT_GROUP, CATEGORY_GROUP, TAG) GoPOS odrzuca 422
// (`group_not_exists_*`) — PRODUCT_CATEGORY jest jedyną poprawną nazwą.
export async function fetchSales(token: string, organizationId: string, from: string, to: string): Promise<GoposMonthlySales> {
  // Uwaga (dziwactwo GoPOS): filtr to `date_range` z LITERALNYMI apostrofami wokół T,
  // dokładnie jak w docsach: `2026-07-01'T'00:00:00,2026-07-31'T'23:59:59`. ISO bez
  // apostrofów albo `closed_at` zwracają pusto/500. Wartość idzie surowo (bez enkodowania).
  const dr = `${from.replace("T", "'T'")},${to.replace("T", "'T'")}`;
  const url = `${API_BASE}/reports/order_items?organization_id=${organizationId}&groups=NONE,PRODUCT_CATEGORY,PRODUCT&date_range=${dr}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: ACCEPT } });
  if (!res.ok) throw new GoposError(res.status, `GoPOS raport sprzedaży: HTTP ${res.status}.`);
  const json = (await res.json()) as {
    reports?: Array<{ aggregate?: { sales?: { net_total_money?: unknown } }; sub_report?: GoposCategoryNode[] }>;
  };
  const rep = json.reports?.[0];
  const revenueNet = amount(rep?.aggregate?.sales?.net_total_money);
  const items: GoposSalesItem[] = (rep?.sub_report ?? [])
    .flatMap((cat) => {
      const category = (cat.group_by_value?.name ?? "").trim() || null;
      return (cat.sub_report ?? []).map((s) => ({
        name: (s.group_by_value?.name ?? "").trim(),
        productId: s.group_by_value?.id != null ? String(s.group_by_value.id) : null,
        category,
        qty: Number(s.aggregate?.sales?.product_quantity ?? 0),
        net: amount(s.aggregate?.sales?.net_total_money),
      }));
    })
    .filter((i) => i.name);
  return { revenueNet, items };
}

// ─── Aktualne menu (pozycje sprzedawane DZIŚ, nie historia sprzedaży) ─────────
// Kontrakt z publicznego spec GoPOS (`/v3/api-docs/Public API`):
// GET /{org}/items?status=ENABLED&include=category,item_group,price_overrides&size=100&page=N
// → produkty z ceną (`price.amount`, cena z karty = BRUTTO), kategorią i grupą.
//
// Celowo NIE filtrujemy po `/menus`: na realnym koncie (2026-10-01) filtr po
// odwołaniach z aktywnych menu zostawił tylko 7 pozycji z menu „SALA WESELNA" —
// główna karta restauracji nie była w nich widoczna. Aktywna (ENABLED) pozycja
// w GoPOS = pozycja, którą dziś da się sprzedać, czyli aktualne menu.
// Typu MODIFIER NIE pomijamy: na realnym koncie (2026-10-01) 591 z 598 aktywnych
// pozycji — w tym wszystkie dania z karty — miało type=MODIFIER, a PRODUCT tylko
// 7 usług „SALA WESELNA". Typ nie odróżnia więc dań od dodatków; zawężenie robi
// UI (domyślnie zaznaczone tylko pozycje ze sprzedażą).
export type GoposMenuProduct = {
  id: string;
  name: string;
  price: number | null;
  category: string | null;
  groupId: string | null;
  groupName: string | null;
};
export type GoposMenuStats = {
  fetched: number;
  enabled: number;
  /** Ile aktywnych pozycji ma type=MODIFIER (informacyjnie — nie są pomijane). */
  modifiers: number;
  withPrice: number;
  /**
   * Diagnostyka: pola pierwszej pozycji i surowa wartość jej ceny. Pozwala ustalić
   * na realnym koncie, gdzie GoPOS trzyma cenę (spec tego nie precyzuje).
   * Bez danych wrażliwych — to struktura karty menu, nie dane klientów.
   */
  sample: string | null;
};

type GoposItemDto = {
  id?: number;
  name?: string;
  price?: unknown;
  price_overrides?: Array<{ price?: unknown }>;
  status?: string;
  type?: string;
  category?: { name?: string };
  item_group_id?: number;
  item_group?: { name?: string };
};

// Cena bywa liczbą, {amount: number} albo {amount: "25.00"} — wszystko na liczbę.
function priceOf(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v.replace(",", ".")) || 0;
  if (v && typeof v === "object" && "amount" in v) return priceOf((v as { amount: unknown }).amount);
  return 0;
}

const MAX_PAGES = 50; // twardy bezpiecznik paginacji (50 × 100 pozycji)

export async function fetchCurrentMenu(
  token: string,
  organizationId: string,
): Promise<{ products: GoposMenuProduct[]; stats: GoposMenuStats }> {
  const org = encodeURIComponent(organizationId);
  const stats: GoposMenuStats = { fetched: 0, enabled: 0, modifiers: 0, withPrice: 0, sample: null };
  const products: GoposMenuProduct[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `${API_BASE}/${org}/items?status=ENABLED&include=category,item_group,price_overrides&size=100&page=${page}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: ACCEPT } });
    if (!res.ok) throw new GoposError(res.status, `GoPOS pozycje menu: HTTP ${res.status}.`);
    const items = ((await res.json()) as { data?: GoposItemDto[] }).data ?? [];
    stats.fetched += items.length;
    for (const it of items) {
      if (it.id == null || !it.name?.trim()) continue;
      if (it.status && it.status !== "ENABLED") continue;
      stats.enabled++;
      if (it.type === "MODIFIER") stats.modifiers++;
      if (stats.sample == null) {
        const raw = it as Record<string, unknown>;
        stats.sample = `pola: ${Object.keys(raw).join(", ")} | price: ${JSON.stringify(raw.price ?? null)} | price_overrides: ${JSON.stringify(raw.price_overrides ?? null)}`.slice(0, 400);
      }
      // Cena bazowa, a gdy jej brak — pierwsza dodatnia cena z nadpisań.
      let price = priceOf(it.price);
      if (!(price > 0)) price = (it.price_overrides ?? []).map((o) => priceOf(o.price)).find((v) => v > 0) ?? 0;
      if (price > 0) stats.withPrice++;
      products.push({
        id: String(it.id),
        name: it.name.trim(),
        price: price > 0 ? Math.round(price * 100) / 100 : null,
        category: it.category?.name?.trim() || null,
        groupId: it.item_group_id != null ? String(it.item_group_id) : null,
        groupName: it.item_group?.name?.trim() || null,
      });
    }
    if (items.length < 100) break;
  }
  return { products, stats };
}
