// Szablony HTML maili transakcyjnych. Tabele + inline CSS (nie flex/grid) —
// klienci pocztowi (Outlook, Gmail) ignorują nowoczesny CSS i własne fonty,
// więc font-family ma web-safe fallback, a layout jest tabelowy.
//
// Paleta „edytorski gastro" (LIGHT — maile zawsze w jasnym motywie, nie da się
// polegać na prefers-color-scheme we wszystkich klientach pocztowych):
// papier #F4EDE0, karta #FBF7EF, tekst #211B12, przygaszony #8A7C63,
// hairline #E2D8C6, akcent terakota #C4562F. Bez emoji (reguła designu).

const LOGO_URL = "https://www.spendly.pl/logo.svg";
const APP_URL = "https://www.spendly.pl";

function shell(bodyHtml: string): string {
  return `<!doctype html>
<html lang="pl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="margin:0; padding:0; background-color:#F4EDE0; font-family:'Space Grotesk', system-ui, -apple-system, Segoe UI, Roboto, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F4EDE0; padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px; background-color:#FBF7EF; border:1px solid #E2D8C6; border-radius:4px;">
            <tr>
              <td style="padding:28px 32px 0 32px;">
                <img src="${LOGO_URL}" alt="Spendly" height="28" style="display:block; height:28px; width:auto;" />
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 32px 32px; color:#211B12; font-size:14px; line-height:1.6;">
                ${bodyHtml}
              </td>
            </tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
            <tr>
              <td style="padding:16px 32px; color:#8A7C63; font-size:11px; line-height:1.6; text-align:center;">
                Spendly — monitoring cen surowców dla restauracji.<br />
                Pytania? Odpowiedz na tego maila.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function ctaButton(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:20px;">
    <tr>
      <td style="border-radius:4px; background-color:#C4562F;">
        <a href="${href}" style="display:inline-block; padding:11px 22px; color:#FBF7EF; font-size:14px; font-weight:700; text-decoration:none; border-radius:4px;">${label}</a>
      </td>
    </tr>
  </table>`;
}

export function welcomeEmailHtml({ firstName }: { firstName: string | null }): string {
  const greeting = firstName ? `Cześć, ${firstName}!` : "Cześć!";
  return shell(`
    <p style="margin:0 0 16px 0; font-size:18px; font-weight:700;">${greeting}</p>
    <p style="margin:0 0 12px 0;">Dziękujemy za założenie konta w Spendly. Cieszymy się, że jesteś z nami.</p>
    <p style="margin:0 0 12px 0;">Masz pełny dostęp do aplikacji bezpłatnie na czas testów — bez ukrytych warunków. Możesz od razu podłączyć faktury z KSeF, zbudować listę dań i zacząć śledzić ceny surowców.</p>
    ${ctaButton("Przejdź do Spendly", APP_URL)}
  `);
}
