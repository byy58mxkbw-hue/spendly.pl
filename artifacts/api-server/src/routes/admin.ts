import { Router, type IRouter } from "express";
import { clerkClient } from "@clerk/express";

const router: IRouter = Router();

const ADMIN_IDS = (process.env.ADMIN_USER_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

router.get("/admin/users", async (req, res): Promise<void> => {
  if (ADMIN_IDS.length > 0 && !ADMIN_IDS.includes(req.userId!)) {
    res.status(403).json({ error: "Brak dostępu." });
    return;
  }

  const result = await clerkClient.users.getUserList({
    limit: 200,
    orderBy: "-created_at",
  });

  const users = result.data.map((u) => ({
    id: u.id,
    firstName: u.firstName ?? null,
    lastName: u.lastName ?? null,
    email:
      u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)
        ?.emailAddress ??
      u.emailAddresses[0]?.emailAddress ??
      null,
    createdAt: u.createdAt,
    lastSignInAt: u.lastSignInAt ?? null,
  }));

  res.json({ users, total: result.totalCount });
});

export default router;
