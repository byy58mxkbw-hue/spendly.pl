import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

// Liveness â€” NIE dotyka bazy. Railway uĹĽywa go do sprawdzania czy proces ĹĽyje;
// gdyby zaleĹĽaĹ‚ od bazy, chwilowy problem z DB ubiĹ‚by caĹ‚y serwis.
router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Publiczny znacznik wersji buildu â€” do weryfikacji, czy deploy faktycznie wszedĹ‚
// na prod (healthz nie zmienia siÄ™ miÄ™dzy deployami). Bump `build` przy istotnych
// zmianach, ktĂłrych wdroĹĽenie chcesz potwierdziÄ‡ bez tokenu.
router.get("/version", (_req, res) => {
  res.json({ status: "ok", build: "2026-10-07-extend-trial", startedAt: process.uptime() });
});

// Readiness â€” sprawdza poĹ‚Ä…czenie z bazÄ… (SELECT 1). 503 gdy baza niedostÄ™pna.
// Do podpiÄ™cia pod monitor uptime, ktĂłry ma alarmowaÄ‡ o realnej niedostÄ™pnoĹ›ci.
router.get("/healthz/ready", async (_req, res) => {
  try {
    await pool.query("select 1");
    res.json({ status: "ok", db: "ok" });
  } catch {
    res.status(503).json({ status: "error", db: "down" });
  }
});

export default router;
