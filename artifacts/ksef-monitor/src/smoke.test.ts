import { describe, it, expect } from "vitest";

// Dummy test Fazy 0.1 — potwierdza, że harness (projekt "web", env jsdom) działa.
describe("smoke (web)", () => {
  it("ma DOM z jsdom", () => {
    expect(typeof document).toBe("object");
  });
});
