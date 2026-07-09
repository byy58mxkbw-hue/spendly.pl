import { describe, it, expect } from "vitest";

// Dummy test Fazy 0.1 — potwierdza, że harness (projekt "api", env node) działa.
describe("smoke (api)", () => {
  it("uruchamia harness testowy", () => {
    expect(1 + 1).toBe(2);
  });
});
