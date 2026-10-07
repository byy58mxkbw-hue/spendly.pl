import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { inArray } from "drizzle-orm";
import { db, userSettingsTable } from "@workspace/db";

// Powitanie pokazywane raz na konto: flaga w user_settings (nie localStorage).
// DB-gated jak inne testy route z prawdziwą bazą.
const RUN_DB = !!process.env.TEST_DATABASE_URL;

const authState = vi.hoisted(() => ({ userId: "test_welcome_a" }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAuth: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: authState.userId, sessionClaims: { publicMetadata: {} } }),
  clerkClient: { users: { getUser: async () => ({ emailAddresses: [], primaryEmailAddressId: null }) } },
}));

const USERS = ["test_welcome_a", "test_welcome_b"];

describe.skipIf(!RUN_DB)("GET/POST /api/onboarding/welcome", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    await db.delete(userSettingsTable).where(inArray(userSettingsTable.userId, USERS));
    const app = (await import("../app")).default;
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await db.delete(userSettingsTable).where(inArray(userSettingsTable.userId, USERS));
    server?.close();
  });

  const seen = async (userId: string) => {
    authState.userId = userId;
    const res = await fetch(`${baseUrl}/api/onboarding/welcome`);
    return ((await res.json()) as { seen: boolean }).seen;
  };

  it("nowe konto → seen=false; po zapisie → true, tylko dla tego konta", async () => {
    expect(await seen("test_welcome_a")).toBe(false);

    authState.userId = "test_welcome_a";
    const res = await fetch(`${baseUrl}/api/onboarding/welcome/seen`, { method: "POST" });
    expect(res.status).toBe(200);

    expect(await seen("test_welcome_a")).toBe(true);
    expect(await seen("test_welcome_b")).toBe(false);
  });

  it("zapis nie rusza zgody na benchmark (upsert tylko flagi)", async () => {
    await db.insert(userSettingsTable).values({ userId: "test_welcome_b", benchmarkOptIn: false });
    authState.userId = "test_welcome_b";
    await fetch(`${baseUrl}/api/onboarding/welcome/seen`, { method: "POST" });
    const [row] = await db.select().from(userSettingsTable).where(inArray(userSettingsTable.userId, ["test_welcome_b"]));
    expect(row.benchmarkOptIn).toBe(false);
    expect(row.welcomeSeenAt).not.toBeNull();
  });
});
