import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { Webhook } from "svix";

// Test wyłącznie ROUTINGU/weryfikacji podpisu webhooka — efekt (wysyłka maila)
// ma własny test w email-service.test.ts (DB-gated).
const sendWelcomeEmailIfNeededMock = vi.fn().mockResolvedValue(undefined);
vi.mock("../services/email-service.js", () => ({
  sendWelcomeEmailIfNeeded: (...args: unknown[]) => sendWelcomeEmailIfNeededMock(...args),
}));

const TEST_SECRET = "whsec_" + Buffer.from("test-secret-dla-webhooka-01234567").toString("base64");

function signedHeaders(payload: string, secret: string): Record<string, string> {
  const wh = new Webhook(secret);
  const msgId = "msg_test_123";
  const timestamp = new Date();
  const signature = wh.sign(msgId, timestamp, payload);
  return {
    "svix-id": msgId,
    "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
    "svix-signature": signature,
    "content-type": "application/json",
  };
}

describe("POST /api/webhooks/clerk", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    process.env.CLERK_WEBHOOK_SECRET = TEST_SECRET;
    const app = (await import("../app")).default;
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server?.close();
    delete process.env.CLERK_WEBHOOK_SECRET;
  });

  beforeEach(() => {
    sendWelcomeEmailIfNeededMock.mockClear();
  });

  const userCreatedPayload = JSON.stringify({
    type: "user.created",
    data: {
      id: "user_abc123",
      first_name: "Kasia",
      primary_email_address_id: "idn_1",
      email_addresses: [{ id: "idn_1", email_address: "kasia@example.com" }],
    },
  });

  it("poprawny podpis + user.created → 200 i woła sendWelcomeEmailIfNeeded z danymi z eventu", async () => {
    const headers = signedHeaders(userCreatedPayload, TEST_SECRET);
    const res = await fetch(`${baseUrl}/api/webhooks/clerk`, { method: "POST", headers, body: userCreatedPayload });
    expect(res.status).toBe(200);
    // Handler odpowiada 200 i dopiero potem (fire-and-forget) woła serwis — dajemy mu chwilę.
    await new Promise((r) => setTimeout(r, 20));
    expect(sendWelcomeEmailIfNeededMock).toHaveBeenCalledWith("user_abc123", "kasia@example.com", "Kasia", expect.anything());
  });

  it("nieprawidłowy podpis → 400, serwis nie wywołany", async () => {
    const headers = signedHeaders(userCreatedPayload, TEST_SECRET);
    headers["svix-signature"] = "v1,cG9kcm9iaW9ueQ=="; // poprawny format, zła treść
    const res = await fetch(`${baseUrl}/api/webhooks/clerk`, { method: "POST", headers, body: userCreatedPayload });
    expect(res.status).toBe(400);
    expect(sendWelcomeEmailIfNeededMock).not.toHaveBeenCalled();
  });

  it("brak nagłówków Svix → 400", async () => {
    const res = await fetch(`${baseUrl}/api/webhooks/clerk`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: userCreatedPayload,
    });
    expect(res.status).toBe(400);
    expect(sendWelcomeEmailIfNeededMock).not.toHaveBeenCalled();
  });

  it("inny typ zdarzenia (nie user.created) → 200, serwis nie wywołany", async () => {
    const payload = JSON.stringify({ type: "user.updated", data: { id: "user_abc123" } });
    const headers = signedHeaders(payload, TEST_SECRET);
    const res = await fetch(`${baseUrl}/api/webhooks/clerk`, { method: "POST", headers, body: payload });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 20));
    expect(sendWelcomeEmailIfNeededMock).not.toHaveBeenCalled();
  });

  it("brak CLERK_WEBHOOK_SECRET w env → 503", async () => {
    delete process.env.CLERK_WEBHOOK_SECRET;
    const headers = signedHeaders(userCreatedPayload, TEST_SECRET);
    const res = await fetch(`${baseUrl}/api/webhooks/clerk`, { method: "POST", headers, body: userCreatedPayload });
    expect(res.status).toBe(503);
    process.env.CLERK_WEBHOOK_SECRET = TEST_SECRET;
  });
});
