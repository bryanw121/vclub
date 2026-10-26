import { devices, expect, test, type CDPSession, type Page } from '@playwright/test'
import { E2E_BASE_URL as BASE_URL } from './env'

// #35: react-native-web's RefreshControl is a no-op, so web pull-to-refresh is
// components/RefreshControl.web.tsx. This drives a real touch swipe through
// Chromium's input pipeline (CDP Input.dispatchTouchEvent, not synthetic DOM
// events) on a phone-sized viewport, which puts the feed in doc-scroll mode.
// A refresh is asserted by the refetch it causes, not by the spinner.
test.use({ ...devices['Pixel 7'] })

const X = 200
const START_Y = 260

async function swipeDown(cdp: CDPSession, distance: number) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: X, y: START_Y }] })
  for (let d = 10; d <= distance; d += 10) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: X, y: START_Y + d }] })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

/** Counts Supabase REST calls from now on. */
function apiCalls(page: Page) {
  let n = 0
  page.on('request', r => { if (r.url().includes('/rest/v1/')) n++ })
  return () => n
}

async function openFeed(page: Page) {
  await page.goto(`${BASE_URL}/`)
  await expect(page.getByTestId('filter-all').first()).toBeVisible({ timeout: 20_000 })
  // Let the first load settle so its requests aren't counted as a refresh.
  await page.waitForLoadState('networkidle')
}

test.describe('pull to refresh (mobile web)', () => {
  test('pulling down at the top of the Events feed refetches it', async ({ page }) => {
    await openFeed(page)
    const cdp = await page.context().newCDPSession(page)
    const calls = apiCalls(page)
    await swipeDown(cdp, 300)
    await expect.poll(calls, { timeout: 10_000 }).toBeGreaterThan(0)
  })

  test('a short pull below the threshold springs back without refetching', async ({ page }) => {
    await openFeed(page)
    const cdp = await page.context().newCDPSession(page)
    const calls = apiCalls(page)
    await swipeDown(cdp, 60)
    await page.waitForTimeout(2_000)
    expect(calls()).toBe(0)
  })

  test('pulling down mid-scroll scrolls instead of refreshing', async ({ page }) => {
    await openFeed(page)
    // Guarantee the document can scroll, whatever the beta feed holds today.
    await page.evaluate(() => { document.body.style.minHeight = '4000px'; window.scrollTo(0, 600) })
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
    const cdp = await page.context().newCDPSession(page)
    const calls = apiCalls(page)
    await swipeDown(cdp, 300)
    await page.waitForTimeout(2_000)
    expect(calls()).toBe(0)
  })
})
