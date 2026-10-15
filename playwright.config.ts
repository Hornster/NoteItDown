import { defineConfig, devices } from "@playwright/test";
import { loadEnv } from "vite";

// Playwright does not read .env; load SUPABASE_URL/SUPABASE_KEY the same way vitest.config.ts does.
Object.assign(process.env, loadEnv("test", process.cwd(), ""));

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  globalSetup: "./tests/e2e/global-setup.ts",
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:4322",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // On demand only (`npm run test:screenshots`); `test:e2e` pins --project=chromium so CI never runs it.
    { name: "screenshots", testMatch: "screenshots/**/*.shot.ts", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    // --ignore-lock: astro allows one tracked preview per project; don't collide with a preview on 4321.
    command: "npm run preview -- --port 4322 --ignore-lock",
    // Astro auto-backgrounds preview when it detects an AI agent; Playwright must own a foreground process.
    env: { ASTRO_PREVIEW_BACKGROUND: "1" },
    url: "http://localhost:4322",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
