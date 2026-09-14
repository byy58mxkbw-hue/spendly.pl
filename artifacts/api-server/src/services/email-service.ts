import type { Logger } from "pino";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { sendEmail, upsertContact } from "./resend-client.js";
import { welcomeEmailHtml } from "../lib/email-templates.js";

const DEFAULT_FROM = "Spendly <onboarding@resend.dev>";
const DEFAULT_REPLY_TO = "spendlykontakt@gmail.com";

// Mail powitalny po rejestracji (wołany z routes/webhooks.ts na zdarzenie Clerk
// `user.created`). Nic nie wysyła, dopóki RESEND_API_KEY nie jest ustawiony —
// ten sam wzorzec co GoPOS bez konfiguracji. Zabezpieczone przed podwójną
// wysyłką (webhooki Clerk mogą przyjść więcej niż raz) przez "claim" w
// email_log: insert z ON CONFLICT DO NOTHING — wiersz wraca tylko dla
// pierwszego wywołania, kolejne po prostu nic nie robią.
export async function sendWelcomeEmailIfNeeded(
  userId: string,
  email: string | null,
  firstName: string | null,
  log: Logger,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    log.info({ userId }, "Resend: RESEND_API_KEY nieustawiony, pomijam mail powitalny");
    return;
  }
  if (!email) {
    log.warn({ userId }, "Resend: brak adresu e-mail w zdarzeniu Clerk, pomijam mail powitalny");
    return;
  }

  const claimed = await db.execute(sql`
    INSERT INTO email_log (user_id, type) VALUES (${userId}, 'welcome')
    ON CONFLICT (user_id, type) DO NOTHING
    RETURNING id
  `);
  if (claimed.rows.length === 0) {
    log.info({ userId }, "Resend: mail powitalny już wysłany wcześniej, pomijam");
    return;
  }

  try {
    await sendEmail(apiKey, {
      to: email,
      from: process.env.EMAIL_FROM || DEFAULT_FROM,
      replyTo: process.env.EMAIL_REPLY_TO || DEFAULT_REPLY_TO,
      subject: "Witaj w Spendly",
      html: welcomeEmailHtml({ firstName }),
    });
    log.info({ userId }, "Resend: mail powitalny wysłany");
  } catch (err) {
    // Nie wywalamy webhooka — Clerk oczekuje 2xx niezależnie, inaczej retry-uje
    // w kółko. Wiersz w email_log już jest — jeśli wysyłka nie doszła, trudno,
    // nie próbujemy drugi raz automatycznie (spójne z "claim, nie retry-kolejka").
    log.error({ userId, err: String(err) }, "Resend: wysyłka maila powitalnego nieudana");
  }

  const audienceId = process.env.RESEND_AUDIENCE_ID;
  if (audienceId) {
    try {
      await upsertContact(apiKey, audienceId, email, firstName);
    } catch (err) {
      log.warn({ userId, err: String(err) }, "Resend: dodanie kontaktu do Audience nieudane (nieistotne dla maila powitalnego)");
    }
  }
}
