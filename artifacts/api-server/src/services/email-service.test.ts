import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, emailLogTable } from "@workspace/db";

// DB-gated: dedup logiki opiera się na REALNYM unique constraint w email_log,
// więc test jedzie na test-Postgresie (jak inne testy DB-gated w tym repo).
// Sieć (Resend) zamockowana — testujemy tylko orkiestrację + claim/dedup.
const RUN_DB = !!process.env.TEST_DATABASE_URL;

const sendEmailMock = vi.fn().mockResolvedValue(undefined);
const upsertContactMock = vi.fn().mockResolvedValue(undefined);
vi.mock("./resend-client.js", () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
  upsertContact: (...args: unknown[]) => upsertContactMock(...args),
}));

import { sendWelcomeEmailIfNeeded } from "./email-service";

const noopLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as import("pino").Logger;
const U = "test_email_service_user";

describe.skipIf(!RUN_DB)("sendWelcomeEmailIfNeeded", () => {
  beforeEach(async () => {
    sendEmailMock.mockClear();
    upsertContactMock.mockClear();
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_AUDIENCE_ID;
    await db.delete(emailLogTable).where(eq(emailLogTable.userId, U));
  });

  afterAll(async () => {
    await db.delete(emailLogTable).where(eq(emailLogTable.userId, U));
  });

  it("bez RESEND_API_KEY → nic nie wysyła, nic nie zapisuje", async () => {
    await sendWelcomeEmailIfNeeded(U, "test@example.com", "Test", noopLog);
    expect(sendEmailMock).not.toHaveBeenCalled();
    const rows = await db.select().from(emailLogTable).where(eq(emailLogTable.userId, U));
    expect(rows).toHaveLength(0);
  });

  it("z kluczem: pierwsze wywołanie wysyła i zapisuje email_log", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    await sendWelcomeEmailIfNeeded(U, "test@example.com", "Test", noopLog);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const rows = await db.select().from(emailLogTable).where(eq(emailLogTable.userId, U));
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("welcome");
  });

  it("drugie wywołanie dla tego samego usera → nie wysyła drugi raz (dedup)", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    await sendWelcomeEmailIfNeeded(U, "test@example.com", "Test", noopLog);
    await sendWelcomeEmailIfNeeded(U, "test@example.com", "Test", noopLog);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("błąd wysyłki (sendEmail rzuca) nie wywala funkcji — email_log i tak ma wiersz", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    sendEmailMock.mockRejectedValueOnce(new Error("network down"));
    await expect(sendWelcomeEmailIfNeeded(U, "test@example.com", "Test", noopLog)).resolves.toBeUndefined();
    const rows = await db.select().from(emailLogTable).where(eq(emailLogTable.userId, U));
    expect(rows).toHaveLength(1);
  });

  it("RESEND_AUDIENCE_ID ustawiony → dodaje kontakt do Audience", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_AUDIENCE_ID = "aud_test";
    await sendWelcomeEmailIfNeeded(U, "test@example.com", "Test", noopLog);
    expect(upsertContactMock).toHaveBeenCalledWith("re_test_key", "aud_test", "test@example.com", "Test");
  });

  it("bez adresu e-mail → nic nie wysyła, nic nie zapisuje", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    await sendWelcomeEmailIfNeeded(U, null, "Test", noopLog);
    expect(sendEmailMock).not.toHaveBeenCalled();
    const rows = await db.select().from(emailLogTable).where(eq(emailLogTable.userId, U));
    expect(rows).toHaveLength(0);
  });
});
