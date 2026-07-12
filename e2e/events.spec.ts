/**
 * Events E2E — requires a web build served on port 8081 (CI) or the Expo dev
 * server (`npx expo start --web --port 8081`) running locally.
 * Run: npx playwright test e2e/events.spec.ts
 *
 * Test account: bryanw121 / password
 * Relies on seeded upcoming events in the shared Supabase project, tagged so the
 * feed's type filters have data:
 *   - "Friday Night Open Play"    → Open Play, unlimited capacity (always joinable)
 *   - "Monday Night Round Robin"  → Tournament
 * These are regular events (not tournament-table rows), so they route to
 * /event/[id] with the Join/Leave RSVP flow.
 */

import { test, expect, Page } from '@playwright/test'

const BASE_URL = 'http://localhost:8081'
const OPEN_PLAY_EVENT = 'Friday Night Open Play'
const TOURNAMENT_EVENT = 'Monday Night Round Robin'

async function login(page: Page) {
  await page.goto(`${BASE_URL}/login`)
  await page.waitForTimeout(2000)
  await page.getByRole('textbox').nth(0).fill('bryanw121')
  await page.getByRole('textbox').nth(1).fill('password')
  await page.getByText('Sign in', { exact: true }).click()
  await page.waitForURL(`${BASE_URL}/`)
  // Events feed loads on focus — give the month query time to resolve.
  await page.waitForTimeout(2500)
}

test.describe('Events', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    page.on('console', msg => {
      if (msg.type() === 'error') console.error(`[browser] ${msg.text()}`)
    })
    page.on('pageerror', err => console.error(`[page error] ${err.message}`))
    console.log(`→ starting: ${testInfo.title}`)
    await login(page)
  })

  test('feed lists upcoming events with filter chips', async ({ page }) => {
    await expect(page.getByText(OPEN_PLAY_EVENT).first()).toBeVisible({ timeout: 20000 })
    await expect(page.getByTestId('filter-all').first()).toBeVisible()
    await expect(page.getByTestId('filter-tournament').first()).toBeVisible()
  })

  test('filtering by tag narrows the feed', async ({ page }) => {
    await expect(page.getByText(OPEN_PLAY_EVENT).first()).toBeVisible({ timeout: 20000 })

    // Tournament filter: tournament event shown, open-play event gone.
    await page.getByTestId('filter-tournament').first().click()
    await expect(page.getByText(TOURNAMENT_EVENT).first()).toBeVisible()
    await expect(page.getByText(OPEN_PLAY_EVENT)).toHaveCount(0)

    // Open Play filter: open-play event back, tournament event gone.
    await page.getByTestId('filter-open_play').first().click()
    await expect(page.getByText(OPEN_PLAY_EVENT).first()).toBeVisible()
    await expect(page.getByText(TOURNAMENT_EVENT)).toHaveCount(0)

    // All: both visible again.
    await page.getByTestId('filter-all').first().click()
    await expect(page.getByText(TOURNAMENT_EVENT).first()).toBeVisible()
    await expect(page.getByText(OPEN_PLAY_EVENT).first()).toBeVisible()
  })

  // Safety net for the event-detail refactor (splitting the four tab bodies into
  // sibling components): drives every tab and asserts each renders its landmark,
  // so an extraction that breaks a tab's JSX or prop wiring fails CI.
  test('event detail — all four tabs render and switch', async ({ page }) => {
    await page.getByText(OPEN_PLAY_EVENT).first().click()
    await page.waitForURL(/\/event\//, { timeout: 20000 })

    // Details is the default tab (quick-stats strip).
    await expect(page.getByText('Duration').first()).toBeVisible({ timeout: 20000 })

    // People tab — "Going" roster heading.
    await page.getByTestId('event-tab-people').first().click()
    await expect(page.getByText('Going', { exact: true }).first()).toBeVisible({ timeout: 15000 })

    // Discussion tab — the comment composer.
    await page.getByTestId('event-tab-discussion').first().click()
    await expect(page.getByPlaceholder('Add a comment…').first()).toBeVisible({ timeout: 15000 })

    // Cheers tab — seeded events are upcoming, so the not-yet-available gate shows.
    await page.getByTestId('event-tab-cheers').first().click()
    await expect(page.getByText(/Cheers open after the event ends/).first()).toBeVisible({ timeout: 15000 })

    // Back to Details.
    await page.getByTestId('event-tab-details').first().click()
    await expect(page.getByText('Duration').first()).toBeVisible({ timeout: 15000 })
  })

  test('open an event, then join and leave it', async ({ page }) => {
    await page.getByText(OPEN_PLAY_EVENT).first().click()
    await page.waitForURL(/\/event\//, { timeout: 20000 })

    const joinBtn = page.getByText('Join event', { exact: true })
    const leaveBtn = page.getByText('Leave event', { exact: true })

    // State-tolerant: a prior run may have left the account attending.
    if (await leaveBtn.isVisible().catch(() => false)) {
      await leaveBtn.click()
      await expect(joinBtn).toBeVisible({ timeout: 15000 })
    }

    // Join → button flips to Leave, Details tab shows "You're going".
    await joinBtn.click()
    await expect(leaveBtn).toBeVisible({ timeout: 15000 })
    await expect(page.getByText("You're going").first()).toBeVisible()

    // Leave → back to Join (cleans up shared-account state).
    await leaveBtn.click()
    await expect(joinBtn).toBeVisible({ timeout: 15000 })
  })

  test('host adds a +1 guest, sees it on the roster, then removes it', async ({ page }) => {
    // bryanw121 hosts the seed events, so host-only UI (+1 button, guest
    // remove X) renders for the e2e account. Removal doubles as cleanup so
    // the shared DB doesn't accumulate guests across runs.
    const guestFirst = 'E2eguest'
    const guestLast = `X${Date.now()}`

    await page.getByText(OPEN_PLAY_EVENT).first().click()
    await page.waitForURL(/\/event\//, { timeout: 20000 })

    // Open the +1 modal from the sticky footer (Details tab is active by default).
    await page.getByLabel('Add a +1 guest').first().click()
    await expect(page.getByText('Add a +1')).toBeVisible({ timeout: 10000 })
    await page.getByPlaceholder('First name').fill(guestFirst)
    await page.getByPlaceholder('Last name').fill(guestLast)
    await page.getByText('Add', { exact: true }).click()

    // Guest card renders on the People tab as "First L." with an "…'s +1" note.
    await page.getByTestId('event-tab-people').first().click()
    const guestCardName = `${guestFirst} ${guestLast.charAt(0)}.`
    await expect(page.getByText(guestCardName).first()).toBeVisible({ timeout: 15000 })

    // Remove the guest (X → "Remove guest?" confirm modal) — cleans up.
    await page.getByLabel(`Remove guest ${guestFirst} ${guestLast}`).first().click()
    await expect(page.getByText('Remove guest?')).toBeVisible({ timeout: 10000 })
    // Modal buttons arm after a short ghost-click guard delay.
    await page.waitForTimeout(500)
    await page.getByText('Remove', { exact: true }).click()
    await expect(page.getByText(guestCardName)).toHaveCount(0, { timeout: 15000 })
  })
})
