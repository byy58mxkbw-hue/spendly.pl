/**
 * E2E tests: KSeF synchronisation flows
 *
 * Auth:  Tests run authenticated via Clerk.  In real CI, configure a global setup
 *        (see global-setup.ts) that signs in with CLERK_TEST_EMAIL/CLERK_TEST_PASSWORD
 *        and stores the auth state in .auth/user.json so every test starts logged-in.
 *        Locally, the tests use a fresh Clerk sign-up per describe block (each user
 *        is unique to avoid state collisions across runs).
 *
 * Sync mocking: POST /api/ksef/sync returns a text/event-stream. Several tests mock
 *        this endpoint with Playwright's page.route() so results are deterministic and
 *        fast without a real KSeF token.
 *
 * Run: pnpm --filter @workspace/scripts run e2e
 */

import { test, expect, type Page } from "@playwright/test";

const APP_BASE = process.env.BASE_URL ?? "http://localhost:80";
const KSEF_CONFIG_API = `${APP_BASE}/api/ksef/config`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function createKsefConfig(page: Page, nip = "6811060157", token = "fake-token-12345") {
  const cookies = await page.context().cookies();
  const sessionCookie = cookies.find((c) => c.name.startsWith("__session"));
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (sessionCookie) headers["Cookie"] = `${sessionCookie.name}=${sessionCookie.value}`;
  return page.request.put(KSEF_CONFIG_API, { data: { nip, token }, headers });
}

/** Navigate to /settings/ksef, create KSeF config via API, reload (so React Query updates). */
async function setupKsefConfig({ page }: { page: Page }) {
  await page.goto("/settings/ksef");
  const resp = await createKsefConfig(page);
  expect(resp.ok()).toBe(true);
  await page.reload();
  await expect(page.getByTestId("btn-sync-from-beginning")).toBeVisible({ timeout: 10_000 });
}

/**
 * Intercept POST /api/ksef/sync and return a mocked SSE stream.
 * Enables deterministic toast/state assertions without a real KSeF token.
 */
async function mockSyncEndpoint(
  page: Page,
  opts: { imported?: number; pending?: number; failed?: number; error?: string } = {},
) {
  await page.route("**/api/ksef/sync", async (route) => {
    if (opts.error) {
      // Simulate a 401/error response as JSON (checked by the hook's !response.ok branch)
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: opts.error }),
      });
      return;
    }
    const imported = opts.imported ?? 0;
    const pending = opts.pending ?? 0;
    const failed = opts.failed ?? 0;
    const events = [
      `data: ${JSON.stringify({ type: "scanning", windowsDone: 1, windowsTotal: 1 })}\n\n`,
      `data: ${JSON.stringify({ type: "done", imported, pending, failed, errors: [] })}\n\n`,
    ].join("");
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: events,
    });
  });
}

// ─── Group A: no config ───────────────────────────────────────────────────────

test.describe("KSeF — no config", () => {
  test("invoices: Skonfiguruj KSeF visible, sync button absent", async ({ page }) => {
    await page.goto("/invoices");
    await expect(page.getByTestId("btn-configure-ksef")).toBeVisible();
    await expect(page.getByTestId("btn-sync-ksef")).not.toBeVisible();
  });

  test("invoices: Skonfiguruj KSeF navigates to settings", async ({ page }) => {
    await page.goto("/invoices");
    await page.getByTestId("btn-configure-ksef").click();
    await expect(page).toHaveURL(/\/settings\/ksef/);
  });

  // NOTE: When no config exists the sync button is hidden entirely, so there is no
  // "sync click → error toast" path available in the UI. The backend guard
  // (status 400, "Brak konfiguracji KSeF…") is a server-side failsafe for direct API
  // callers, not a UI-reachable code path.
});

// ─── Group B: with config — invoices page ─────────────────────────────────────

