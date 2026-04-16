import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:8081',
    // Expo web runs in a desktop browser context
    ...devices['Desktop Chrome'],
    // Most interactions need force due to React Native Web's pointer-event layering
    actionTimeout: 15_000,
  },
  // Assumes the Expo dev server is already running (`npx expo start --web`)
  // To auto-start it, uncomment the webServer block below:
  // webServer: {
  //   command: 'npx expo start --web --port 8081',
  //   port: 8081,
  //   reuseExistingServer: true,
  // },
})
