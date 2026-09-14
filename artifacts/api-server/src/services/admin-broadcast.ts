import type { Logger } from "pino";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { fetchAllClerkUsers, ADMIN_IDS } from "../routes/admin.js";
import { sendEmail } from "./resend-client.js";
import { feedbackRequestEmailHtml } from "../lib/email-templates.js";

const DEFAULT_FROM = "Spendly <onboarding@resend.dev>";
const DEFAULT_REPLY_TO = "spendlykontakt@gmail.com";
// Mały odstęp między wysyłkami — sekwencyjna pętla (wzorem gopos-sync.ts), bez
// nowej zależności do throttlingu, żeby nie zbombardować limitu Resend na raz.
const SEND_DELAY_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type FeedbackBroadcastResult = { totalUsers: number; sent: number; skipped: number; failed: number };

// Jednorazowy (na razie) broadcast do WSZYSTKICH zarejestrowanych userów poza
// adminami — prośba o opinię/feedback. Dedup przez email_log (ON CONFLICT DO
// NOTHING jako "claim", ten sam wzorzec co sendWelcomeEmailIfNeeded) — ponowne
// wywołanie pomija tych, którzy już dostali ten typ maila.
export async function sendFeedbackRequestToAllUsers(log: Logger): Promise<FeedbackBroadcastResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    log.info("Resend: RESEND_API_KEY nieustawiony, pomijam broadcast feedbacku");
    return { totalUsers: 0, sent: 0, skipped: 0, failed: 0 };
  }

  const { data: users } = await fetchAllClerkUsers();
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const u of users) {
    if (ADMIN_IDS.includes(u.id)) continue; // admin nie dostaje prośby o feedback do siebie

    const email =
      u.email_addresses.find((e) => e.id === u.primary_email_address_id)?.email_address ??
      u.email_addresses[0]?.email_address ??
      null;
    if (!email) { skipped++; continue; }

    const claimed = await db.execute(sql`
      INSERT INTO email_log (user_id, type) VALUES (${u.id}, 'feedback_request')
      ON CONFLICT (user_id, type) DO NOTHING
      RETURNING id
    `);
    if (claimed.rows.length === 0) { skipped++; continue; }

    try {
      await sendEmail(apiKey, {
        to: email,
        from: process.env.EMAIL_FROM || DEFAULT_FROM,
        replyTo: process.env.EMAIL_REPLY_TO || DEFAULT_REPLY_TO,
        subject: "Twoja opinia o Spendly",
        html: feedbackRequestEmailHtml({ firstName: u.first_name }),
      });
      sent++;
    } catch (err) {
      log.error({ userId: u.id, err: String(err) }, "Resend: wysyłka prośby o feedback nieudana");
      failed++;
    }
    await sleep(SEND_DELAY_MS);
  }

  log.info({ totalUsers: users.length, sent, skipped, failed }, "Broadcast feedbacku zakończony");
  return { totalUsers: users.length, sent, skipped, failed };
}
