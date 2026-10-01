import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchCurrentMenu } from "./gopos-client";
import { buildGoposMenuList } from "../routes/food-cost";

// Aktualne menu GoPOS → lista dań do importu w Food Cost. Bez sieci i bazy:
// fetch jest podstawiony odpowiedziami w kształcie z publicznego spec GoPOS.

afterEach(() => vi.unstubAllGlobals());

function stubGopos(menus: unknown[], itemPages: unknown[][]) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    calls.push(url);
    if (url.includes("/menus?")) return new Response(JSON.stringify({ data: menus }), { status: 200 });
    const page = Number(new URL(url).searchParams.get("page") ?? 0);
    return new Response(JSON.stringify({ data: itemPages[page] ?? [] }), { status: 200 });
  }));
  return calls;
}

const item = (id: number, name: string, extra: Record<string, unknown> = {}) => ({
  id, name, status: "ENABLED", type: "PRODUCT", price: { amount: 30, currency: "PLN" }, ...extra,
});

describe("fetchCurrentMenu", () => {
  it("bierze tylko pozycje z aktywnego menu i pomija dodatki (MODIFIER)", async () => {
    stubGopos(
      [{ pages: [{ items: [{ context_type: "CATEGORY", context_id: 1 }, { context_type: "ITEM", context_id: 50 }] }] }],
      [[
        item(10, "Żurek", { category_id: 1, category: { name: "ZUPY" } }),
        item(11, "Extra ser", { category_id: 1, type: "MODIFIER" }),
        item(50, "Lemoniada", { category_id: 9 }),
        item(60, "Stare danie spoza karty", { category_id: 7 }),
      ]],
    );
    const menu = await fetchCurrentMenu("t", "3130");
    expect(menu.map((m) => m.name).sort()).toEqual(["Lemoniada", "Żurek"]);
    expect(menu.find((m) => m.name === "Żurek")).toMatchObject({ price: 30, category: "ZUPY" });
  });

  it("bez skonfigurowanych menu bierze wszystkie aktywne produkty i stronicuje", async () => {
    const full = Array.from({ length: 100 }, (_, i) => item(i + 1, `Danie ${i + 1}`));
    const calls = stubGopos([], [full, [item(500, "Ostatnie")]]);
    const menu = await fetchCurrentMenu("t", "3130");
    expect(menu).toHaveLength(101);
    expect(calls.filter((c) => c.includes("/items?"))).toHaveLength(2);
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

  it("skleja warianty jednej grupy, a różne dania w grupie zostawia osobno", () => {
    const list = buildGoposMenuList(
      [
        p("1", "Stek wołowy Medium", { groupId: "g1", price: 99 }),
        p("2", "Stek wołowy Well Done", { groupId: "g1", price: 95 }),
        p("3", "Pierogi ruskie", { groupId: "g2" }),
        p("4", "Naleśniki", { groupId: "g2" }),
      ],
      [],
      [],
    );
    expect(list.map((i) => i.name).sort()).toEqual(["Naleśniki", "Pierogi ruskie", "Stek wołowy"]);
    expect(list.find((i) => i.name === "Stek wołowy")!.sellPrice).toBe(95);
  });

  it("wiąże danie ze sprzedażą po nazwie i oznacza dania już w Food Cost", () => {
    const list = buildGoposMenuList(
      [p("1", "Stek wołowy Medium", { groupId: "g1" }), p("2", "Stek wołowy Well Done", { groupId: "g1" }), p("3", "Żurek"), p("4", "Nowość")],
      [
        { name: "Stek wołowy Medium", posProductId: "77", qty: 6, net: 600 },
        { name: "Stek wołowy Well Done", posProductId: "77", qty: 4, net: 400 },
        { name: "Żurek", posProductId: "30", qty: 20, net: 500 },
      ],
      [{ name: "Zupa żurek", posProductName: "Żurek" }],
    );
    const stek = list.find((i) => i.name === "Stek wołowy")!;
    expect(stek).toMatchObject({ posProductName: "Stek wołowy", qty: 10, alreadyImported: false });
    expect(list.find((i) => i.name === "Żurek")!.alreadyImported).toBe(true);
    // Nowe danie bez sprzedaży: wiązanie po własnej nazwie, sprzedaż 0.
    expect(list.find((i) => i.name === "Nowość")).toMatchObject({ posProductName: "Nowość", qty: 0 });
  });

  it("ta sama pozycja w kilku menu (sala, dowóz) pojawia się raz", () => {
    const list = buildGoposMenuList([p("1", "Żurek"), p("2", "żurek ")], [], []);
    expect(list).toHaveLength(1);
  });
});
