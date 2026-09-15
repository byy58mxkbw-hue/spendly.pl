import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, emailLogTable, subscriptionsTable } from "@workspace/db";

// DB-gated: dedup opiera się na REALNYM unique constraint w email_log (jak email-service.test.ts).
const RUN_DB = !!process.env.TEST_DATABASE_URL;

const sendEmailMock = vi.fn().mockResolvedValue(undefined);
vi.mock("./resend-client.js", () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
}));

const fetchAllClerkUsersMock = vi.fn();
vi.mock("../routes/admin.js", () => ({
  fetchAllClerkUsers: (...args: unknown[]) => fetchAllClerkUsersMock(...args),
  ADMIN_IDS: ["user_admin"],
}));

import { sendFeedbackRequestToAllUsers, sendTrialAnnouncementToAllUsers } from "./admin-broadcast";

const noopLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as import("pino").Logger;
const USERS = ["test_broadcast_a", "test_broadcast_b", "user_admin"];

function clerkUser(id: string, email: string) {
  return {
    id,
    first_name: "Test",
    last_name: null,
    email_addresses: [{ id: "e1", email_address: email }],
    primary_email_address_id: "e1",
    created_at: Date.now(),
    last_sign_in_at: null,
    public_metadata: {},
  };
}

describe.skipIf(!RUN_DB)("sendFeedbackRequestToAllUsers", () => {
  beforeEach(async () => {
    sendEmailMock.mockClear();
    fetchAllClerkUsersMock.mockReset();
    process.env.RESEND_API_KEY = "re_test_key";
    for (const id of USERS) {
      await db.delete(emailLogTable).where(eq(emailLogTable.userId, id));
    }
  });

  afterAll(async () => {
    delete process.env.RESEND_API_KEY;
    for (const id of USERS) {
      await db.delete(emailLogTable).where(eq(emailLogTable.userId, id));
    }
  });

  it("wysyła do zwykłych userów, pomija admina, zwraca poprawne liczniki", async () => {
    fetchAllClerkUsersMock.mockResolvedValue({
      data: [
        clerkUser("test_broadcast_a", "a@example.com"),
        clerkUser("test_broadcast_b", "b@example.com"),
        clerkUser("user_admin", "admin@example.com"),
      ],
      totalCount: 3,
    });

    const result = await sendFeedbackRequestToAllUsers(noopLog);
    expect(result).toEqual({ totalUsers: 3, sent: 2, skipped: 0, failed: 0 });
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    // Admin nigdy nie powinien trafić jako odbiorca.
    const recipients = sendEmailMock.mock.calls.map((c) => (c[1] as { to: string }).to);
    expect(recipients).not.toContain("admin@example.com");
  }, 10000);

  it("drugie wywołanie pomija już wysłanych (dedup) — kolejni nowi userzy nadal dostają", async () => {
    fetchAllClerkUsersMock.mockResolvedValue({
      data: [clerkUser("test_broadcast_a", "a@example.com"), clerkUser("test_broadcast_b", "b@example.com")],
      totalCount: 2,
    });
    const first = await sendFeedbackRequestToAllUsers(noopLog);
    expect(first.sent).toBe(2);

    sendEmailMock.mockClear();
    const second = await sendFeedbackRequestToAllUsers(noopLog);
    expect(second).toEqual({ totalUsers: 2, sent: 0, skipped: 2, failed: 0 });
    expect(sendEmailMock).not.toHaveBeenCalled();
  }, 10000);

  it("bez RESEND_API_KEY → nic nie wysyła, nie woła Clerka", async () => {
    delete process.env.RESEND_API_KEY;
    const result = await sendFeedbackRequestToAllUsers(noopLog);
    expect(result).toEqual({ totalUsers: 0, sent: 0, skipped: 0, failed: 0 });
    expect(fetchAllClerkUsersMock).not.toHaveBeenCalled();
  });
});

describe.skipIf(!RUN_DB)("sendTrialAnnouncementToAllUsers", () => {
  beforeEach(async () => {
    sendEmailMock.mockClear();
    fetchAllClerkUsersMock.mockReset();
    process.env.RESEND_API_KEY = "re_test_key";
    for (const id of USERS) {
      await db.delete(emailLogTable).where(eq(emailLogTable.userId, id));
      await db.delete(subscriptionsTable).where(eq(subscriptionsTable.userId, id));
    }
  });

  afterAll(async () => {
    delete process.env.RESEND_API_KEY;
    for (const id of USERS) {
      await db.delete(emailLogTable).where(eq(emailLogTable.userId, id));
      await db.delete(subscriptionsTable).where(eq(subscriptionsTable.userId, id));
    }
  });

  it("wysyła do zwykłych userów z realną datą końca triala z bazy, pomija admina", async () => {
    const trialEndsAt = new Date("2026-11-15T12:00:00Z");
    await db.insert(subscriptionsTable).values({ userId: "test_broadcast_a", status: "trialing", plan: "pro", trialEndsAt });

    fetchAllClerkUsersMock.mockResolvedValue({
      data: [
        clerkUser("test_broadcast_a", "a@example.com"),
        clerkUser("user_admin", "admin@example.com"),
      ],
      totalCount: 2,
    });

    const result = await sendTrialAnnouncementToAllUsers(noopLog);
    expect(result).toEqual({ totalUsers: 2, sent: 1, skipped: 0, failed: 0 });
    const html = sendEmailMock.mock.calls[0][1].html as string;
    expect(html).toContain("15 listopada 2026");
  }, 10000);

  it("dedup: drugie wywołanie nie wysyła drugi raz temu samemu userowi", async () => {
    fetchAllClerkUsersMock.mockResolvedValue({
      data: [clerkUser("test_broadcast_a", "a@example.com")],
      totalCount: 1,
    });
    const first = await sendTrialAnnouncementToAllUsers(noopLog);
    expect(first.sent).toBe(1);

    sendEmailMock.mockClear();
    const second = await sendTrialAnnouncementToAllUsers(noopLog);
    expect(second).toEqual({ totalUsers: 1, sent: 0, skipped: 1, failed: 0 });
  }, 10000);
});
