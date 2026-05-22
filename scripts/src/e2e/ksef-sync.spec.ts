/**
 * E2E tests: KSeF synchronisation flows
 *
 * Covers:
 * 1. New user (no KSeF config) on /invoices → sees "Skonfiguruj KSeF" button, no sync button
 * 2. Clicking "Skonfiguruj KSeF" navigates to /settings/ksef
 * 3. After creating KSeF config, /settings/ksef shows the "Synchronizuj od początku" button
 * 4. The "Synchronizuj od początku" button description mentions "od 1 lutego 2026" (NOT the old "365 dni" text)
 * 5. AlertDialog shows updated text: "od 1 lutego 2026", "4–5 zapytań", rate-limit warning
 * 6. Cancelling the dialog keeps the user on /settings/ksef
 *
 * NOTE: These tests require the application to be running (ksef-monitor + api-server)
 * and a valid Clerk session. In CI, run with CLERK_TEST_USER env vars set.
 * Run manually: pnpm --filter @workspace/scripts run e2e
 */

import { test, expect, type Page } from "@playwright/test";

const APP_BASE = process.env.BASE_URL ?? "http://localhost:80";
const KSEF_CONFIG_API = `${APP_BASE}/api/ksef/config`;

async function createKsefConfig(page: Page, nip = "6811060157", token = "test-token-fake12345") {
  const cookies = await page.context().cookies();
  const sessionCookie = cookies.find((c) => c.name.startsWith("__session"));
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (sessionCookie) {
    headers["Cookie"] = `${sessionCookie.name}=${sessionCookie.value}`;
  }
  const resp = await page.request.put(KSEF_CONFIG_API, {
    data: { nip, token },
    headers,
  });
  return resp;
}

test.describe("KSeF sync — invoices page (no config)", () => {
  test("shows Skonfiguruj KSeF button; no sync button visible", async ({ page }) => {
    await page.goto("/invoices");
    await expect(page.getByTestId("btn-configure-ksef")).toBeVisible();
    await expect(page.getByTestId("btn-sync-ksef")).not.toBeVisible();
  });

  test("Skonfiguruj KSeF button navigates to /settings/ksef", async ({ page }) => {
    await page.goto("/invoices");
    await page.getByTestId("btn-configure-ksef").click();
    await expect(page).toHaveURL(/\/settings\/ksef/);
  });
});

test.describe("KSeF sync — settings page (with config)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings/ksef");
    await createKsefConfig(page);
    await page.reload();
  });

  test('shows "Synchronizuj od początku" button with Feb 2026 description', async ({ page }) => {
    const btn = page.getByTestId("btn-sync-from-beginning");
    await expect(btn).toBeVisible();

    const description = page.locator("text=od 1 lutego 2026").first();
    await expect(description).toBeVisible();

    await expect(page.locator("text=ostatnich 365 dni")).not.toBeVisible();
    await expect(page.locator("text=ostatnich 2 lat")).not.toBeVisible();
  });

  test("AlertDialog contains Feb 2026 text and rate-limit warning; Anuluj closes it", async ({
    page,
  }) => {
    await page.getByTestId("btn-sync-from-beginning").click();

    await expect(page.getByRole("alertdialog")).toBeVisible();
    await expect(page.getByRole("alertdialog")).toContainText("Synchronizuj od początku?");
    await expect(page.getByRole("alertdialog")).toContainText("1 lutego 2026");
    await expect(page.getByRole("alertdialog")).toContainText("4–5 zapytań");
    await expect(page.getByRole("alertdialog")).toContainText("KSeF ogranicza liczbę zapytań");

    await expect(page.getByRole("alertdialog")).not.toContainText("25 zapytań");
    await expect(page.getByRole("alertdialog")).not.toContainText("ostatnich 2 lat");

    await page.getByRole("button", { name: "Anuluj" }).click();
    await expect(page.getByRole("alertdialog")).not.toBeVisible();
    await expect(page).toHaveURL(/\/settings\/ksef/);
  });
});
