import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, subscriptionsTable } from "@workspace/db";

// DB-gated: dedup/lazy-expiry opiera się na REALNYM unique constraint w subscriptions
// (jak email-service.test.ts). Clerk API zamockowany — testujemy tylko orkiestrację.
const RUN_DB = !!process.env.TEST_DATABASE_URL;

const patchClerkPublicMetadataMock = vi.fn().mockResolvedValue(true);
const fetchAllClerkUsersMock = vi.fn();
vi.mock("../routes/admin.js", () => ({
  patchClerkPublicMetadata: (...args: unknown[]) => patchClerkPublicMetadataMock(...args),
  fetchAllClerkUsers: (...args: unknown[]) => fetchAllClerkUsersMock(...args),
  ADMIN_IDS: ["user_admin"],
}));

import { startTrialForUser, getEffectivePlanStatus, backfillTrialForAllUsers } from "./subscriptions";

const noopLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as import("pino").Logger;
const U = "test_subscriptions_user";
const USERS = [U, "test_subscriptions_b", "user_admin"];

function clerkUser(id: string) {
  return {
    id,
    first_name: "Test",
    last_name: null,
    email_addresses: [{ id: "e1", email_address: `${id}@example.com` }],
    primary_email_address_id: "e1",
    created_at: Date.now(),
    last_sign_in_at: null,
    public_metadata: {},
  };
}

describe.skipIf(!RUN_DB)("subscriptions (trial)", () => {
  beforeEach(async () => {
    patchClerkPublicMetadataMock.mockClear();
    fetchAllClerkUsersMock.mockReset();
    for (const id of USERS) {
      await db.delete(subscriptionsTable).where(eq(subscriptionsTable.userId, id));
    }
  });

  afterAll(async () => {
    for (const id of USERS) {
      await db.delete(subscriptionsTable).where(eq(subscriptionsTable.userId, id));
    }
  });

  describe("startTrialForUser", () => {
    it("pierwsze wywołanie: tworzy wiersz trialing + synchronizuje Clerk plan=pro", async () => {
      const started = await startTrialForUser(U, noopLog);
      expect(started).toBe(true);
      const [row] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.userId, U));
      expect(row.status).toBe("trialing");
      expect(row.plan).toBe("pro");
      expect(row.trialEndsAt).not.toBeNull();
      expect(patchClerkPublicMetadataMock).toHaveBeenCalledWith(U, { plan: "pro" });
    });

    it("drugie wywołanie dla tego samego usera → idempotentne, nic nie zmienia", async () => {
      await startTrialForUser(U, noopLog);
      patchClerkPublicMetadataMock.mockClear();
      const started = await startTrialForUser(U, noopLog);
      expect(started).toBe(false);
      expect(patchClerkPublicMetadataMock).not.toHaveBeenCalled();
      const rows = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.userId, U));
      expect(rows).toHaveLength(1);
    });
  });

  describe("getEffectivePlanStatus", () => {
    it("brak subskrypcji → free/none", async () => {
      const status = await getEffectivePlanStatus(U, noopLog);
      expect(status).toEqual({ plan: "free", status: "none", trialEndsAt: null, daysLeft: null });
    });

    it("trial aktywny → trialing + poprawna liczba dni", async () => {
      await startTrialForUser(U, noopLog, 10);
      const status = await getEffectivePlanStatus(U, noopLog);
      expect(status.plan).toBe("pro");
      expect(status.status).toBe("trialing");
      expect(status.daysLeft).toBeGreaterThanOrEqual(9);
      expect(status.daysLeft).toBeLessThanOrEqual(10);
    });

    it("trial wygasły → leniwie przełącza na canceled/free w DB i w Clerk", async () => {
      await db.insert(subscriptionsTable).values({
        userId: U,
        status: "trialing",
        plan: "pro",
        trialEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // wczoraj
      });
      patchClerkPublicMetadataMock.mockClear();

      const status = await getEffectivePlanStatus(U, noopLog);
      expect(status.plan).toBe("free");
      expect(status.status).toBe("canceled");
      expect(status.daysLeft).toBe(0);
      expect(patchClerkPublicMetadataMock).toHaveBeenCalledWith(U, { plan: "free" });

      const [row] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.userId, U));
      expect(row.status).toBe("canceled");
    });
  });

  describe("backfillTrialForAllUsers", () => {
    it("nadaje trial zwykłym userom, pomija admina, zwraca liczniki", async () => {
      fetchAllClerkUsersMock.mockResolvedValue({
        data: [clerkUser(U), clerkUser("test_subscriptions_b"), clerkUser("user_admin")],
        totalCount: 3,
      });
      const result = await backfillTrialForAllUsers(noopLog);
      expect(result).toEqual({ totalUsers: 3, started: 2, alreadyHadSubscription: 0 });

      const [adminRow] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.userId, "user_admin"));
      expect(adminRow).toBeUndefined();
    });
  });
});
