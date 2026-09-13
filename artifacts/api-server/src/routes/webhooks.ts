import { Router, type IRouter } from "express";
import { Webhook } from "svix";
import { sendWelcomeEmailIfNeeded } from "../services/email-service.js";

// Webhook Clerk (zdarzenia konta: user.created). PUBLICZNY — Clerk woła go bez
// sesji użytkownika, autoryzacja to podpis Svix (CLERK_WEBHOOK_SECRET), nie
// Clerk auth. Montowany w routes/index.ts OBOK healthRouter, PRZED requireUser.
const router: IRouter = Router();

type ClerkEmailAddress = { id: string; email_address: string };
type ClerkUserCreatedData = {
  id: string;
  first_name?: string | null;
  primary_email_address_id?: string | null;
  email_addresses?: ClerkEmailAddress[];
};
type ClerkWebhookEvent = { type: string; data: ClerkUserCreatedData };

function primaryEmail(data: ClerkUserCreatedData): string | null {
  const addresses = data.email_addresses ?? [];
  const primary = addresses.find((a) => a.id === data.primary_email_address_id);
  return (primary ?? addresses[0])?.email_address ?? null;
}

router.post("/webhooks/clerk", async (req, res): Promise<void> => {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    req.log.warn("Webhook Clerk: CLERK_WEBHOOK_SECRET nieustawiony, odrzucam");
    res.status(503).json({ error: "Webhook nieskonfigurowany." });
    return;
  }
  if (!req.rawBody) {
    req.log.error("Webhook Clerk: brak surowego body (rawBody) — sprawdź verify callback w app.ts");
    res.status(500).json({ error: "Błąd serwera." });
    return;
  }

  const svixId = req.header("svix-id");
  const svixTimestamp = req.header("svix-timestamp");
  const svixSignature = req.header("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    res.status(400).json({ error: "Brak nagłówków Svix." });
    return;
  }

  let event: ClerkWebhookEvent;
  try {
    const wh = new Webhook(secret);
    // `verify()` w svix@2 nic nie zwraca (zawsze `undefined`) — tylko RZUCA przy
    // złym podpisie. Payload trzeba sparsować samemu PO udanej weryfikacji.
    wh.verify(req.rawBody, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    });
    event = JSON.parse(req.rawBody.toString("utf8")) as ClerkWebhookEvent;
  } catch (err) {
    req.log.warn({ err: String(err) }, "Webhook Clerk: nieprawidłowy podpis");
    res.status(400).json({ error: "Nieprawidłowy podpis." });
    return;
  }

  // Zawsze 2xx po udanej weryfikacji podpisu, nawet gdy coś poniżej pójdzie nie
  // tak — Clerk retry-uje webhooki bez 2xx, a to nie ma być kolejka dostarczania.
  res.status(200).json({ ok: true });

  if (event.type === "user.created") {
    const { id: userId, first_name: firstName } = event.data;
    const email = primaryEmail(event.data);
    sendWelcomeEmailIfNeeded(userId, email, firstName ?? null, req.log).catch((err) => {
      req.log.error({ userId, err: String(err) }, "Webhook Clerk: mail powitalny nie powiódł się");
    });
  }
});

export default router;
