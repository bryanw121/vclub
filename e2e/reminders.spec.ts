/**
 * Event reminders (#129): Settings → Notifications → Reminders.
 * Picks a lead time, checks it is saved to the account (survives a reload) and
 * the example reminder follows it, then restores the account's original value.
 * The reminder itself is sent by pg_cron on the server (covered by the SQL
 * checks in the PR and the RLS spec), so it isn't waited for here.
 */
import { test, expect, type Page, type Response } from '@playwright/test'
import { E2E_BASE_URL as BASE_URL } from './env'
import { gotoReady } from './retry'

const LEADS = [60, 120, 1440] as const

/** The settings read (GET user_settings) the screen makes on load. */
function settingsLoaded(page: Page): Promise<Response> {
  return page.waitForResponse(r => r.url().includes('/rest/v1/user_settings') && r.request().method() === 'GET', { timeout: 30_000 })
}

/** The save a lead-time chip makes (an upsert into user_settings carrying the lead, not the seen-banner upsert). */
function settingsSaved(page: Page): Promise<Response> {
  return page.waitForResponse(
    r => r.url().includes('/rest/v1/user_settings') && r.request().method() === 'POST' && (r.request().postData() ?? '').includes('reminder_lead_minutes'),
    { timeout: 30_000 },
  )
}

/**
 * The lead time the screen shows, read from the example reminder (it is built
 * from the saved lead). The chips don't expose their selected state on web:
 * react-native-web 0.21 drops `accessibilityState`, so there is no aria-selected.
 */
const PREVIEW: Record<(typeof LEADS)[number], RegExp> = { 60: /Starts in 1 hour/, 120: /Starts in 2 hours/, 1440: /Tomorrow at/ }

async function selectedLead(page: Page): Promise<(typeof LEADS)[number] | null> {
  const text = (await page.getByTestId('reminder-preview').textContent()) ?? ''
  return LEADS.find(m => PREVIEW[m].test(text)) ?? null
}

async function expectLead(page: Page, m: (typeof LEADS)[number], timeout = 5_000): Promise<void> {
  await expect(page.getByTestId('reminder-preview')).toContainText(PREVIEW[m], { timeout })
}

test('Reminders: choose how long before an event, saved to the account', async ({ page }) => {
  const card = page.getByTestId('settings-reminders')
  // Wait for the saved settings, not just the card: the card renders with the
  // profile, and the lead time arrives in a second request. Deciding before
  // both are in read a default state and toggled reminders the wrong way.
  const loaded = settingsLoaded(page)
  await gotoReady(page, `${BASE_URL}/settings/notifications`, card)
  await loaded
  await expect(page.getByText(/coming soon/i)).toHaveCount(0)

  // A previous run may have turned reminders off: turn them back on.
  const toggle = page.getByTestId('reminders-toggle')
  await expect(toggle).toBeVisible()
  if (!(await page.getByTestId('reminder-lead-120').isVisible())) {
    await toggle.click()
  }
  await expect(page.getByTestId('reminder-lead-120')).toBeVisible({ timeout: 15_000 })

  const original: (typeof LEADS)[number] = (await selectedLead(page)) ?? 120
  const next = original === 60 ? 1440 : 60
  try {
    const saved = settingsSaved(page)
    await page.getByTestId(`reminder-lead-${next}`).click()
    await expectLead(page, next)
    // Reload only once the save is done, or the reload can drop it.
    expect((await saved).ok()).toBe(true)

    // Saved on the account, not just on screen.
    const reloaded = settingsLoaded(page)
    await page.reload()
    await reloaded
    await expectLead(page, next, 20_000)
  } finally {
    if ((await selectedLead(page)) !== original) {
      const restored = settingsSaved(page)
      await page.getByTestId(`reminder-lead-${original}`).click()
      expect((await restored).ok()).toBe(true)
      await expectLead(page, original, 15_000)
    }
  }
})
