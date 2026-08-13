import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { test as setup } from '@playwright/test'
import { loginForE2E } from './auth'

const AUTH_FILE = path.join(process.cwd(), 'playwright/.auth/user.json')

setup('authenticate shared e2e account', async ({ page }) => {
  setup.setTimeout(120_000)
  await loginForE2E(page)
  await mkdir(path.dirname(AUTH_FILE), { recursive: true })
  await page.context().storageState({ path: AUTH_FILE })
})
