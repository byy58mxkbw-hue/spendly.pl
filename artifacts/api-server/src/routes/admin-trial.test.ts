import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

// Test wyłącznie bramki isAdmin + przekazania wyniku serwisu — sama logika
// ma własne testy w subscriptions.test.ts / admin-broadcast.test.ts (DB-gated).
const backfillTrialForAllUsersMock = vi.fn();
vi.mock("../services/subscriptions.js", () => ({
  backfillTrialForAllUsers: (...args: unknown[]) => backfillTrialForAllUsersMock(...args),
}));

const sendFeedbackRequestToAllUsersMock = vi.fn();
const sendTrialAnnouncementToAllUsersMock = vi.fn();
vi.mock("../services/admin-broadcast.js", () => ({
  sendFeedbackRequestToAllUsers: (...args: unknown[]) => sendFeedbackRequestToAllUsersMock(...args),
  sendTrialAnnouncementToAllUsers: (...args: unknown[]) => sendTrialAnnouncementToAllUsersMock(...args),
}));

const authState = vi.hoisted(() => ({ userId: "user_not_admin" }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAuth: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: authState.userId, sessionClaims: { publicMetadata: {} } }),
  clerkClient: { users: { getUser: async () => ({ emailAddresses: [], primaryEmailAddressId: null }) } },
}));

describe("POST /api/admin/backfill-trial + /api/admin/announce-trial", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    process.env.ADMIN_USER_IDS = "user_the_admin";
    const app = (await import("../app")).default;
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server?.close();
    delete process.env.ADMIN_USER_IDS;
  });

  it("backfill-trial: nie-admin → 403, serwis nie wywołany", async () => {
    authState.userId = "user_not_admin";
    const res = await fetch(`${baseUrl}/api/admin/backfill-trial`, { method: "POST" });
    expect(res.status).toBe(403);
    expect(backfillTrialForAllUsersMock).not.toHaveBeenCalled();
  });

  it("backfill-trial: admin → 200 z podsumowaniem serwisu", async () => {
    authState.userId = "user_the_admin";
    backfillTrialForAllUsersMock.mockResolvedValueOnce({ totalUsers: 5, started: 4, alreadyHadSubscription: 1 });
    const res = await fetch(`${baseUrl}/api/admin/backfill-trial`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { totalUsers: number; started: number; alreadyHadSubscription: number };
    expect(body).toEqual({ totalUsers: 5, started: 4, alreadyHadSubscription: 1 });
  });

  it("announce-trial: nie-admin → 403, serwis nie wywołany", async () => {
    authState.userId = "user_not_admin";
    const res = await fetch(`${baseUrl}/api/admin/announce-trial`, { method: "POST" });
    expect(res.status).toBe(403);
    expect(sendTrialAnnouncementToAllUsersMock).not.toHaveBeenCalled();
  });

  it("announce-trial: admin → 200 z podsumowaniem serwisu", async () => {
    authState.userId = "user_the_admin";
    sendTrialAnnouncementToAllUsersMock.mockResolvedValueOnce({ totalUsers: 5, sent: 4, skipped: 1, failed: 0 });
    const res = await fetch(`${baseUrl}/api/admin/announce-trial`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { totalUsers: number; sent: number; skipped: number; failed: number };
    expect(body).toEqual({ totalUsers: 5, sent: 4, skipped: 1, failed: 0 });
  });
});
