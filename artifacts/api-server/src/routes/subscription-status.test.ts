import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

// Test wyłącznie routingu/autoryzacji — logika stanu ma własny DB-gated test
// w subscriptions.test.ts.
const getEffectivePlanStatusMock = vi.fn();
vi.mock("../services/subscriptions.js", () => ({
  getEffectivePlanStatus: (...args: unknown[]) => getEffectivePlanStatusMock(...args),
}));

const authState = vi.hoisted(() => ({ userId: "test_sub_status_user" }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAuth: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: authState.userId, sessionClaims: { publicMetadata: {} } }),
  clerkClient: { users: { getUser: async () => ({ emailAddresses: [], primaryEmailAddressId: null }) } },
}));

describe("GET /api/subscription/status", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = (await import("../app")).default;
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server?.close();
  });

  it("zwraca stan z serwisu dla zalogowanego usera", async () => {
    getEffectivePlanStatusMock.mockResolvedValueOnce({ plan: "pro", status: "trialing", trialEndsAt: "2026-10-15T00:00:00.000Z", daysLeft: 12 });
    const res = await fetch(`${baseUrl}/api/subscription/status`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ plan: "pro", status: "trialing", trialEndsAt: "2026-10-15T00:00:00.000Z", daysLeft: 12 });
    expect(getEffectivePlanStatusMock).toHaveBeenCalledWith("test_sub_status_user", expect.anything());
  });
});
