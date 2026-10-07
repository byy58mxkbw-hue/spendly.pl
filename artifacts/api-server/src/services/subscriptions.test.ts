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

import { startTrialForUser, getEffectivePlanStatus, backfillTrialForAllUsers, extendTrialForAllUsers, resyncClerkPlanForAllSubscriptions } from "./subscriptions";

const noopLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as import("pino").Logger;
const DAY_MS = 24 * 60 * 60 * 1000;
const U = "test_subscriptions_user";
const USERS = [U, "test_subscriptions_b", "test_subscriptions_c", "user_admin"];

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
      expect(patchClerkPublicMetadataMock).toHaveBeenCalledWith(U, { plan: "pro" }, noopLog);
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
      expect(patchClerkPublicMetadataMock).toHaveBeenCalledWith(U, { plan: "free" }, noopLog);

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

  describe("extendTrialForAllUsers", () => {
    it("przesuwa trwający trial, wznawia wygasły, daje nowy bez subskrypcji, pomija admina; drugi przebieg = no-op", async () => {
      patchClerkPublicMetadataMock.mockReset();
      patchClerkPublicMetadataMock.mockResolvedValue(true);
      const runningEnds = new Date(Date.now() + 5 * DAY_MS);
      await db.insert(subscriptionsTable).values([
        { userId: U, status: "trialing", plan: "pro", trialEndsAt: runningEnds },
        { userId: "test_subscriptions_b", status: "canceled", plan: "pro", trialEndsAt: new Date(Date.now() - 3 * DAY_MS) },
      ]);
      fetchAllClerkUsersMock.mockResolvedValue({
        data: [clerkUser(U), clerkUser("test_subscriptions_b"), clerkUser("test_subscriptions_c"), clerkUser("user_admin")],
        totalCount: 4,
      });

      const first = await extendTrialForAllUsers(noopLog, 30);
      expect(first).toEqual({ totalUsers: 4, extended: 1, reactivated: 1, started: 1, skipped: 0, clerkFailed: 0 });

      const [a] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.userId, U));
      expect(a.trialEndsAt!.getTime()).toBe(runningEnds.getTime() + 30 * DAY_MS);
      const [b] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.userId, "test_subscriptions_b"));
      expect(b.status).toBe("trialing");
      expect(b.trialEndsAt!.getTime()).toBeGreaterThan(Date.now() + 29 * DAY_MS);
      expect(patchClerkPublicMetadataMock).toHaveBeenCalledWith("test_subscriptions_b", { plan: "pro" }, noopLog);
      const [adminRow] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.userId, "user_admin"));
      expect(adminRow).toBeUndefined();

      const second = await extendTrialForAllUsers(noopLog, 30);
      expect(second).toMatchObject({ extended: 0, reactivated: 0, started: 0, skipped: 3 });
      const [a2] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.userId, U));
      expect(a2.trialEndsAt!.getTime()).toBe(a.trialEndsAt!.getTime());
    });

    it("nie rusza płatnej subskrypcji", async () => {
      patchClerkPublicMetadataMock.mockReset();
      patchClerkPublicMetadataMock.mockResolvedValue(true);
      await db.insert(subscriptionsTable).values({ userId: U, status: "active", plan: "pro", provider: "tpay" });
      fetchAllClerkUsersMock.mockResolvedValue({ data: [clerkUser(U)], totalCount: 1 });
      const result = await extendTrialForAllUsers(noopLog, 30);
      expect(result).toMatchObject({ extended: 0, reactivated: 0, started: 0, skipped: 1 });
      expect(patchClerkPublicMetadataMock).not.toHaveBeenCalled();
    });
  });

  describe("resyncClerkPlanForAllSubscriptions", () => {
    it("wymusza sync planu wg realnego statusu (trialing→plan, canceled→free), liczy błędy", async () => {
      await db.insert(subscriptionsTable).values([
        { userId: U, status: "trialing", plan: "pro", trialEndsAt: new Date(Date.now() + DAY_MS) },
        { userId: "test_subscriptions_b", status: "canceled", plan: "pro" },
      ]);
      patchClerkPublicMetadataMock.mockReset();
      patchClerkPublicMetadataMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

      const result = await resyncClerkPlanForAllSubscriptions(noopLog);
      expect(result).toEqual({ totalSubscriptions: 2, synced: 1, failed: 1 });
      expect(patchClerkPublicMetadataMock).toHaveBeenCalledWith(U, { plan: "pro" }, noopLog);
      expect(patchClerkPublicMetadataMock).toHaveBeenCalledWith("test_subscriptions_b", { plan: "free" }, noopLog);
    });
  });
});
