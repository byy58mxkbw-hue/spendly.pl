import { describe, it, expect, vi, beforeEach } from "vitest";
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

const state = vi.hoisted(() => ({
  seen: false as boolean | undefined,
  mutate: vi.fn(),
  sub: { status: "trialing", daysLeft: 30 } as { status: string; daysLeft: number } | undefined,
}));

vi.mock("@clerk/react", () => ({ useUser: () => ({ user: { id: "user_1", firstName: "Patryk" } }) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("@workspace/api-client-react", () => ({
  useGetWelcomeStatus: () => ({ data: state.seen === undefined ? undefined : { seen: state.seen } }),
  useMarkWelcomeSeen: () => ({ mutate: state.mutate }),
  useGetSubscriptionStatus: () => ({ data: state.sub }),
  getGetWelcomeStatusQueryKey: () => ["welcome"],
}));

import { WelcomeOnboarding } from "./welcome-onboarding";

describe("WelcomeOnboarding (raz na konto, flaga na serwerze)", () => {
  beforeEach(() => {
    state.seen = false;
    state.mutate.mockClear();
    localStorage.clear();
    window.history.replaceState(null, "", "/dashboard");
  });

  it("nowe konto bez danych → pokazuje powitanie z imieniem i 8 funkcjami", () => {
    render(<WelcomeOnboarding ready hasData={false} />);
    expect(text()).toMatch(/Witaj w Spendly, Patryk\./);
    expect(text()).toContain("AI CFO");
    expect(text()).toMatch(/Masz 30 dni planu Pro za darmo/);
  });

  it("serwer mówi „widziane” → nie pokazuje", () => {
    state.seen = true;
    render(<WelcomeOnboarding ready hasData={false} />);
    expect(document.querySelector('[data-testid="welcome-onboarding"]')).toBeNull();
  });

  it("konto z danymi bez wejścia z podglądu → nie pokazuje", () => {
    render(<WelcomeOnboarding ready hasData />);
    expect(document.querySelector('[data-testid="welcome-onboarding"]')).toBeNull();
  });

  it("stary klucz localStorage → nie pokazuje, dosyła flagę na serwer", () => {
    localStorage.setItem("spendly_welcome_user_1", "1");
    render(<WelcomeOnboarding ready hasData={false} />);
    expect(document.querySelector('[data-testid="welcome-onboarding"]')).toBeNull();
    expect(state.mutate).toHaveBeenCalled();
  });

  it("wejście z podglądu po imporcie → odhaczona faktura i przycisk porównania; zamknięcie zapisuje flagę", () => {
    localStorage.setItem("spendly_viewer_import", JSON.stringify({ invoiceId: 7, invoiceNumber: "FV/1", supplierName: "Zielony", itemsCount: 8, invoiceDate: "2026-07-14", duplicate: false }));
    window.history.replaceState(null, "", "/dashboard?z=podglad&inv=7");
    render(<WelcomeOnboarding ready hasData />);
    expect(text()).toContain("FV/1 · 8 pozycji");
    clickText("Zobacz porównanie cen z faktury");
    expect(state.mutate).toHaveBeenCalled();
  });

  it("bez triala nie obiecuje 30 dni Pro", () => {
    state.sub = { status: "canceled", daysLeft: 0 };
    render(<WelcomeOnboarding ready hasData={false} />);
    expect(text()).not.toMatch(/30 dni planu Pro/);
    state.sub = { status: "trialing", daysLeft: 30 };
  });
});
