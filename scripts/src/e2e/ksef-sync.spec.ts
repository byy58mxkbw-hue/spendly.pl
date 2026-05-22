/**
 * E2E tests: KSeF synchronisation flows
 *
 * Auth: Tests use the Clerk session stored in .auth/user.json by global-setup.ts.
 *       Set CLERK_TEST_EMAIL + CLERK_TEST_PASSWORD and run once to bootstrap.
 *       When .auth/user.json is absent (no credentials configured), protected
 *       routes redirect to / and tests fail with a clear assertion error.
 *
 * Sync mocking: POST /api/ksef/sync is intercepted with page.route() so toast
 *       assertions are deterministic and fast without a real KSeF token.
 *       - Invoices page uses a raw fetch + SSE reader → mock returns text/event-stream.
 *       - Dashboard page uses the generated Orval mutation (customFetch) which
 *         calls response.json() → mock returns application/json KsefSyncResult.
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

/** Navigate to /settings/ksef, create KSeF config via API, reload so React Query updates. */
async function setupKsefConfig({ page }: { page: Page }) {
  await page.goto("/settings/ksef");
  const resp = await createKsefConfig(page);
  expect(resp.ok()).toBe(true);
  await page.reload();
  // Config is live once btn-sync-from-beginning appears
  await expect(page.getByTestId("btn-sync-from-beginning")).toBeVisible({ timeout: 10_000 });
}

/**
 * Mock POST /api/ksef/sync with an SSE response.
 * Used by the Invoices page (raw fetch + SSE reader).
 */
async function mockSyncSse(
  page: Page,
  opts: { imported?: number; pending?: number; failed?: number } = {},
) {
  const imported = opts.imported ?? 0;
  const pending = opts.pending ?? 0;
  const failed = opts.failed ?? 0;
  const body = [
    `data: ${JSON.stringify({ type: "scanning", windowsDone: 1, windowsTotal: 1 })}\n\n`,
    `data: ${JSON.stringify({ type: "done", imported, pending, failed, errors: [] })}\n\n`,
  ].join("");
  await page.route("**/api/ksef/sync", (route) =>
    route.fulfill({ status: 200, contentType: "text/event-stream", body }),
  );
}

/**
 * Mock POST /api/ksef/sync with a JSON response.
 * Used by the Dashboard page (Orval mutation → response.json()).
 */
async function mockSyncJson(
  page: Page,
  opts: { imported?: number; pending?: number; failed?: number; status?: number; error?: string } = {},
) {
  const status = opts.status ?? 200;
  if (opts.error) {
    await page.route("**/api/ksef/sync", (route) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({ error: opts.error, retryAfterSeconds: opts.status === 429 ? 3540 : undefined }),
      }),
    );
    return;
  }
  const body = {
    imported: opts.imported ?? 0,
    pending: opts.pending ?? 0,
    failed: opts.failed ?? 0,
    errors: [],
  };
  await page.route("**/api/ksef/sync", (route) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) }),
  );
}

// ─── Group A: no config ───────────────────────────────────────────────────────

test.describe("KSeF — no config", () => {
  test("invoices: Skonfiguruj KSeF visible; sync button absent", async ({ page }) => {
    await page.goto("/invoices");
    await expect(page.getByTestId("btn-configure-ksef")).toBeVisible();
    await expect(page.getByTestId("btn-sync-ksef")).not.toBeVisible();
  });

  test("invoices: Skonfiguruj KSeF navigates to /settings/ksef", async ({ page }) => {
    await page.goto("/invoices");
    await page.getByTestId("btn-configure-ksef").click();
    await expect(page).toHaveURL(/\/settings\/ksef/);
  });

  // NOTE: When no config exists the sync button is hidden entirely so the
  // "no config → sync click → error toast" UI path is unreachable by design.
  // The server-side guard (400 + "Brak konfiguracji KSeF…") is a failsafe for
  // direct API callers, not a UI code path.
});

// ─── Group B: with config — invoices page ─────────────────────────────────────

