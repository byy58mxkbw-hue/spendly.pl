import { describe, it, expect, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// Minimalny render bez @testing-library (projekt go nie ma): React 19 act + createRoot.
// Radix Dialog renderuje w portalu do body — dlatego zapytania idą po całym document.body.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
function render(ui: React.ReactElement) {
  if (root) act(() => root!.unmount());
  document.body.innerHTML = "";
  const el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  act(() => root!.render(ui));
}
const text = () => document.body.textContent ?? "";
function clickText(t: string) {
  const el = [...document.body.querySelectorAll("button, a, span")].find((n) => n.textContent?.trim() === t) as HTMLElement | undefined;
  if (!el) throw new Error("brak elementu: " + t);
  act(() => el.click());
}
import type { BenchmarkItem } from "@workspace/api-client-react";

vi.mock("@workspace/api-client-react", () => ({
  useCreatePriceAlert: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false }),
  getListPriceAlertsQueryKey: () => ["alerts"],
}));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { BenchmarkInvoiceView } from "./benchmark-invoice-view";

const base = { category: null, insufficientData: false, history: [] } as const;
const ITEMS: BenchmarkItem[] = [
  { ...base, productName: "Cytryna", unit: "kg", yourPrice: 9.4, medianPrice: 7.8, p25Price: 7.2, p75Price: 8.6, deltaPercent: 20.5, monthlyQuantity: 10, savingsPerMonth: 16 },
  { ...base, productName: "Limonka", unit: "kg", yourPrice: 14.9, medianPrice: 15.6, p25Price: 13.9, p75Price: 17.2, deltaPercent: -4.5, monthlyQuantity: 3, savingsPerMonth: 0 },
  { ...base, productName: "Ziemniaki", unit: "kg", yourPrice: 1.95, medianPrice: 1.6, p25Price: 1.45, p75Price: 1.85, deltaPercent: 21.9, monthlyQuantity: 20, savingsPerMonth: 7 },
  { productName: "Bazylia w doniczce", unit: "szt", category: null, yourPrice: 6, monthlyQuantity: 4, insufficientData: true },
];

describe("BenchmarkInvoiceView", () => {
  it("liczy kafle: drożej 2 z 3, do odzyskania 23 zł, w normie 1 z 3", () => {
    render(<BenchmarkInvoiceView items={ITEMS} />);
    expect(text()).toContain("ziemniaki, cytryna"); // od największej różnicy
    expect(text()).toMatch(/23,00\s*zł/);
    expect(text()).toContain("limonka");
  });

  it("produkty bez mediany w osobnym bloku, bez liczb rynku", () => {
    render(<BenchmarkInvoiceView items={ITEMS} />);
    expect(text()).toMatch(/Bazylia w doniczce — jeszcze bez mediany/);
  });

  it("alert proponowany dla produktu najbardziej powyżej rynku", () => {
    render(<BenchmarkInvoiceView items={ITEMS} />);
    expect(text()).toMatch(/Daj znać, gdy cena „Ziemniaki” znowu wzrośnie/);
  });
});
