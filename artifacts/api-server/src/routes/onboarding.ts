import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db, userSettingsTable } from "@workspace/db";

const router: IRouter = Router();

// Powitanie po założeniu konta (components/welcome-onboarding.tsx) — pokazywane RAZ na
// konto. Flaga w user_settings, nie w localStorage, żeby nie wracało na nowym urządzeniu.
router.get("/onboarding/welcome", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const result = await db.execute<{ welcome_seen_at: string | null }>(sql`
    SELECT welcome_seen_at FROM user_settings WHERE user_id = ${userId} LIMIT 1
  `);
  res.json({ seen: result.rows[0]?.welcome_seen_at != null });
});

router.post("/onboarding/welcome/seen", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const now = new Date();
  await db
    .insert(userSettingsTable)
    .values({ userId, welcomeSeenAt: now })
    .onConflictDoUpdate({ target: userSettingsTable.userId, set: { welcomeSeenAt: now, updatedAt: now } });
  res.json({ seen: true });
});

export default router;