test.describe("KSeF — invoices (config present)", () => {
  test.beforeEach(setupKsefConfig);

  test("sync button visible; configure button hidden", async ({ page }) => {
    await page.goto("/invoices");
    await expect(page.getByTestId("btn-sync-ksef")).toBeVisible();
    await expect(page.getByTestId("btn-configure-ksef")).not.toBeVisible();
  });

  test("mocked sync (0 imported) → 'Wszystkie faktury są aktualne' toast", async ({ page }) => {
    await mockSyncSse(page, { imported: 0 });
    await page.goto("/invoices");
    await page.getByTestId("btn-sync-ksef").click();
    await expect(
      page.locator('[role="status"]').filter({ hasText: "Wszystkie faktury są aktualne" }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("mocked sync (3 imported) → 'Zaimportowano 3' toast", async ({ page }) => {
    await mockSyncSse(page, { imported: 3 });
    await page.goto("/invoices");
    await page.getByTestId("btn-sync-ksef").click();
    await expect(
      page.locator('[role="status"]').filter({ hasText: /Zaimportowano 3/ }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("mocked 429 rate-limit → 'KSeF ogranicza' toast", async ({ page }) => {
    await page.route("**/api/ksef/sync", (route) =>
      route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          error:
            "KSeF ogranicza zapytania dla tego NIP — zablokowany jeszcze przez ok. 59 minut. Spróbuj ponownie później.",
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

  test("mocked auth error → 'Błąd synchronizacji' toast", async ({ page }) => {
    await page.route("**/api/ksef/sync", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "KSeF odrzucił token — sprawdź ustawienia." }),
      }),
    );
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

  test("mocked sync success (2 imported) → 'Synchronizacja zakończona' toast", async ({
    page,
  }) => {
    // Dashboard uses the Orval mutation (response.json()) not SSE, so mock returns JSON.
    await mockSyncJson(page, { imported: 2, pending: 0, failed: 0 });
    await page.goto("/dashboard");
    await page.getByTestId("btn-sync-ksef-dashboard").click();
    await expect(
      page.locator('[role="status"]').filter({ hasText: "Synchronizacja zakończona" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.locator('[role="status"]').filter({ hasText: /Zaimportowano: 2/ }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("mocked 429 rate-limit on dashboard → 'Błąd synchronizacji' toast with KSeF message", async ({
    page,
  }) => {
    await mockSyncJson(page, {
      status: 429,
      error:
        "KSeF ogranicza zapytania dla tego NIP — zablokowany jeszcze przez ok. 59 minut. Spróbuj ponownie później.",
    });
    await page.goto("/dashboard");
    await page.getByTestId("btn-sync-ksef-dashboard").click();
    await expect(
      page.locator('[role="status"]').filter({ hasText: "Błąd synchronizacji" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.locator('[role="status"]').filter({ hasText: /KSeF ogranicza|zablokowany/ }),
    ).toBeVisible({ timeout: 5_000 });
  });
});

// ─── Group D: settings dialog (Feb 2026 copy) ────────────────────────────────

test.describe("KSeF — settings dialog (Feb 2026 copy)", () => {
  test.beforeEach(setupKsefConfig);

  test('description shows "od 1 lutego 2026"; no "365 dni" or "2 lat"', async ({ page }) => {
    await expect(page.locator("text=od 1 lutego 2026").first()).toBeVisible();
    await expect(page.locator("text=ostatnich 365 dni")).not.toBeVisible();
    await expect(page.locator("text=ostatnich 2 lat")).not.toBeVisible();
  });

  test("AlertDialog: Feb 2026, 4–5 queries, rate-limit amber; no old text", async ({ page }) => {
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

  test("Anuluj closes dialog; stays on /settings/ksef", async ({ page }) => {
    await page.getByTestId("btn-sync-from-beginning").click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page.getByRole("button", { name: "Anuluj" }).click();
    await expect(page.getByRole("alertdialog")).not.toBeVisible();
    await expect(page).toHaveURL(/\/settings\/ksef/);
  });
});
