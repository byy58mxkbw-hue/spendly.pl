import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { aiInsightsTable } from "@workspace/db/schema";
import { eq, and, isNull, desc } from "drizzle-orm";
import { generateInsights } from "../services/insights-generator";
import { AdvisoryLock } from "../lib/advisory-lock";

const router: IRouter = Router();

router.get("/insights", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const rows = await db
    .select()
    .from(aiInsightsTable)
    .where(and(eq(aiInsightsTable.userId, userId), isNull(aiInsightsTable.dismissedAt)))
    .orderBy(desc(aiInsightsTable.riskScore), desc(aiInsightsTable.createdAt))
    .limit(50);
  res.json(rows);
});

router.post("/insights/generate", async (req, res): Promise<void> => {
  const userId = req.userId!;

  const lock = await AdvisoryLock.tryAcquire("insights_generate", userId);
  if (!lock) {
    res.status(202).json({ status: "running" });
    return;
  }

  // Respond immediately so the browser doesn't time out, then run the job
  // asynchronously while holding the lock for its full duration.
  res.status(202).json({ status: "started" });

  generateInsights(userId, req.log)
    .then((count) => req.log.info({ count }, "AI CFO generation complete"))
    .catch((err: unknown) => req.log.error({ err: String(err) }, "AI CFO generation failed"))
    .finally(() =>
      lock.release().catch((err: unknown) =>
        req.log.warn({ err: String(err) }, "Failed to release insights advisory lock"),
      ),
    );
});

router.post("/insights/:id/read", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  await db
    .update(aiInsightsTable)
    .set({ readAt: new Date() })
    .where(and(eq(aiInsightsTable.id, id), eq(aiInsightsTable.userId, userId)));
  res.json({ ok: true });
});

router.post("/insights/:id/dismiss", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  await db
    .update(aiInsightsTable)
    .set({ dismissedAt: new Date() })
    .where(and(eq(aiInsightsTable.id, id), eq(aiInsightsTable.userId, userId)));
  res.json({ ok: true });
});

export default router;
