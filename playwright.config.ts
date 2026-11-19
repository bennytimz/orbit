import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests for the demo path. AI (Gemini) and Buffer responses are mocked
 * inside the test server by tests/e2e/mocks/preload.mjs, so no test calls a
 * live AI or Buffer API or uses any quota. Supabase is real: global setup
 * creates a throwaway user and global teardown deletes it (and, by cascade,
 * everything it created). Run with `npm run test:e2e` (builds first).
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    timezoneId: "Africa/Lagos",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } } }],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      NODE_OPTIONS: "--import ./tests/e2e/mocks/preload.mjs",
      // Fail closed: even if the interceptor were missing, these fake keys could never use real quota.
      GEMINI_API_KEY: "e2e-not-a-real-key",
      TRANSCRIPTION_API_KEY: "",
    },
  },
});
