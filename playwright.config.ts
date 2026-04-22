import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 1,
  reporter: [
    ['list'],                                    // test names + pass/fail as they run
    ['html', { open: 'never' }],                 // full HTML report saved to playwright-report/
  ],
  use: {
    baseURL: 'http://localhost:8081',
    // Expo web runs in a desktop browser context
    ...devices['Desktop Chrome'],
    // Most interactions need force due to React Native Web's pointer-event layering
    actionTimeout: 15_000,
    screenshot: 'only-on-failure',               // saved to test-results/ on failure
    trace: 'on-first-retry',                     // captured on the retry after a flaky failure
    video: 'off',                                // screenshots + traces are sufficient for debugging
  },
  // Assumes the Expo dev server is already running (`npx expo start --web`)
  // To auto-start it, uncomment the webServer block below:
  // webServer: {
  //   command: 'npx expo start --web --port 8081',
  //   port: 8081,
  //   reuseExistingServer: true,
  // },
})
