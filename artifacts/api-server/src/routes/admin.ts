import { Router, type IRouter } from "express";
import { clerkClient } from "@clerk/express";

const router: IRouter = Router();

router.get("/admin/users", async (req, res): Promise<void> => {
  const result = await clerkClient.users.getUserList({
    limit: 200,
    orderBy: "-created_at",
  });

  const users = result.data.map((u) => ({
    id: u.id,
    firstName: u.firstName ?? null,
    lastName: u.lastName ?? null,
    email: u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress
      ?? u.emailAddresses[0]?.emailAddress
      ?? null,
    createdAt: u.createdAt,
    lastSignInAt: u.lastSignInAt ?? null,
  }));

  res.json({ users, total: result.totalCount });
});

export default router;
