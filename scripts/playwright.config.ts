import { defineConfig, devices } from "@playwright/test";
import path from "path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:80";
const AUTH_FILE = path.resolve("scripts/.auth/user.json");

export default defineConfig({
  globalSetup: "./src/e2e/global-setup.ts",
  testDir: "./src/e2e",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    // Reuse Clerk session created by global-setup.ts.
    // If .auth/user.json doesn't exist (no CLERK_TEST_EMAIL set), tests that
    // require auth will redirect to / and fail with a clear error.
    storageState: AUTH_FILE,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
