import { describe, it, expect } from "vitest";
import { foldDiacritics, normalizeForMatch } from "./text-normalize";

describe("foldDiacritics", () => {
  it("zamienia polskie znaki diakrytyczne na łacińskie odpowiedniki", () => {
    expect(foldDiacritics("ąćęłńóśźż")).toBe("acelnoszz");
  });
  it("nie rusza zwykłych liter/cyfr", () => {
    expect(foldDiacritics("twarog 200g")).toBe("twarog 200g");
  });
});

describe("normalizeForMatch", () => {
  it("lowercase + fold diakrytyków + usunięcie wiodącego #", () => {
    expect(normalizeForMatch("#Twaróg Wiejski")).toBe("twarog wiejski");
  });
  it("wersje z i bez ogonków normalizują się do tego samego ciągu", () => {
    expect(normalizeForMatch("Comté")).toBe(normalizeForMatch("Comte"));
  });
});
