import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { HOME_FAQ } from "./home-faq";

// Pytania ze schema FAQPage muszą być widoczne na stronie (wytyczne Google), a
// prerender w index.html musi zgadzać się z home.tsx (reguła 26). Wcześniej
// index.html miał inny zestaw pytań niż React. Ten test pilnuje jednego źródła.
const html = readFileSync(path.resolve(__dirname, "../../index.html"), "utf8");
const escHtml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function faqSchema(): Array<{ name: string; acceptedAnswer: { text: string } }> {
  const start = html.indexOf("<!-- Schema.org: FAQPage");
  const open = html.indexOf(">", html.indexOf("<script", start)) + 1;
  const json = JSON.parse(html.slice(open, html.indexOf("</script>", open)));
  return json.mainEntity;
}

describe("FAQ strony głównej", () => {
  it("schema FAQPage w index.html = HOME_FAQ (te same pytania i odpowiedzi, ta sama kolejność)", () => {
    const schema = faqSchema();
    expect(schema.map((x) => x.name)).toEqual(HOME_FAQ.map((x) => x.q));
    expect(schema.map((x) => x.acceptedAnswer.text)).toEqual(HOME_FAQ.map((x) => x.a));
  });

  it("każde pytanie i odpowiedź jest widoczne w prerenderze sekcji #faq", () => {
    const section = html.slice(html.indexOf('<section id="faq"'), html.indexOf("</section>", html.indexOf('<section id="faq"')));
    for (const { q, a } of HOME_FAQ) {
      expect(section).toContain(`>${escHtml(q)}</h3>`);
      expect(section).toContain(`>${escHtml(a)}</p>`);
    }
  });
});
