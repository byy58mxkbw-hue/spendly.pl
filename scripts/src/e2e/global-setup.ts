/**
 * Playwright global auth setup for CI environments.
 *
 * In CI, set these environment variables and uncomment the code below:
 *   CLERK_TEST_EMAIL    — test account email
 *   CLERK_TEST_PASSWORD — test account password
 *
 * Then update playwright.config.ts:
 *   globalSetup: './src/e2e/global-setup.ts',
 *   use: { storageState: '.auth/user.json' }
 *
 * The setup signs in once and stores cookies/localStorage so all spec files
 * run as an authenticated user without repeating the login flow.
 */

// import { chromium } from "@playwright/test";
// import path from "path";
// import fs from "fs";
//
// export default async function globalSetup() {
//   const { CLERK_TEST_EMAIL, CLERK_TEST_PASSWORD } = process.env;
//   if (!CLERK_TEST_EMAIL || !CLERK_TEST_PASSWORD) {
//     throw new Error("CLERK_TEST_EMAIL and CLERK_TEST_PASSWORD must be set for Playwright auth setup");
//   }
//
//   const browser = await chromium.launch();
//   const page = await browser.newPage();
//
//   await page.goto("http://localhost:80/sign-in");
//   await page.getByLabel("Email address").fill(CLERK_TEST_EMAIL);
//   await page.getByRole("button", { name: "Continue" }).click();
//   await page.getByLabel("Password").fill(CLERK_TEST_PASSWORD);
//   await page.getByRole("button", { name: "Continue" }).click();
//   await page.waitForURL("**/dashboard");
//
//   fs.mkdirSync(path.resolve(".auth"), { recursive: true });
//   await page.context().storageState({ path: path.resolve(".auth/user.json") });
//   await browser.close();
// }

export default async function globalSetup() {
  // Auth setup is opt-in via environment variables; no-op by default.
  // Individual spec files handle per-test Clerk sign-up using fresh users.
}
