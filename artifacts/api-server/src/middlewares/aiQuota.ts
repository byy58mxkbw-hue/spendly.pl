import type { Request, Response, NextFunction } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { AI_MONTHLY_LIMIT, normalizePlan, currentPeriod } from "../lib/ai-plan.js";

// Bramka miesięcznego limitu AI (czat AI CFO + OCR skanowania faktur — wspólna pula).
// Zliczanie w Postgres (ai_usage), reset per miesiąc (klucz period). Montowana ZA
// requireUser (potrzebuje req.userId/req.plan). Zwiększa licznik tylko dla udanych
// odpowiedzi (status < 400), żeby błąd nie zjadał limitu.
export function aiQuota(req: Request, res: Response, next: NextFunction): void {
  const userId = req.userId;
  if (!userId) { next(); return; } // requireUser już to gwarantuje; zabezpieczenie

  const plan = normalizePlan(req.plan);
  const limit = AI_MONTHLY_LIMIT[plan];
  const period = currentPeriod();

  void (async () => {
    if (limit != null) {
      const r = await db.execute(
        sql`SELECT count FROM ai_usage WHERE user_id = ${userId} AND period = ${period}`,
      );
      const used = Number((r.rows[0] as { count: number } | undefined)?.count ?? 0);
      if (used >= limit) {
        res.status(429).json({
          error: `Wyczerpano miesięczny limit AI planu ${plan} (${limit}). Limit odnowi się 1. dnia miesiąca.`,
          plan,
          limit,
          used,
        });
        return;
      }
    }

    // Licz tylko udane wywołania — inkrementacja po wysłaniu odpowiedzi.
    res.on("finish", () => {
      if (res.statusCode >= 400) return;
      db.execute(sql`
        INSERT INTO ai_usage (user_id, period, count, updated_at)
        VALUES (${userId}, ${period}, 1, now())
        ON CONFLICT (user_id, period)
        DO UPDATE SET count = ai_usage.count + 1, updated_at = now()
      `).catch((err) => req.log?.error?.({ err: String(err) }, "ai_usage increment nieudany"));
    });

    next();
  })().catch((err) => {
    // Awaria bramki nie powinna blokować użytkownika — logujemy i przepuszczamy.
    req.log?.error?.({ err: String(err) }, "aiQuota middleware nieudany");
    next();
  });
}
