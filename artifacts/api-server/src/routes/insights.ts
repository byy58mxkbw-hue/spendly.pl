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

router.post("/insights/generate", async (req, res): Promise<void> => {
  const userId = req.userId!;
  try {
    const count = await generateInsights(userId, req.log);
    res.json({ generated: count });
  } catch (err) {
    req.log.error({ err: String(err) }, "AI CFO generation failed");
    res.status(500).json({ error: "Nie udało się wygenerować insightów." });
  }
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
