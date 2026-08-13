import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { expect, test as setup } from '@playwright/test'
import { loginForE2E } from './auth'

const AUTH_FILE = path.join(process.cwd(), 'playwright/.auth/user.json')

setup('authenticate shared e2e account', async ({ page }) => {
  setup.setTimeout(120_000)
  await loginForE2E(page)
  await expect.poll(
    () => page.evaluate(
      () => Object.keys(window.localStorage).some(
        key => key.startsWith('sb-') && key.endsWith('-auth-token'),
      ),
    ),
    {
      message: 'Supabase session was not persisted to browser storage',
      timeout: 10_000,
    },
  ).toBe(true)
  await mkdir(path.dirname(AUTH_FILE), { recursive: true })
  await page.context().storageState({ path: AUTH_FILE })
})
