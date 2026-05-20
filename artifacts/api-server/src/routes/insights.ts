import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { aiInsightsTable } from "@workspace/db/schema";
import { eq, and, isNull, desc } from "drizzle-orm";
import { generateInsights } from "../services/insights-generator";

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

// Track in-progress generation per user to avoid duplicate runs
const generatingUsers = new Set<string>();

router.post("/insights/generate", async (req, res): Promise<void> => {
  const userId = req.userId!;

  if (generatingUsers.has(userId)) {
    res.status(202).json({ status: "running" });
    return;
  }

  // Respond immediately so the browser doesn't time out
  res.status(202).json({ status: "started" });

  generatingUsers.add(userId);
  generateInsights(userId, req.log)
    .then((count) => req.log.info({ count }, "AI CFO generation complete"))
    .catch((err: unknown) => req.log.error({ err: String(err) }, "AI CFO generation failed"))
    .finally(() => generatingUsers.delete(userId));
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