test.describe("KSeF — invoices (config present)", () => {
  test.beforeEach(setupKsefConfig);

  test("sync button visible, configure button hidden", async ({ page }) => {
    await page.goto("/invoices");
    await expect(page.getByTestId("btn-sync-ksef")).toBeVisible();
    await expect(page.getByTestId("btn-configure-ksef")).not.toBeVisible();
  });

  test("sync (mocked — no imports): shows 'Wszystkie faktury są aktualne' toast", async ({
    page,
  }) => {
    await mockSyncEndpoint(page, { imported: 0, pending: 0, failed: 0 });
    await page.goto("/invoices");
    await page.getByTestId("btn-sync-ksef").click();
    await expect(
      page.locator('[role="status"]').filter({ hasText: "Wszystkie faktury są aktualne" }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("sync (mocked — 3 imported): shows 'Zaimportowano 3 nowych faktur' toast", async ({
    page,
  }) => {
    await mockSyncEndpoint(page, { imported: 3, pending: 0, failed: 0 });
    await page.goto("/invoices");
    await page.getByTestId("btn-sync-ksef").click();
    await expect(
      page.locator('[role="status"]').filter({ hasText: /Zaimportowano 3 nowych faktur/ }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("sync (mocked — auth error): shows 'Błąd synchronizacji' toast", async ({ page }) => {
    await mockSyncEndpoint(page, { error: "KSeF odrzucił token — sprawdź ustawienia." });
    await page.goto("/invoices");
    await page.getByTestId("btn-sync-ksef").click();
    await expect(
      page.locator('[role="status"]').filter({ hasText: /Błąd synchronizacji/ }),
    ).toBeVisible({ timeout: 15_000 });
  });
});

// ─── Group C: with config — dashboard page ────────────────────────────────────

test.describe("KSeF — dashboard (config present)", () => {
  test.beforeEach(setupKsefConfig);

  test("sync button visible on dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByTestId("btn-sync-ksef-dashboard")).toBeVisible();
  });

  test("sync click shows 'Synchronizuję...' pending state", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByTestId("btn-sync-ksef-dashboard").click();
    await expect(page.getByTestId("btn-sync-ksef-dashboard")).toHaveText(/Synchronizuję/, {
      timeout: 10_000,
    });
  });
});

// ─── Group D: rate-limited NIP ────────────────────────────────────────────────

test.describe("KSeF — rate-limited NIP", () => {
  test.beforeEach(setupKsefConfig);

  /**
   * Seed the rate limit via Playwright route mock: intercept POST /api/ksef/sync and return
   * a 429 response with the same message format as the real backend.
   * This test does NOT require a live DB mutation or FORCE_RATE_LIMIT_TEST env var.
   */
  test("invoices: 429 rate-limit response → 'KSeF ogranicza' toast", async ({ page }) => {
    await page.route("**/api/ksef/sync", (route) =>
      route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          error: "KSeF ogranicza zapytania dla tego NIP — zablokowany jeszcze przez ok. 59 minut. Spróbuj ponownie później.",
          retryAfterSeconds: 3540,
        }),
      }),
    );
    await page.goto("/invoices");
    await page.getByTestId("btn-sync-ksef").click();
    await expect(
      page.locator('[role="status"]').filter({ hasText: /KSeF ogranicza|zablokowany/ }),
    ).toBeVisible({ timeout: 15_000 });
  });
});

// ─── Group E: settings page dialog ───────────────────────────────────────────

test.describe("KSeF — settings dialog (Feb 2026 copy)", () => {
  test.beforeEach(setupKsefConfig);

  test('button description says "od 1 lutego 2026"; no "365 dni" or "2 lat"', async ({ page }) => {
    await expect(page.locator("text=od 1 lutego 2026").first()).toBeVisible();
    await expect(page.locator("text=ostatnich 365 dni")).not.toBeVisible();
    await expect(page.locator("text=ostatnich 2 lat")).not.toBeVisible();
  });

  test("AlertDialog: Feb 2026 body, 4–5 queries, rate-limit amber, no old text", async ({
    page,
  }) => {
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

  test("Anuluj closes dialog, stays on /settings/ksef", async ({ page }) => {
    await page.getByTestId("btn-sync-from-beginning").click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page.getByRole("button", { name: "Anuluj" }).click();
    await expect(page.getByRole("alertdialog")).not.toBeVisible();
    await expect(page).toHaveURL(/\/settings\/ksef/);
  });
});
