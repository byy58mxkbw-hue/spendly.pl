import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

// Skan wielostronicowy: walidacja wejścia (bez wywołania AI — odrzucamy przed nim).
// DB-gated jak pozostałe testy route'ów (app łączy się z bazą przy imporcie).
const RUN_DB = !!process.env.TEST_DATABASE_URL;

const authState = vi.hoisted(() => ({ userId: "test_scan_pages" }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAuth: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: authState.userId, sessionClaims: { publicMetadata: {} } }),
  clerkClient: { users: { getUser: async () => ({ emailAddresses: [], primaryEmailAddressId: null }) } },
}));

const page = (mimeType = "image/jpeg") => ({ imageBase64: "aGVsbG8=", mimeType });

describe.skipIf(!RUN_DB)("POST /invoices/scan-receipt: strony", () => {
  let server: Server;
  let baseUrl: string;
  const post = (body: unknown) =>
    fetch(`${baseUrl}/api/invoices/scan-receipt`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  beforeAll(async () => {
    const app = (await import("../app")).default;
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server?.close());

  it("bez zdjęcia → 400", async () => {
    const res = await post({ pages: [] });
    expect(res.status).toBe(400);
  });

  it("więcej niż 6 stron → 400", async () => {
    const res = await post({ pages: Array.from({ length: 7 }, () => page()) });
    expect(res.status).toBe(400);
  });

  it("nieobsługiwany format jednej ze stron → 400", async () => {
    const res = await post({ pages: [page(), page("application/pdf")] });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/format/);
  });
});
