import { describe, it, expect } from "vitest";
import { welcomeEmailHtml, feedbackRequestEmailHtml } from "./email-templates";

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

describe("feedbackRequestEmailHtml", () => {
  it("wita po imieniu, gdy podane", () => {
    const html = feedbackRequestEmailHtml({ firstName: "Kasia" });
    expect(html).toContain("Cześć, Kasia!");
  });

  it("wita ogólnie, gdy brak imienia", () => {
    const html = feedbackRequestEmailHtml({ firstName: null });
    expect(html).toContain("Cześć!");
    expect(html).not.toContain("Cześć, null");
  });

  it("prosi o odpowiedź mailem, bez przycisku CTA (to inny mail niż powitalny)", () => {
    const html = feedbackRequestEmailHtml({ firstName: null });
    expect(html).toContain("odpowiedzieć na tego maila");
    expect(html).not.toContain("Przejdź do Spendly");
  });

  it("bez emoji (reguła designu edytorski gastro)", () => {
    const html = feedbackRequestEmailHtml({ firstName: "Kasia" });
    // eslint-disable-next-line no-misleading-character-class
    const emojiPattern = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    expect(emojiPattern.test(html)).toBe(false);
  });
});
