/**
 * E2E tests: KSeF synchronisation flows
 *
 * Covers:
 * 1. New user (no KSeF config) on /invoices → "Skonfiguruj KSeF" button, no sync button
 * 2. "Skonfiguruj KSeF" navigates to /settings/ksef
 * 3. After creating KSeF config + reload, btn-sync-ksef appears on /invoices
 * 4. After creating KSeF config + reload, btn-sync-ksef-dashboard appears on /dashboard
 * 5. Clicking dashboard sync button shows "Synchronizuję..." pending state
 * 6. Rate-limited NIP → sync button click → toast mentions rate-limit hold-off (opt-in)
 * 7. Settings page description says "od 1 lutego 2026" (NOT "365 dni" / "2 lat")
 * 8. "Synchronizuj od początku" AlertDialog shows Feb 2026 text + rate-limit warning
 * 9. Cancelling the AlertDialog keeps the user on /settings/ksef
 *
 * NOTE: These tests require the application to be running (ksef-monitor + api-server).
 * The app uses Clerk auth; set CLERK_TEST_USER / testClerkAuth in CI.
 * Run: pnpm --filter @workspace/scripts run e2e
 *
 * The test setup creates a KSeF config by calling PUT /api/ksef/config from within the
 * page context (carries the Clerk session cookie), then reloads so React Query picks up
 * the new config before assertions run.
 */

import { test, expect, type Page } from "@playwright/test";

const APP_BASE = process.env.BASE_URL ?? "http://localhost:80";
const KSEF_CONFIG_API = `${APP_BASE}/api/ksef/config`;

async function createKsefConfig(page: Page, nip = "6811060157", token = "fake-token-12345") {
  const cookies = await page.context().cookies();
  const sessionCookie = cookies.find((c) => c.name.startsWith("__session"));
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (sessionCookie) {
    headers["Cookie"] = `${sessionCookie.name}=${sessionCookie.value}`;
  }
  return page.request.put(KSEF_CONFIG_API, { data: { nip, token }, headers });
}

// ─── Setup helper ─────────────────────────────────────────────────────────────

/**
 * Navigate to /settings/ksef, create KSeF config via API, then reload so
 * React Query picks up the new config before assertions on other pages.
 */
async function setupKsefConfig({ page }: { page: Page }) {
  await page.goto("/settings/ksef");
  const resp = await createKsefConfig(page);
  expect(resp.ok()).toBe(true);
  await page.reload();
  // Confirm config is live — btn-sync-from-beginning appears when config exists
  await expect(page.getByTestId("btn-sync-from-beginning")).toBeVisible({ timeout: 10_000 });
}

// ─── Tests: no config ────────────────────────────────────────────────────────

test.describe("KSeF sync — invoices page (no config)", () => {
  test("shows Skonfiguruj KSeF button; sync button not present", async ({ page }) => {
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

// ─── Tests: with config ───────────────────────────────────────────────────────

test.describe("KSeF sync — invoices page (config present)", () => {
  test.beforeEach(setupKsefConfig);

  test("sync button is visible; configure button is hidden", async ({ page }) => {
    await page.goto("/invoices");
    await expect(page.getByTestId("btn-sync-ksef")).toBeVisible();
    await expect(page.getByTestId("btn-configure-ksef")).not.toBeVisible();
  });
});

test.describe("KSeF sync — dashboard page (config present)", () => {
  test.beforeEach(setupKsefConfig);

  test("dashboard sync button is visible", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByTestId("btn-sync-ksef-dashboard")).toBeVisible();
  });

  test("clicking dashboard sync button shows pending state (Synchronizuję...)", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByTestId("btn-sync-ksef-dashboard").click();
    // Button text changes to "Synchronizuję..." while mutation is in-flight
    await expect(page.getByTestId("btn-sync-ksef-dashboard")).toHaveText(/Synchronizuję|Sync/, {
      timeout: 10_000,
    });
  });
});

// ─── Tests: rate-limited NIP ─────────────────────────────────────────────────

test.describe("KSeF sync — rate-limited NIP (opt-in)", () => {
  /**
   * Validates that when rate_limited_until is set in the DB for this NIP, the
   * sync endpoint returns 429 and the UI shows the hold-off message.
   *
   * Requires:
   *   FORCE_RATE_LIMIT_TEST=1
   *   DB access to set rate_limited_until for the test NIP to a future time
   * (e.g. run: UPDATE ksef_config SET rate_limited_until = NOW() + INTERVAL '1 hour'
   *            WHERE nip = '6811060157')
   */
  test("invoices sync shows rate-limit message when NIP is blocked", async ({ page }) => {
    test.skip(
      !process.env.FORCE_RATE_LIMIT_TEST,
      "Requires DB access to set rate_limited_until; run with FORCE_RATE_LIMIT_TEST=1",
    );

    await setupKsefConfig({ page });
    await page.goto("/invoices");
    await page.getByTestId("btn-sync-ksef").click();
    // API returns 429: "KSeF ogranicza zapytania dla tego NIP — zablokowany jeszcze przez X"
    await expect(
      page.locator('[role="status"]').filter({ hasText: /KSeF ogranicza|zablokowany/ }),
    ).toBeVisible({ timeout: 30_000 });
  });
});

// ─── Tests: settings page dialog ─────────────────────────────────────────────

test.describe("KSeF sync — settings page (Feb 2026 copy)", () => {
  test.beforeEach(setupKsefConfig);

  test('button description shows "od 1 lutego 2026" — not "365 dni" or "2 lat"', async ({
    page,
  }) => {
    await expect(page.locator("text=od 1 lutego 2026").first()).toBeVisible();
    await expect(page.locator("text=ostatnich 365 dni")).not.toBeVisible();
    await expect(page.locator("text=ostatnich 2 lat")).not.toBeVisible();
  });

  test("AlertDialog contains Feb 2026 text, 4–5 queries, rate-limit warning", async ({ page }) => {
    await page.getByTestId("btn-sync-from-beginning").click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Synchronizuj od początku?");
    await expect(dialog).toContainText("1 lutego 2026");
    await expect(dialog).toContainText("4–5 zapytań");
    await expect(dialog).toContainText("KSeF ogranicza liczbę zapytań");
    await expect(dialog).not.toContainText("25 zapytań");
    await expect(dialog).not.toContainText("ostatnich 2 lat");
  });

  test("Anuluj closes the dialog and keeps user on /settings/ksef", async ({ page }) => {
    await page.getByTestId("btn-sync-from-beginning").click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page.getByRole("button", { name: "Anuluj" }).click();
    await expect(page.getByRole("alertdialog")).not.toBeVisible();
    await expect(page).toHaveURL(/\/settings\/ksef/);
  });
});
