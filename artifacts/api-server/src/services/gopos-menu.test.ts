import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchCurrentMenu } from "./gopos-client";
import { buildGoposMenuList } from "../routes/food-cost";

// Aktualne menu GoPOS → lista dań do importu w Food Cost. Bez sieci i bazy:
// fetch jest podstawiony odpowiedziami w kształcie z publicznego spec GoPOS.

afterEach(() => vi.unstubAllGlobals());

function stubItems(pages: unknown[][]) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    calls.push(url);
    const page = Number(new URL(url).searchParams.get("page") ?? 0);
    return new Response(JSON.stringify({ data: pages[page] ?? [] }), { status: 200 });
  }));
  return calls;
}

const item = (id: number, name: string, extra: Record<string, unknown> = {}) => ({
  id, name, status: "ENABLED", type: "PRODUCT", price: { amount: 30, currency: "PLN" }, ...extra,
});

describe("fetchCurrentMenu", () => {
  it("bierze wszystkie aktywne pozycje, także typu MODIFIER (tak GoPOS oznacza dania)", async () => {
    const calls = stubItems([[
      item(10, "Żurek", { category: { name: "ZUPY" } }),
      item(11, "Extra ser", { type: "MODIFIER" }),
      item(12, "Wyłączone", { status: "DISABLED" }),
      item(50, "Organizacja wesela", { category: { name: "SALA WESELNA" } }),
    ]]);
    const { products, stats } = await fetchCurrentMenu("t", "3130");
    expect(products.map((m) => m.name).sort()).toEqual(["Extra ser", "Organizacja wesela", "Żurek"]);
    expect(products.find((m) => m.name === "Żurek")).toMatchObject({ price: 30, category: "ZUPY" });
    expect(stats).toMatchObject({ fetched: 4, enabled: 3, modifiers: 1, withPrice: 3 });
    expect(stats.sample).toContain("price");
    expect(calls.every((c) => c.includes("/items?") && c.includes("status=ENABLED"))).toBe(true);
  });

  it("czyta cenę jako tekst i z nadpisań, gdy brak ceny bazowej", async () => {
    stubItems([[
      item(1, "A", { price: { amount: "25,50" } }),
      item(2, "B", { price: null, price_overrides: [{ price: { amount: 0 } }, { price: { amount: 19 } }] }),
      item(3, "C", { price: { amount: 0 } }),
    ]]);
    const { products } = await fetchCurrentMenu("t", "3130");
    expect(products.map((m) => m.price)).toEqual([25.5, 19, null]);
  });

  it("stronicuje do ostatniej niepełnej strony", async () => {
    const full = Array.from({ length: 100 }, (_, i) => item(i + 1, `Danie ${i + 1}`));
    const calls = stubItems([full, [item(500, "Ostatnie")]]);
    const { products } = await fetchCurrentMenu("t", "3130");
    expect(products).toHaveLength(101);
    expect(calls).toHaveLength(2);
  });

  it("błąd HTTP z GoPOS przerywa pobieranie", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    await expect(fetchCurrentMenu("t", "3130")).rejects.toThrow(/HTTP 401/);
  });
});

describe("buildGoposMenuList", () => {
  const p = (id: string, name: string, extra: Partial<{ price: number | null; category: string | null; groupId: string | null }> = {}) => ({
    id, name, price: 50, category: "DANIA GŁÓWNE", groupId: null, groupName: null, ...extra,
  });
  const sold = (name: string, qty = 1, net = 50, posProductId: string | null = null) => ({ name, posProductId, qty, net });

  it("pokazuje tylko pozycje sprzedane w oknie (aktywne, ale bez sprzedaży odpadają)", () => {
    const list = buildGoposMenuList(
      [p("1", "Żurek"), p("2", "Extra ser"), p("3", "Stare danie")],
      [sold("Żurek", 20, 500)],
      [],
    );
    expect(list.map((i) => i.name)).toEqual(["Żurek"]);
  });

  it("skleja warianty jednej grupy, a różne dania w grupie zostawia osobno", () => {
    const list = buildGoposMenuList(
      [
        p("1", "Stek wołowy Medium", { groupId: "g1", price: 99 }),
        p("2", "Stek wołowy Well Done", { groupId: "g1", price: 95 }),
        p("3", "Pierogi ruskie", { groupId: "g2" }),
        p("4", "Naleśniki", { groupId: "g2" }),
      ],
      [sold("Stek wołowy Medium", 6, 600, "77"), sold("Stek wołowy Well Done", 4, 400, "77"), sold("Pierogi ruskie"), sold("Naleśniki")],
      [],
    );
    expect(list.map((i) => i.name).sort()).toEqual(["Naleśniki", "Pierogi ruskie", "Stek wołowy"]);
    expect(list.find((i) => i.name === "Stek wołowy")).toMatchObject({ sellPrice: 95, qty: 10, posProductName: "Stek wołowy" });
  });

  it("oznacza dania już w Food Cost (także przez powiązanie ze sprzedażą)", () => {
    const list = buildGoposMenuList(
      [p("1", "Żurek"), p("2", "Rosół")],
      [sold("Żurek", 20, 500, "30"), sold("Rosół", 5, 100)],
      [{ name: "Zupa żurek", posProductName: "Żurek" }],
    );
    expect(list.find((i) => i.name === "Żurek")!.alreadyImported).toBe(true);
    expect(list.find((i) => i.name === "Rosół")!.alreadyImported).toBe(false);
  });

  it("bez ceny w karcie bierze średnią cenę ze sprzedaży z VAT 8%", () => {
    const list = buildGoposMenuList([p("1", "Zadatek", { price: null })], [sold("Zadatek", 4, 400, "5")], []);
    expect(list[0]).toMatchObject({ sellPrice: 108, priceSource: "sales" });
    const withMenu = buildGoposMenuList([p("1", "Żurek", { price: 27 })], [sold("Żurek", 1, 10)], []);
    expect(withMenu[0]).toMatchObject({ sellPrice: 27, priceSource: "menu" });
  });

  it("ta sama pozycja w kilku menu (sala, dowóz) pojawia się raz", () => {
    const list = buildGoposMenuList([p("1", "Żurek"), p("2", "żurek ")], [sold("Żurek")], []);
    expect(list).toHaveLength(1);
  });
});
