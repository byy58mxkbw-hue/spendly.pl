import type { Logger } from "pino";
import { sql, eq } from "drizzle-orm";
import { db, subscriptionsTable } from "@workspace/db";
import { fetchAllClerkUsers, ADMIN_IDS, type ClerkUserRaw } from "../routes/admin.js";
import { sendEmail } from "./resend-client.js";
import { feedbackRequestEmailHtml, trialAnnouncementEmailHtml, aiUpdateAnnouncementEmailHtml } from "../lib/email-templates.js";

const DEFAULT_FROM = "Spendly <onboarding@resend.dev>";
const DEFAULT_REPLY_TO = "spendlykontakt@gmail.com";
// Mały odstęp między wysyłkami — sekwencyjna pętla (wzorem gopos-sync.ts), bez
// nowej zależności do throttlingu, żeby nie zbombardować limitu Resend na raz.
const SEND_DELAY_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type BroadcastResult = { totalUsers: number; sent: number; skipped: number; failed: number };

// Generyczny, jednorazowy (na razie) broadcast maila do WSZYSTKICH zarejestrowanych
// userów poza adminami. Dedup przez email_log (ON CONFLICT DO NOTHING jako "claim",
// ten sam wzorzec co sendWelcomeEmailIfNeeded) — ponowne wywołanie pomija tych, którzy
// już dostali TEN TYP maila (`emailType`). Reużywane przez feedback i ogłoszenie triala.
async function broadcastEmailToAllUsers(
  log: Logger,
  opts: { emailType: string; subject: string; buildHtml: (u: ClerkUserRaw) => string | Promise<string> },
): Promise<BroadcastResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    log.info({ emailType: opts.emailType }, "Resend: RESEND_API_KEY nieustawiony, pomijam broadcast");
    return { totalUsers: 0, sent: 0, skipped: 0, failed: 0 };
  }

  const { data: users } = await fetchAllClerkUsers();
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const u of users) {
    if (ADMIN_IDS.includes(u.id)) continue; // admin nie dostaje broadcastów do siebie

    const email =
      u.email_addresses.find((e) => e.id === u.primary_email_address_id)?.email_address ??
      u.email_addresses[0]?.email_address ??
      null;
    if (!email) { skipped++; continue; }

    const claimed = await db.execute(sql`
      INSERT INTO email_log (user_id, type) VALUES (${u.id}, ${opts.emailType})
      ON CONFLICT (user_id, type) DO NOTHING
      RETURNING id
    `);
    if (claimed.rows.length === 0) { skipped++; continue; }

    try {
      await sendEmail(apiKey, {
        to: email,
        from: process.env.EMAIL_FROM || DEFAULT_FROM,
        replyTo: process.env.EMAIL_REPLY_TO || DEFAULT_REPLY_TO,
        subject: opts.subject,
        html: await opts.buildHtml(u),
      });
      sent++;
    } catch (err) {
      log.error({ userId: u.id, emailType: opts.emailType, err: String(err) }, "Resend: wysyłka broadcastu nieudana");
      failed++;
    }
    await sleep(SEND_DELAY_MS);
  }

  log.info({ emailType: opts.emailType, totalUsers: users.length, sent, skipped, failed }, "Broadcast zakończony");
  return { totalUsers: users.length, sent, skipped, failed };
}

export async function sendFeedbackRequestToAllUsers(log: Logger): Promise<BroadcastResult> {
  return broadcastEmailToAllUsers(log, {
    emailType: "feedback_request",
    subject: "Twoja opinia o Spendly",
    buildHtml: (u) => feedbackRequestEmailHtml({ firstName: u.first_name }),
  });
}

// Jednorazowe ogłoszenie ulepszeń AI Asystenta (function calling, wyszukiwanie
// po NIP, anomalie cen/ilości, propozycja alertu z czatu). Ten sam komunikat co
// in-app notka (components/ai-update-notice.tsx), inny kanał — dedup niezależny
// (email_log type=ai_update_announcement, osobny od localStorage per-user we froncie).
export async function sendAiUpdateAnnouncementToAllUsers(log: Logger): Promise<BroadcastResult> {
  return broadcastEmailToAllUsers(log, {
    emailType: "ai_update_announcement",
    subject: "Ulepszyliśmy AI Asystenta w Spendly",
    buildHtml: (u) => aiUpdateAnnouncementEmailHtml({ firstName: u.first_name }),
  });
}

const PL_DATE_FORMAT = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Warsaw" });

// Ogłoszenie startu 30-dniowego triala pro. Wołać PO nadaniu triala wszystkim
// (routes/admin.ts: /admin/backfill-trial), żeby treść i status były prawdziwe —
// data w mailu to REALNA `trial_ends_at` z bazy dla tego konkretnego usera, nie
// przybliżenie, na wypadek gdyby konta miały nadany trial w różnym momencie.
export async function sendTrialAnnouncementToAllUsers(log: Logger): Promise<BroadcastResult> {
  return broadcastEmailToAllUsers(log, {
    emailType: "trial_start_announcement",
    subject: "Spendly startuje z płatnościami — masz miesiąc pełnego dostępu gratis",
    buildHtml: async (u) => {
      const [row] = await db
        .select({ trialEndsAt: subscriptionsTable.trialEndsAt })
        .from(subscriptionsTable)
        .where(eq(subscriptionsTable.userId, u.id));
      const trialEndsAtLabel = row?.trialEndsAt ? PL_DATE_FORMAT.format(row.trialEndsAt) : "za 30 dni";
      return trialAnnouncementEmailHtml({ firstName: u.first_name, trialEndsAtLabel });
    },
  });
}
