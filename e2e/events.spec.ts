/**
 * Events E2E — requires a web build served on port 8081 (CI) or the Expo dev
 * server (`npx expo start --web --port 8081`) running locally.
 * Run: npx playwright test e2e/events.spec.ts
 *
 * Test account: bryanw121 / password
 *
 * Fixtures: beforeAll creates two relative-dated events hosted by bryanw121
 * (`[e2e] Open Play`, `[e2e] Tournament`) and afterAll deletes them. No
 * permanent shared seed events are required in the live DB.
 */

import { test, expect, Page } from '@playwright/test'
import {
  OPEN_PLAY_EVENT,
  TOURNAMENT_EVENT,
  seedEventFixtures,
  cleanupEventFixtures,
} from './eventsFixtures'

const BASE_URL = 'http://localhost:8081'

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

test.describe.configure({ mode: 'serial' })

test.describe('Events', () => {
  test.beforeAll(async () => {
    await seedEventFixtures()
  })

  test.afterAll(async () => {
    await cleanupEventFixtures()
  })

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

    // Cheers tab — fixtures are upcoming, so the not-yet-available gate shows.
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
    // bryanw121 hosts the fixtures, so host-only UI (+1 button, guest remove X)
    // renders for the e2e account. Removal doubles as cleanup so the shared DB
    // doesn't accumulate guests across runs.
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

  // Regression guard for #34: editing an event and going back showed the OLD
  // title. The detail screen's focus refetch was gated purely on a 30s staleness
  // window, and this whole round-trip finishes in a couple of seconds — so the
  // window masked the change. Deliberately no reload and no pull-to-refresh
  // anywhere in this test; that's the entire point.
  test('editing an event shows the new title on the detail page without a refresh', async ({ page }) => {
    const editedTitle = `[e2e] Edited ${Date.now()}`

    await page.getByText(OPEN_PLAY_EVENT).first().click()
    await page.waitForURL(/\/event\//, { timeout: 20000 })
    // Assert on the detail page's own hero title, not a bare getByText: the feed
    // stays mounted behind the pushed screen, so `getByText(title).first()`
    // resolves to the hidden feed card and never becomes visible.
    const heroTitle = page.getByTestId('event-hero-title')
    await expect(heroTitle).toHaveText(OPEN_PLAY_EVENT, { timeout: 20000 })
    const eventUrl = page.url()

    async function renameTo(next: string) {
      await page.getByTestId('event-edit-button').first().click()
      await page.waitForURL(/\/host\?edit=/, { timeout: 20000 })
      const titleField = page.getByPlaceholder('Friday Night Round Robin')
      await expect(titleField).toBeVisible({ timeout: 20000 })
      await titleField.fill(next)
      await page.getByText('Save changes', { exact: true }).click()
      // Success modal → Done runs router.back(), restoring the detail screen
      // with its pre-edit React state intact. That restore is what used to be stale.
      await expect(page.getByText('Event updated!')).toBeVisible({ timeout: 20000 })
      await page.getByText('Done', { exact: true }).click()
      await page.waitForURL(eventUrl, { timeout: 20000 })
    }

    await renameTo(editedTitle)
    await expect(heroTitle).toHaveText(editedTitle, { timeout: 20000 })

    // Restore the fixture title — this spec runs serially against a shared DB.
    // (afterAll cleanup matches the `[e2e]` prefix, so it would collect the
    // renamed row either way; this keeps reruns starting from a clean name.)
    await renameTo(OPEN_PLAY_EVENT)
    await expect(heroTitle).toHaveText(OPEN_PLAY_EVENT, { timeout: 20000 })
  })
})
