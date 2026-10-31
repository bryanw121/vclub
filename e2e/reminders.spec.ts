/**
 * Event reminders (#129): Settings → Notifications → Reminders.
 * Picks a lead time, checks it is saved to the account (survives a reload) and
 * the example reminder follows it, then restores the account's original value.
 * The reminder itself is sent by pg_cron on the server (covered by the SQL
 * checks in the PR and the RLS spec), so it isn't waited for here.
 */
import { test, expect, type Page } from '@playwright/test'
import { E2E_BASE_URL as BASE_URL } from './env'
import { gotoReady } from './retry'

const LEADS = [60, 120, 1440] as const

async function selectedLead(page: Page): Promise<number | null> {
  for (const m of LEADS) {
    if ((await page.getByTestId(`reminder-lead-${m}`).getAttribute('aria-selected')) === 'true') return m
  }
  return null
}

test('Reminders: choose how long before an event, saved to the account', async ({ page }) => {
  const card = page.getByTestId('settings-reminders')
  await gotoReady(page, `${BASE_URL}/settings/notifications`, card)
  await expect(page.getByText(/coming soon/i)).toHaveCount(0)

  // A previous run may have turned reminders off: turn them back on.
  if (!(await page.getByTestId('reminder-lead-120').isVisible().catch(() => false))) {
    await page.getByTestId('reminders-toggle').click()
  }
  await expect(page.getByTestId('reminder-lead-120')).toBeVisible({ timeout: 15_000 })

  const original = (await selectedLead(page)) ?? 120
  const next = original === 60 ? 1440 : 60
  try {
    await page.getByTestId(`reminder-lead-${next}`).click()
    await expect(page.getByTestId(`reminder-lead-${next}`)).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('reminder-preview')).toContainText(next === 60 ? 'Starts in 1 hour' : 'Tomorrow at 4:00 PM')

    // Saved on the account, not just on screen.
    await page.reload()
    await expect(page.getByTestId(`reminder-lead-${next}`)).toHaveAttribute('aria-selected', 'true', { timeout: 20_000 })
  } finally {
    await page.getByTestId(`reminder-lead-${original}`).click()
    await expect(page.getByTestId(`reminder-lead-${original}`)).toHaveAttribute('aria-selected', 'true')
  }
})
