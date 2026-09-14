import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

// Test wyłącznie bramki isAdmin + przekazania wyniku serwisu — sama logika
// wysyłki ma własny test w admin-broadcast.test.ts (DB-gated).
const sendFeedbackRequestToAllUsersMock = vi.fn();
vi.mock("../services/admin-broadcast.js", () => ({
  sendFeedbackRequestToAllUsers: (...args: unknown[]) => sendFeedbackRequestToAllUsersMock(...args),
}));

const authState = vi.hoisted(() => ({ userId: "user_not_admin" }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAuth: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: authState.userId, sessionClaims: { publicMetadata: {} } }),
  clerkClient: { users: { getUser: async () => ({ emailAddresses: [], primaryEmailAddressId: null }) } },
}));

describe("POST /api/admin/send-feedback-email", () => {
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

  it("nie-admin → 403, serwis nie wywołany", async () => {
    authState.userId = "user_not_admin";
    const res = await fetch(`${baseUrl}/api/admin/send-feedback-email`, { method: "POST" });
    expect(res.status).toBe(403);
    expect(sendFeedbackRequestToAllUsersMock).not.toHaveBeenCalled();
  });

  it("admin → 200 z podsumowaniem serwisu", async () => {
    authState.userId = "user_the_admin";
    sendFeedbackRequestToAllUsersMock.mockResolvedValueOnce({ totalUsers: 5, sent: 4, skipped: 1, failed: 0 });
    const res = await fetch(`${baseUrl}/api/admin/send-feedback-email`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { totalUsers: number; sent: number; skipped: number; failed: number };
    expect(body).toEqual({ totalUsers: 5, sent: 4, skipped: 1, failed: 0 });
  });
});
