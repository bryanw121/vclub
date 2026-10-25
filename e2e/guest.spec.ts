import { expect, test } from '@playwright/test'
import { E2E_BASE_URL as BASE_URL } from './env'

// Runs without the shared session (see the `guest` project in playwright.config.ts).
test.describe('guest browsing', () => {
  test('events load without signing in', async ({ page }) => {
    await page.goto(`${BASE_URL}/`)
    await expect(page).toHaveURL(`${BASE_URL}/`)
    await expect(page.getByTestId('filter-all').first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('header-sign-in').first()).toBeVisible()
    // "Mine" needs an account.
    await expect(page.getByTestId('filter-mine')).toHaveCount(0)
  })

  test('chat and profile ask the guest to sign in', async ({ page }) => {
    await page.goto(`${BASE_URL}/chat`)
    await expect(page.getByTestId('sign-in-prompt').first()).toBeVisible({ timeout: 20_000 })
    await page.goto(`${BASE_URL}/profile`)
    await expect(page.getByTestId('sign-in-prompt').first()).toBeVisible({ timeout: 20_000 })
  })

  test('account-only routes send guests to login, and they can keep browsing', async ({ page }) => {
    await page.goto(`${BASE_URL}/host`)
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 })
    await page.getByTestId('continue-as-guest').click()
    await expect(page).toHaveURL(`${BASE_URL}/`, { timeout: 20_000 })
    await expect(page.getByTestId('filter-all').first()).toBeVisible({ timeout: 20_000 })
  })

  test('signing in from a page and backing out returns to that page', async ({ page }) => {
    await page.goto(`${BASE_URL}/clubs`)
    await page.getByTestId('header-sign-in').first().click()
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 })
    await page.getByTestId('continue-as-guest').click()
    await expect(page).toHaveURL(`${BASE_URL}/clubs`, { timeout: 20_000 })
  })
})
