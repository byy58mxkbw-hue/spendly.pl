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
// - GET /{org}/menus?status=ENABLED&include=pages,pages.items → strony menu z
//   odwołaniami (context_type CATEGORY | ITEM_GROUP | ITEM, context_id).
// - GET /{org}/items?status=ENABLED&include=category,item_group&size=100&page=N
//   → produkty z ceną (`price.amount`, cena z karty = BRUTTO), kategorią i grupą.
// Grupa (item_group) to pozycja z wariantami (stopnie wysmażenia) — jedno danie.
// Typ MODIFIER (dodatki typu „extra ser") pomijamy — to nie są dania.
export type GoposMenuProduct = {
  id: string;
  name: string;
  price: number | null;
  category: string | null;
  groupId: string | null;
  groupName: string | null;
};

type GoposItemDto = {
  id?: number;
  name?: string;
  price?: unknown;
  status?: string;
  type?: string;
  category_id?: number;
  category?: { name?: string };
  item_group_id?: number;
  item_group?: { name?: string };
};
type GoposMenuDto = { pages?: Array<{ items?: Array<{ context_type?: string; context_id?: number }> }> };

async function getJson<T>(token: string, url: string, what: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: ACCEPT } });
  if (!res.ok) throw new GoposError(res.status, `GoPOS ${what}: HTTP ${res.status}.`);
  return (await res.json()) as T;
}

const MAX_PAGES = 50; // twardy bezpiecznik paginacji (50 × 100 pozycji)

export async function fetchCurrentMenu(token: string, organizationId: string): Promise<GoposMenuProduct[]> {
  const org = encodeURIComponent(organizationId);

  // 1) Co jest w aktywnych menu (kategorie / grupy / pojedyncze pozycje).
  const refs = { CATEGORY: new Set<number>(), ITEM_GROUP: new Set<number>(), ITEM: new Set<number>() };
  for (let page = 0; page < MAX_PAGES; page++) {
    const json = await getJson<{ data?: GoposMenuDto[] }>(
      token,
      `${API_BASE}/${org}/menus?status=ENABLED&include=pages,pages.items&size=50&page=${page}`,
      "menu",
    );
    const menus = json.data ?? [];
    for (const m of menus) for (const p of m.pages ?? []) for (const it of p.items ?? []) {
      const set = refs[it.context_type as keyof typeof refs];
      if (set && typeof it.context_id === "number") set.add(it.context_id);
    }
    if (menus.length < 50) break;
  }
  const hasMenuRefs = refs.CATEGORY.size + refs.ITEM_GROUP.size + refs.ITEM.size > 0;

  // 2) Aktywne produkty z ceną.
  const out: GoposMenuProduct[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const json = await getJson<{ data?: GoposItemDto[] }>(
      token,
      `${API_BASE}/${org}/items?status=ENABLED&include=category,item_group&size=100&page=${page}`,
      "pozycje menu",
    );
    const items = json.data ?? [];
    for (const it of items) {
      if (it.id == null || !it.name?.trim()) continue;
      if (it.status && it.status !== "ENABLED") continue;
      if (it.type === "MODIFIER") continue;
      // Tylko pozycje faktycznie podpięte pod aktywne menu. Gdy lokal nie ma
      // skonfigurowanych menu (brak odwołań), bierzemy wszystkie aktywne produkty.
      const inMenu =
        !hasMenuRefs ||
        refs.ITEM.has(it.id) ||
        (it.item_group_id != null && refs.ITEM_GROUP.has(it.item_group_id)) ||
        (it.category_id != null && refs.CATEGORY.has(it.category_id));
      if (!inMenu) continue;
      const price = amount(it.price);
      out.push({
        id: String(it.id),
        name: it.name.trim(),
        price: price > 0 ? price : null,
        category: it.category?.name?.trim() || null,
        groupId: it.item_group_id != null ? String(it.item_group_id) : null,
        groupName: it.item_group?.name?.trim() || null,
      });
    }
    if (items.length < 100) break;
  }
  return out;
}
