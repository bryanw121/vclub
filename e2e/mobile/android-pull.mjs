// Real Chrome for Android (emulator or device over ADB) pull-to-refresh check, #35.
// The swipe goes through Android's input system (device.input.swipe), not
// synthetic DOM events, so Chrome's own scrolling and overscroll handling run.
//
//   adb reverse tcp:8081 tcp:8081 && node e2e/mobile/android-pull.mjs
//
// Exits non-zero with a reason on the first failed check; saves screenshots to
// test-results/mobile/.
import { mkdirSync } from 'node:fs'
import { _android as android } from '@playwright/test'

const BASE = process.env.E2E_BASE_URL || 'http://localhost:8081'
const OUT = 'test-results/mobile'
mkdirSync(OUT, { recursive: true })

const restCalls = page => page.evaluate(() =>
  performance.getEntriesByType('resource').filter(e => e.name.includes('/rest/v1/')).length)

async function waitFor(fn, ms) {
  const end = Date.now() + ms
  while (Date.now() < end) { if (await fn()) return true; await new Promise(r => setTimeout(r, 250)) }
  return false
}

const [device] = await android.devices()
if (!device) throw new Error('no Android device/emulator visible to adb')
console.log(`device ${device.model()} (${device.serial()})`)
const [, w, h] = (await device.shell('wm size')).toString().match(/(\d+)x(\d+)/).map(Number)
const swipeDown = (from, to) => device.input.swipe({ x: w / 2, y: h * from }, [{ x: w / 2, y: h * to }], 40)

const context = await device.launchBrowser()
// context.newPage() is unreliable on Android (Playwright's support is experimental);
// drive the tab Chrome opens on launch instead.
const page = context.pages()[0] ?? await context.waitForEvent('page')
let failed = false
const check = (ok, what) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`); if (!ok) failed = true }
try {
  await page.goto(`${BASE}/`)
  await page.getByTestId('filter-all').first().waitFor({ timeout: 90_000 })
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => { window.__noReload = true })

  // 1. Pull at the top: refetches, and Chrome's own pull-to-refresh doesn't reload the page.
  let before = await restCalls(page)
  await swipeDown(0.35, 0.8)
  check(await waitFor(async () => (await restCalls(page)) > before, 15_000), 'pull at top refetches the feed')
  check(await page.evaluate(() => window.__noReload === true), "Chrome's native pull-to-refresh did not reload the page")
  await page.screenshot({ path: `${OUT}/android-after-pull.png` })

  // 2. Short pull: no refetch.
  await page.waitForLoadState('networkidle')
  before = await restCalls(page)
  await swipeDown(0.35, 0.4)
  await new Promise(r => setTimeout(r, 2500))
  check((await restCalls(page)) === before, 'short pull below the threshold does not refetch')

  // 3. Mid-scroll: scrolls, never refreshes.
  await page.evaluate(() => { document.body.style.minHeight = '6000px'; window.scrollTo(0, 800) })
  await new Promise(r => setTimeout(r, 500))
  // Diagnostics: does anything cancel touchmove, and does a plain scroll work here at all?
  await page.evaluate(() => {
    window.__tm = { moves: 0, prevented: 0, cancelable: 0 }
    window.addEventListener('touchmove', e => {
      window.__tm.moves++
      if (e.cancelable) window.__tm.cancelable++
      if (e.defaultPrevented) window.__tm.prevented++
    })
  })
  const y0 = await page.evaluate(() => window.scrollY)
  await swipeDown(0.7, 0.4) // finger up: page should scroll down
  await new Promise(r => setTimeout(r, 1500))
  const y1 = await page.evaluate(() => window.scrollY)
  console.log(`control swipe up: scrollY ${y0} -> ${y1}; touchmove ${JSON.stringify(await page.evaluate(() => window.__tm))}`)
  await page.evaluate(() => { window.scrollTo(0, 800); window.__tm = { moves: 0, prevented: 0, cancelable: 0 } })
  await new Promise(r => setTimeout(r, 500))
  const yBefore = await page.evaluate(() => window.scrollY)
  before = await restCalls(page)
  await swipeDown(0.35, 0.8)
  await new Promise(r => setTimeout(r, 2500))
  const yAfter = await page.evaluate(() => window.scrollY)
  console.log(`mid-scroll: scrollY ${yBefore} -> ${yAfter}; touchmove ${JSON.stringify(await page.evaluate(() => window.__tm))}`)
  check(yBefore > 0, 'the page was scrolled before the mid-scroll pull')
  check((await restCalls(page)) === before, 'pull mid-scroll does not refetch')
  check(yAfter < yBefore, 'pull mid-scroll scrolled the page up instead')
} finally {
  await page.screenshot({ path: `${OUT}/android-final.png` }).catch(() => {})
  await context.close()
  await device.close()
}
if (failed) process.exit(1)
