import { test, expect } from '@playwright/test'

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:8081'

test.describe('Own profile', () => {
  test('Cheers count matches its detail screen and survives a refresh', async ({ page }) => {
    await page.goto(`${BASE_URL}/profile`)

    const profileCount = page.getByTestId('profile-cheers-count')
    await expect(profileCount).toBeVisible({ timeout: 20_000 })
    await expect(profileCount).toHaveText(/^\d+$/)
    const expectedCount = await profileCount.textContent()

    await page.reload()
    await expect(profileCount).toHaveText(expectedCount!, { timeout: 20_000 })

    await page.goto(`${BASE_URL}/settings/cheers`)
    const detailCount = page.getByTestId('cheers-received-count')
    await expect(detailCount).toBeVisible({ timeout: 20_000 })
    await expect(detailCount).toHaveText(expectedCount!)
  })
})
