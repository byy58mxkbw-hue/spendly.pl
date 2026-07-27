import { Router, type IRouter } from "express";
import { db, goposConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { encryptSecret } from "../lib/encryption";
import { isAdmin, denyAdmin } from "./admin";

// Integracja GoPOS — na razie ADMIN-ONLY (do czasu podłączenia i przetestowania API).
// Przechowuje klucze (client secret zaszyfrowany AES-256-GCM, jak token KSeF, rule 9).
// Sam sync sprzedaży dobudujemy po otrzymaniu dokumentacji API GoPOS.
const router: IRouter = Router();

router.get("/gopos/config", async (req, res): Promise<void> => {
  if (!isAdmin(req)) { denyAdmin(res); return; }
  const [cfg] = await db.select().from(goposConfigTable).where(eq(goposConfigTable.userId, req.userId!)).limit(1);
  if (!cfg) { res.json(null); return; }
  res.json({
    clientId: cfg.clientId,
    clientSecretMasked: cfg.clientSecretLast4 ? `••••${cfg.clientSecretLast4}` : "",
    locationId: cfg.locationId,
    baseUrl: cfg.baseUrl,
    lastSyncedAt: cfg.lastSyncedAt ? cfg.lastSyncedAt.toISOString() : null,
  });
});

router.put("/gopos/config", async (req, res): Promise<void> => {
  if (!isAdmin(req)) { denyAdmin(res); return; }
  const userId = req.userId!;
  const body = req.body as { clientId?: unknown; clientSecret?: unknown; locationId?: unknown; baseUrl?: unknown };
  const clientId = String(body.clientId ?? "").trim();
  const clientSecret = String(body.clientSecret ?? "").trim();
  const locationId = body.locationId != null && String(body.locationId).trim() !== "" ? String(body.locationId).trim() : null;
  const baseUrl = body.baseUrl != null && String(body.baseUrl).trim() !== "" ? String(body.baseUrl).trim() : null;

  if (!clientId) { res.status(400).json({ error: "clientId jest wymagany." }); return; }

  const [existing] = await db.select().from(goposConfigTable).where(eq(goposConfigTable.userId, userId)).limit(1);
  if (!clientSecret && !existing) { res.status(400).json({ error: "clientSecret jest wymagany." }); return; }

  // Sekret: gdy podany — szyfruj; gdy pusty przy edycji — zostaw dotychczasowy.
  let encryptedClientSecret = existing?.encryptedClientSecret ?? "";
  let clientSecretLast4 = existing?.clientSecretLast4 ?? "";
  if (clientSecret) {
    try {
      encryptedClientSecret = encryptSecret(clientSecret);
    } catch (err) {
      req.log.error({ err }, "GoPOS: szyfrowanie client secret nieudane");
      res.status(500).json({ error: "Brak skonfigurowanego klucza szyfrującego (KSEF_ENCRYPTION_KEY)." });
      return;
    }
    clientSecretLast4 = clientSecret.slice(-4);
  }

  await db
    .insert(goposConfigTable)
    .values({ userId, clientId, encryptedClientSecret, clientSecretLast4, locationId, baseUrl })
    .onConflictDoUpdate({
      target: goposConfigTable.userId,
      set: { clientId, encryptedClientSecret, clientSecretLast4, locationId, baseUrl, updatedAt: new Date() },
    });
  res.json({ ok: true });
});

// Placeholder — sync sprzedaży z GoPOS uruchomimy po podłączeniu dokumentacji API.
router.post("/gopos/sync", async (req, res): Promise<void> => {
  if (!isAdmin(req)) { denyAdmin(res); return; }
  res.status(501).json({ error: "Integracja GoPOS w przygotowaniu — synchronizacja ruszy po podłączeniu API." });
});

export default router;
