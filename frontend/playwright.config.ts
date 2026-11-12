import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], permissions: ["notifications"] },
    },
  ],
  webServer: [
    {
      command: "npm run dev:test -w backend",
      cwd: "..",
      url: "http://localhost:3000/api/v1/push/vapid-public-key",
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "npm run dev -w frontend",
      cwd: "..",
      url: "http://localhost:5173",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
