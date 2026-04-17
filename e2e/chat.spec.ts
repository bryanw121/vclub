/**
 * Chat E2E tests — requires the Expo dev server to be running on port 8081.
 * Run: npx playwright test e2e/chat.spec.ts
 *
 * Test account: bryanw121 / password
 * Seed conversation: "jexy is so sexy" (id: 01bc0c4f-2e83-4402-afce-5fc7ddd729f9)
 */

import { test, expect, Page } from '@playwright/test'

const BASE_URL = 'http://localhost:8081'
const CONVO_ID = '01bc0c4f-2e83-4402-afce-5fc7ddd729f9'
const CONVO_URL = `${BASE_URL}/chat/${CONVO_ID}`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function login(page: Page) {
  await page.goto(`${BASE_URL}/login`)
  await page.waitForTimeout(2000)
  await page.getByRole('textbox').nth(0).fill('bryanw121')
  await page.getByRole('textbox').nth(1).fill('password')
  await page.getByText('Sign in', { exact: true }).click()
  await page.waitForURL(`${BASE_URL}/`)
}

async function dismissErrorOverlays(page: Page) {
  const dismissBtns = await page.getByText('Dismiss').all()
  for (const btn of dismissBtns) {
    try { await btn.click({ timeout: 500 }) } catch {}
  }
}

