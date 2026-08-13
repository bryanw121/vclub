import { expect, test } from '@playwright/test'

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:8081'

test('restores the shared e2e session in a fresh browser context', async ({ page }) => {
  await page.goto(`${BASE_URL}/`)
  await expect(page).toHaveURL(`${BASE_URL}/`, { timeout: 20_000 })
  await expect(page.getByText('Events', { exact: true }).first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('filter-all').first()).toBeVisible({ timeout: 20_000 })
})
