import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

// Liveness — NIE dotyka bazy. Railway używa go do sprawdzania czy proces żyje;
// gdyby zależał od bazy, chwilowy problem z DB ubiłby cały serwis.
router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Publiczny znacznik wersji buildu — do weryfikacji, czy deploy faktycznie wszedł
// na prod (healthz nie zmienia się między deployami). Bump `build` przy istotnych
// zmianach, których wdrożenie chcesz potwierdzić bez tokenu.
router.get("/version", (_req, res) => {
  res.json({ status: "ok", build: "2026-07-15-xlsx-export-1", startedAt: process.uptime() });
});

// Readiness — sprawdza połączenie z bazą (SELECT 1). 503 gdy baza niedostępna.
// Do podpięcia pod monitor uptime, który ma alarmować o realnej niedostępności.
router.get("/healthz/ready", async (_req, res) => {
  try {
    await pool.query("select 1");
    res.json({ status: "ok", db: "ok" });
  } catch {
    res.status(503).json({ status: "error", db: "down" });
  }
});

export default router;
