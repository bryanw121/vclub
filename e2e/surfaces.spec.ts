/**
 * Happy paths for surfaces the other specs don't reach (#12): clubs browse and
 * detail, a tournament page, another player's profile and the feedback form.
 * Signed in as the e2e account. Read-only apart from one club + tournament
 * that beforeAll creates and afterAll deletes (e2e/surfaceFixtures.ts); the
 * feedback form is rendered but never submitted.
 */
import { test, expect } from '@playwright/test'
import { E2E_BASE_URL as BASE_URL } from './env'
import { gotoReady } from './retry'
import { CLUB_NAME, TOURNAMENT_TITLE, cleanupSurfaceFixtures, seedSurfaceFixtures, type SurfaceFixtures } from './surfaceFixtures'

/** The seeded second e2e user (see CLAUDE.md, "CI never touches the live project"). */
const BUDDY_ID = 'b0dd1e00-0000-4000-8000-0000000e2e02'

test.describe.configure({ mode: 'serial' })

let fixtures: SurfaceFixtures

test.beforeAll(async () => {
  fixtures = await seedSurfaceFixtures()
})

test.afterAll(async () => {
  await cleanupSurfaceFixtures()
})

test('Clubs: the joined list shows my club and opens its page', async ({ page }) => {
  const card = page.getByText(CLUB_NAME, { exact: true }).first()
  await gotoReady(page, `${BASE_URL}/clubs`, card)
  await expect(page.getByText('Joined', { exact: true }).first()).toBeVisible()
  await card.click()
  await expect(page).toHaveURL(new RegExp(`/club/${fixtures.clubId}`), { timeout: 15_000 })
  await expect(page.getByText(CLUB_NAME, { exact: true }).first()).toBeVisible({ timeout: 20_000 })
})

test('Clubs: search finds the club by name', async ({ page }) => {
  const search = page.getByPlaceholder(/Search all clubs/)
  await gotoReady(page, `${BASE_URL}/clubs`, search)
  await search.fill(CLUB_NAME)
  await expect(page.getByText(CLUB_NAME, { exact: true }).first()).toBeVisible({ timeout: 15_000 })
  await search.fill(`${CLUB_NAME} no such club`)
  await expect(page.getByText('No clubs match your search.')).toBeVisible({ timeout: 15_000 })
})

test('Tournament page shows the title and its tabs', async ({ page }) => {
  const title = page.getByText(TOURNAMENT_TITLE, { exact: true }).first()
  await gotoReady(page, `${BASE_URL}/tournament/${fixtures.tournamentId}`, title)
  for (const tab of ['Overview', 'Teams', 'Schedule', 'Discussion']) {
    await expect(page.getByText(tab, { exact: true }).first()).toBeVisible()
  }
})

test("Another player's profile renders", async ({ page }) => {
  await gotoReady(page, `${BASE_URL}/profile/${BUDDY_ID}`, page.getByText('E2E Buddy').first())
})

test('Feedback form renders (not submitted)', async ({ page }) => {
  const title = page.getByPlaceholder('Short summary')
  await gotoReady(page, `${BASE_URL}/settings/feedback`, title)
  await expect(page.getByText('Submit', { exact: true }).first()).toBeVisible()
})
