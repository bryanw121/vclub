/**
 * Pure pieces of the login-with-username function, kept free of Deno globals
 * so jest can test them (__tests__/usernameLogin.test.ts).
 */

/** The one message for an unknown username and a wrong password alike. */
export const GENERIC_LOGIN_ERROR = 'Incorrect username or password'

/**
 * Every failed or successful attempt takes at least this long, so response
 * time does not reveal whether the username exists (an unknown username would
 * otherwise return before the password check).
 */
export const MIN_RESPONSE_MS = 700

export type LoginInput = { username: string; password: string }

/** Normalized input, or null when the body is not a plausible login. */
export function parseLoginBody(body: unknown): LoginInput | null {
  if (!body || typeof body !== 'object') return null
  const { username, password } = body as Record<string, unknown>
  if (typeof username !== 'string' || typeof password !== 'string') return null
  const u = username.trim().toLowerCase()
  if (!u || u.length > 64 || u.includes('@')) return null
  if (!password || password.length > 128) return null
  return { username: u, password }
}

/** How long to wait before answering, given when the request started. */
export function remainingDelayMs(startedAt: number, now: number, jitterMs: number): number {
  return Math.max(0, MIN_RESPONSE_MS + jitterMs - (now - startedAt))
}
