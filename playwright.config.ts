import { defineConfig, devices } from "@playwright/test";
import path from "path";
import dotenv from "dotenv";

// Load .env.local so Supabase/Stripe keys are available to test helpers
dotenv.config({ path: path.resolve(__dirname, ".env.local") });

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,         // Stripe checkout can be slow
  expect: { timeout: 10_000 },
  fullyParallel: false,    // Sequential — avoids DB/Stripe collisions between tests
  retries: process.env.CI ? 1 : 0,
  reporter: [["html", { open: "never" }], ["list"]],

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],

  webServer: {
    command: "yarn dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,   // Don't restart if already running
    timeout: 120_000,
  },
});
