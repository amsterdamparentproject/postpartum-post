import { defineConfig, devices } from "@playwright/test";
import path from "path";
import dotenv from "dotenv";

// Load .env.local so Supabase/Stripe keys are available to test helpers, then
// .env.test for anything test-only that .env.local doesn't set (E2E_DSA_CODE).
// dotenv never overrides a variable that is already set, so .env.local wins.
dotenv.config({ path: path.resolve(__dirname, ".env.local") });
dotenv.config({ path: path.resolve(__dirname, ".env.test") });

// E2e tests always run the app on port 3001 to avoid colliding with a dev
// server that may be running on 3000. Override the base URL for this process
// so test helpers (magic links, optin URLs, API calls) point to the right port.
process.env.NEXT_PUBLIC_BASE_URL = "http://localhost:3001";

export default defineConfig({
  testDir: "./e2e",
  globalTeardown: "./e2e/global-teardown.ts",
  timeout: 60_000,         // Stripe checkout can be slow
  expect: { timeout: 10_000 },
  fullyParallel: false,    // Sequential — avoids DB/Stripe collisions between tests
  retries: process.env.CI ? 1 : 0,
  reporter: [["html", { open: "never" }], ["list"]],

  use: {
    baseURL: "http://localhost:3001",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],

  webServer: {
    command: "yarn dev -p 3001",
    url: "http://localhost:3001",
    reuseExistingServer: true,   // Don't restart if already running
    timeout: 120_000,
  },
});
