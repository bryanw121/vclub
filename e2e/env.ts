/**
 * The one place e2e code reads environment variables.
 *
 * Values come from the process environment (CI sets them from repository
 * secrets) and, for local runs, from `.env` in the working directory. Variables
 * already set in the environment win over `.env`.
 *
 * There are deliberately no defaults for the e2e account: its credentials must
 * never be committed to this public repo. Importing this module throws a clear
 * error when anything required is missing. See `.env.example`.
 */
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

/** Load KEY=value pairs from `.env` into process.env without overriding existing values. */
function loadLocalEnv() {
  const envPath = resolve(process.cwd(), '.env')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    } else {
      // Match dotenv's handling of unquoted values such as
      // KEY=actual-value # local note.
      value = value.replace(/\s+#.*$/, '').trim()
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

loadLocalEnv()

function required(name: string, hint: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing ${name} for the e2e suite (${hint}). Set it in .env locally or as a CI secret; see .env.example.`,
    )
  }
  return value
}

export const E2E_BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8081'

/**
 * Credentials of the dedicated e2e account. Required, never defaulted — but read
 * lazily, so the guest suite (which never signs in) runs without them.
 */
export function e2eCredentials(): { username: string; password: string } {
  return {
    username: required('E2E_USERNAME', 'username of the e2e test account'),
    password: required('E2E_PASSWORD', 'password of the e2e test account'),
  }
}

export const SUPABASE_URL = required('EXPO_PUBLIC_SUPABASE_URL', 'the same value the web build uses')
export const SUPABASE_ANON_KEY = required('EXPO_PUBLIC_SUPABASE_ANON_KEY', 'the same value the web build uses')
