import { describe, it, expect, beforeEach } from "vitest";
import { savePendingInvoice, readPendingInvoice, clearPendingInvoice, PENDING_INVOICE_TTL_MS } from "./pending-invoice";

describe("pending-invoice (localStorage, TTL 1 h)", () => {
  beforeEach(() => localStorage.clear());

  it("zapis → odczyt zwraca plik", () => {
    savePendingInvoice("<Faktura/>", "fv.xml");
    expect(readPendingInvoice()?.fileName).toBe("fv.xml");
  });

  it("przeterminowany wpis jest usuwany przy odczycie", () => {
    savePendingInvoice("<Faktura/>", "fv.xml");
    expect(readPendingInvoice(Date.now() + PENDING_INVOICE_TTL_MS + 1)).toBeNull();
    expect(localStorage.getItem("spendly_pending_invoice")).toBeNull();
  });

  it("uszkodzony wpis → null, bez wyjątku", () => {
    localStorage.setItem("spendly_pending_invoice", "{nie-json");
    expect(readPendingInvoice()).toBeNull();
  });

  it("clear usuwa wpis", () => {
    savePendingInvoice("<Faktura/>", "fv.xml");
    clearPendingInvoice();
    expect(readPendingInvoice()).toBeNull();
  });
});
