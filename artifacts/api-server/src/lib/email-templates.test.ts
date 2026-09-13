import { describe, it, expect } from "vitest";
import { welcomeEmailHtml } from "./email-templates";

describe("welcomeEmailHtml", () => {
  it("wita po imieniu, gdy podane", () => {
    const html = welcomeEmailHtml({ firstName: "Kasia" });
    expect(html).toContain("Cześć, Kasia!");
  });

  it("wita ogólnie, gdy brak imienia", () => {
    const html = welcomeEmailHtml({ firstName: null });
    expect(html).toContain("Cześć!");
    expect(html).not.toContain("Cześć, null");
  });

  it("zawiera link do aplikacji", () => {
    const html = welcomeEmailHtml({ firstName: "Kasia" });
    expect(html).toContain("https://www.spendly.pl");
  });

  it("nie obiecuje konkretnego terminu trialu — nie ma dziś mechanizmu, który by to rozliczał", () => {
    const html = welcomeEmailHtml({ firstName: null });
    expect(html.toLowerCase()).not.toContain("pierwszy miesiąc");
    expect(html.toLowerCase()).not.toContain("30 dni");
  });

  it("bez emoji (reguła designu edytorski gastro)", () => {
    const html = welcomeEmailHtml({ firstName: "Kasia" });
    // Zakres typowych emoji (nie łapie polskich znaków diakrytycznych).
    // eslint-disable-next-line no-misleading-character-class
    const emojiPattern = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    expect(emojiPattern.test(html)).toBe(false);
  });
});