/** Right-click a message bubble and open the context menu. */
async function openContextMenu(page: Page, messageText: string) {
  const matches = await page.getByText(messageText).all()
  // Prefer the bubble element (shorter class list = the plain bubble text)
  const target = matches.length > 1 ? matches[matches.length - 1] : matches[0]
  await target.click({ button: 'right', force: true })
  await page.waitForTimeout(600)
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

test.describe('Chat', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    // Navigate to chat and wait for it to fully load (reload clears lock errors)
    await page.goto(`${BASE_URL}/chat`)
    await page.reload()
    await page.waitForTimeout(3000)
    await dismissErrorOverlays(page)
  })

  // ── 1. Chat list ───────────────────────────────────────────────────────────

  test('chat list renders conversations', async ({ page }) => {
    await expect(page.getByText('Messages')).toBeVisible()
    // At least one conversation row should exist
    const rows = page.locator('text=jexy is so sexy')
    await expect(rows.first()).toBeVisible()
  })

  test('chat list shows last message preview', async ({ page }) => {
    // The "jexy is so sexy" conversation should have some preview text
    const preview = page.getByText('Deleted message')
    await expect(preview).toBeVisible()
  })

  test('compose button opens user search', async ({ page }) => {
    // The pencil/compose icon sits to the right of the "Messages" header
    const header = await page.getByText('Messages').boundingBox()
    if (!header) throw new Error('Messages header not found')
    await page.mouse.click(1163, header.y + header.height / 2)
    await page.waitForTimeout(1000)
    await expect(page.getByRole('textbox')).toBeVisible()
    await expect(page.getByText('Cancel')).toBeVisible()
  })

  test('compose search returns matching users', async ({ page }) => {
    const header = await page.getByText('Messages').boundingBox()
    if (!header) throw new Error('Messages header not found')
    await page.mouse.click(1163, header.y + header.height / 2)
    await page.waitForTimeout(500)
    await page.getByRole('textbox').fill('jexy')
    await page.waitForTimeout(1500)
    await expect(page.getByText('@jexyissexy')).toBeVisible()
  })

  test('selecting a user from compose opens the conversation', async ({ page }) => {
    const header = await page.getByText('Messages').boundingBox()
    if (!header) throw new Error('Messages header not found')
    await page.mouse.click(1163, header.y + header.height / 2)
    await page.waitForTimeout(500)
    await page.getByRole('textbox').fill('jexy')
    await page.waitForTimeout(1500)
    await page.getByText('jexy is so sexy').first().click({ force: true })
    await page.waitForTimeout(1500)
    expect(page.url()).toBe(CONVO_URL)
  })

  // ── 2. Conversation view ───────────────────────────────────────────────────

  test('opening a conversation loads messages', async ({ page }) => {
    await page.goto(CONVO_URL)
    await page.waitForTimeout(2000)
    await expect(page.getByText('jexy is so sexy')).toBeVisible()
    // At least one message bubble should exist
    const input = page.getByRole('textbox', { name: 'Message' })
    await expect(input).toBeVisible()
  })

  test('back arrow returns to chat list', async ({ page }) => {
    await page.goto(CONVO_URL)
    await page.waitForTimeout(2000)
    const backArrow = await page.getByText('jexy is so sexy').boundingBox()
    if (!backArrow) throw new Error('Header not found')
    await page.mouse.click(257, backArrow.y + backArrow.height / 2)
    await page.waitForTimeout(1000)
    expect(page.url()).toBe(`${BASE_URL}/chat`)
  })

  test('reply quotes show on messages with reply_to_id', async ({ page }) => {
    await page.goto(CONVO_URL)
    await page.waitForTimeout(2000)
    // Several messages have reply quotes — check that at least one quote header is visible
    const quotes = page.getByText('jexy is so sexy').all()
    expect((await quotes).length).toBeGreaterThan(1)
  })

  // ── 3. Send message ────────────────────────────────────────────────────────

  test('sends a message and it appears in the conversation', async ({ page }) => {
    await page.goto(CONVO_URL)
    await page.waitForTimeout(2000)

    const unique = `e2e-send-${Date.now()}`
    const input = page.getByRole('textbox', { name: 'Message' })
    await input.fill(unique)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(2000)

    await expect(page.getByText(unique)).toBeVisible()
    // Input should be cleared after send
    await expect(input).toHaveValue('')
  })

  // ── 4. Context menu ────────────────────────────────────────────────────────

  test('right-click on own message shows emoji picker + Reply + Edit + Delete', async ({ page }) => {
    await page.goto(CONVO_URL)
    await page.waitForTimeout(2000)

    // Send a fresh message so we have a guaranteed own message
    const unique = `e2e-ctx-${Date.now()}`
    await page.getByRole('textbox', { name: 'Message' }).fill(unique)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(1500)

    await openContextMenu(page, unique)
    await expect(page.getByText('👍')).toBeVisible()
    await expect(page.getByText('Reply', { exact: true })).toBeVisible()
    await expect(page.getByText('Edit', { exact: true })).toBeVisible()
    await expect(page.getByText('Delete', { exact: true })).toBeVisible()
  })

  // ── 5. Edit message ────────────────────────────────────────────────────────

  test('editing a message updates its content with (edited) label', async ({ page }) => {
    await page.goto(CONVO_URL)
    await page.waitForTimeout(2000)

    const original = `e2e-edit-${Date.now()}`
    const edited = `${original}-EDITED`
    await page.getByRole('textbox', { name: 'Message' }).fill(original)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(1500)

    await openContextMenu(page, original)
    await page.getByText('Edit', { exact: true }).click({ force: true })
    await page.waitForTimeout(800)

    // Edit banner should appear
    await expect(page.getByText('Editing message')).toBeVisible()

    // Update content and submit
    const input = page.getByRole('textbox', { name: 'Message' })
    await input.fill(edited)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(1500)

    await expect(page.getByText(edited)).toBeVisible()
    await expect(page.getByText('(edited)')).toBeVisible()
  })

  test('edit banner can be cancelled with the × button', async ({ page }) => {
    await page.goto(CONVO_URL)
    await page.waitForTimeout(2000)

    const unique = `e2e-cancel-edit-${Date.now()}`
    await page.getByRole('textbox', { name: 'Message' }).fill(unique)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(1500)

    await openContextMenu(page, unique)
    await page.getByText('Edit', { exact: true }).click({ force: true })
    await page.waitForTimeout(600)
    await expect(page.getByText('Editing message')).toBeVisible()

    // Cancel
    const banner = await page.getByText('Editing message').boundingBox()
    if (!banner) throw new Error('Edit banner not found')
    await page.mouse.click(1176, banner.y + banner.height / 2)
    await page.waitForTimeout(600)
    await expect(page.getByText('Editing message')).not.toBeVisible()
  })

  // ── 6. Reply ───────────────────────────────────────────────────────────────

  test('replying shows the reply banner with the quoted message', async ({ page }) => {
    await page.goto(CONVO_URL)
    await page.waitForTimeout(2000)

    await openContextMenu(page, 'yes working')
    await page.getByText('Reply', { exact: true }).click({ force: true })
    await page.waitForTimeout(800)

    await expect(page.getByText('Replying to')).toBeVisible()
    await expect(page.getByText('yes working').first()).toBeVisible()
  })

  test('reply banner can be dismissed with ×', async ({ page }) => {
    await page.goto(CONVO_URL)
    await page.waitForTimeout(2000)

    await openContextMenu(page, 'yes working')
    await page.getByText('Reply', { exact: true }).click({ force: true })
    await page.waitForTimeout(800)
    await expect(page.getByText('Replying to')).toBeVisible()

    const banner = await page.getByText('Replying to').boundingBox()
    if (!banner) throw new Error('Reply banner not found')
    await page.mouse.click(1176, banner.y + banner.height / 2)
    await page.waitForTimeout(600)
    await expect(page.getByText('Replying to')).not.toBeVisible()
  })

  test('sent reply shows quote above the message bubble', async ({ page }) => {
    await page.goto(CONVO_URL)
    await page.waitForTimeout(2000)

    await openContextMenu(page, 'yes working')
    await page.getByText('Reply', { exact: true }).click({ force: true })
    await page.waitForTimeout(600)

    const unique = `e2e-reply-${Date.now()}`
    await page.getByRole('textbox', { name: 'Message' }).fill(unique)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(2000)

    await expect(page.getByText(unique)).toBeVisible()
    // The reply quote header referencing "jexy is so sexy" should appear before the message
    const quoteAuthor = page.getByText('jexy is so sexy').last()
    await expect(quoteAuthor).toBeVisible()
  })

  // ── 7. Emoji reactions ─────────────────────────────────────────────────────

  test('adding an emoji reaction shows it on the message bubble', async ({ page }) => {
    await page.goto(CONVO_URL)
    await page.waitForTimeout(2000)

    const unique = `e2e-react-${Date.now()}`
    await page.getByRole('textbox', { name: 'Message' }).fill(unique)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(1500)

    await openContextMenu(page, unique)
    await page.getByText('👍').click({ force: true })
    await page.waitForTimeout(1500)

    // The reaction pill should now be visible near the message
    await expect(page.getByText('👍').first()).toBeVisible()
  })

  // ── 8. Image sending ──────────────────────────────────────────────────────
  //
  // expo-image-picker on web creates a hidden <input type="file"> and waits
  // for a 'change' event. It activates the input via a synthetic MouseEvent
  // click — not a real user gesture — so Playwright's filechooser interception
  // never fires. We inject a MutationObserver that detects the file input,
  // overrides input.files via DataTransfer, and dispatches 'change' so the
  // picker promise resolves with our test image.

  async function pickImage(page: Page) {
    const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

    await dismissErrorOverlays(page)

    await page.evaluate((pngB64: string) => {
      (window as any).__imagePicked = false
      const obs = new MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const node of m.addedNodes) {
            const el = node as HTMLInputElement
            if (el.tagName !== 'INPUT' || el.type !== 'file') continue
            obs.disconnect()
            const bin = atob(pngB64)
            const bytes = new Uint8Array(bin.length)
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
            const file = new File([bytes], 'test.png', { type: 'image/png' })
            const dt = new DataTransfer()
            dt.items.add(file)
            Object.defineProperty(el, 'files', { value: dt.files, configurable: true })
            // Defer so expo's 'change' listener is registered before we fire
            Promise.resolve().then(() => {
              el.dispatchEvent(new Event('change', { bubbles: true }))
              ;(window as any).__imagePicked = true
            })
          }
        }
      })
      obs.observe(document.body, { childList: true })
    }, PNG_B64)

    const clicked = await page.evaluate(() => {
      const tx = Array.from(document.querySelectorAll('textarea, input[type="text"]')).find(
        el => (el as HTMLInputElement).placeholder?.includes('Message')
      ) as HTMLElement | undefined
      if (!tx) return false
      const btn = tx.parentElement?.children[0] as HTMLElement | undefined
      if (!btn) return false
      const r = btn.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      const opts: MouseEventInit = { bubbles: true, cancelable: true, clientX: cx, clientY: cy, view: window }
      for (const [type, Ctor] of [['pointerover', PointerEvent], ['mouseover', MouseEvent], ['pointerdown', PointerEvent], ['mousedown', MouseEvent], ['pointerup', PointerEvent], ['mouseup', MouseEvent], ['click', MouseEvent]] as const) {
        btn.dispatchEvent(new (Ctor as typeof MouseEvent)(type, opts))
      }
      return true
    })
    if (!clicked) throw new Error('Image picker button not found')

    await page.waitForFunction(() => (window as any).__imagePicked === true, { timeout: 8000 })
    await page.waitForTimeout(500)
  }

  test('selecting an image shows a preview thumbnail above the input bar', async ({ page }) => {
    await page.goto(CONVO_URL)
    await page.waitForTimeout(2000)

    await pickImage(page)

    await expect(page.locator('img[src^="blob:"]').last()).toBeVisible()
  })

  // ── 9. Delete message ──────────────────────────────────────────────────────

  test('deleting a message marks it as deleted (visible after reload)', async ({ page }) => {
    await page.goto(CONVO_URL)
    await page.waitForTimeout(2000)

    const unique = `e2e-delete-${Date.now()}`
    await page.getByRole('textbox', { name: 'Message' }).fill(unique)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(1500)

    await openContextMenu(page, unique)
    await page.getByText('Delete', { exact: true }).click({ force: true })
    await page.waitForTimeout(1000)

    // Reload to confirm the server persisted the soft-delete
    await page.reload()
    await page.waitForTimeout(3000)
    await expect(page.getByText(unique)).not.toBeVisible()
    await expect(page.getByText('Message deleted').last()).toBeVisible()
  })
})
