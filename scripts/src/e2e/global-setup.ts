/**
 * Playwright global setup — Clerk authentication.
 *
 * Signs in once with CLERK_TEST_EMAIL / CLERK_TEST_PASSWORD, stores the
 * browser auth state in .auth/user.json so every spec runs as an authenticated
 * user without repeating the sign-in flow.
 *
 * Required env vars (for CI or local runs):
 *   CLERK_TEST_EMAIL     — e-mail of an existing Clerk test account
 *   CLERK_TEST_PASSWORD  — password for that account
 *
 * Usage in playwright.config.ts:
 *   globalSetup:  './src/e2e/global-setup.ts',
 *   use: { storageState: '.auth/user.json' }
 *
 * When CLERK_TEST_EMAIL is not set the function exits early (e.g. in CI dry
 * runs without credentials).  Tests that hit protected routes will then
 * redirect to / and skip with a clear message.
 */

import { chromium, type FullConfig } from "@playwright/test";
import fs from "fs";
import path from "path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:80";
const AUTH_FILE = path.resolve("scripts/.auth/user.json");

export default async function globalSetup(_config: FullConfig) {
  const email = process.env.CLERK_TEST_EMAIL;
  const password = process.env.CLERK_TEST_PASSWORD;

  if (!email || !password) {
    // No credentials → skip. Protected-route tests will redirect to / and fail
    // gracefully, making it obvious auth was not configured.
    console.warn(
      "[global-setup] CLERK_TEST_EMAIL / CLERK_TEST_PASSWORD not set — skipping auth setup.",
      "Tests against protected routes will fail until credentials are provided.",
    );
    return;
  }

  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/sign-in`);

  // Clerk's rendered sign-in form (Email Address → Continue → Password → Continue)
  const emailInput = page.locator('input[name="identifier"]');
  await emailInput.waitFor({ state: "visible", timeout: 15_000 });
  await emailInput.fill(email);
  await page.getByRole("button", { name: "Continue" }).click();

  const passwordInput = page.locator('input[name="password"]');
  await passwordInput.waitFor({ state: "visible", timeout: 10_000 });
  await passwordInput.fill(password);
  await page.getByRole("button", { name: "Continue" }).click();

  // Wait until Clerk redirects away from /sign-in (auth is complete)
  await page.waitForURL((url) => !url.pathname.includes("/sign-in"), { timeout: 15_000 });

  await context.storageState({ path: AUTH_FILE });
  await browser.close();

  console.log(`[global-setup] Clerk auth saved to ${AUTH_FILE}`);
}
