import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 20_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3211", trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH
          ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
          : {},
      },
    },
  ],
  webServer: {
    command: "npm start",
    env: { PORT: "3211" },
    url: "http://127.0.0.1:3211/api/health",
    reuseExistingServer: false,
    timeout: 15_000,
  },
});
