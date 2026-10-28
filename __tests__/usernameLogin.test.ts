import { GENERIC_LOGIN_ERROR, MIN_RESPONSE_MS, parseLoginBody, remainingDelayMs } from '../supabase/functions/_shared/usernameLogin'
import { corsHeaders } from '../supabase/functions/_shared/http'
import { readFileSync } from 'fs'
import { join } from 'path'

const fn = readFileSync(join(__dirname, '../supabase/functions/login-with-username/index.ts'), 'utf8')

describe('parseLoginBody', () => {
  it('normalizes the username', () => {
    expect(parseLoginBody({ username: '  E2EBot ', password: 'pw' })).toEqual({ username: 'e2ebot', password: 'pw' })
  })
  it.each([
    null, 'x', {}, { username: 'a' }, { password: 'p' }, { username: 1, password: 'p' },
    { username: '', password: 'p' }, { username: 'a', password: '' },
    { username: 'a@b.com', password: 'p' }, { username: 'a'.repeat(65), password: 'p' },
    { username: 'a', password: 'p'.repeat(129) },
  ])('rejects %p', body => {
    expect(parseLoginBody(body)).toBeNull()
  })
})

describe('remainingDelayMs', () => {
  it('pads fast answers up to the floor plus jitter', () => {
    expect(remainingDelayMs(1000, 1100, 50)).toBe(MIN_RESPONSE_MS + 50 - 100)
  })
  it('never waits once the floor has passed', () => {
    expect(remainingDelayMs(0, MIN_RESPONSE_MS + 500, 0)).toBe(0)
  })
})

describe('corsHeaders', () => {
  it('allows any origin when ALLOWED_ORIGINS is unset', () => {
    expect(corsHeaders('https://x.test', undefined)['Access-Control-Allow-Origin']).toBe('*')
  })
  it('echoes only listed origins', () => {
    expect(corsHeaders('https://a.test', 'https://a.test, https://b.test')['Access-Control-Allow-Origin']).toBe('https://a.test')
    expect(corsHeaders('https://evil.test', 'https://a.test')['Access-Control-Allow-Origin']).toBeUndefined()
  })
})

describe('login-with-username function', () => {
  it('answers an unknown username and a wrong password with the same generic error', () => {
    const unknown = fn.indexOf("if (typeof email !== 'string' || !email) return finish({ error: GENERIC_LOGIN_ERROR }, 401)")
    const wrong = fn.indexOf('return finish({ error: GENERIC_LOGIN_ERROR }, 401)', unknown + 1)
    expect(unknown).toBeGreaterThan(-1)
    expect(wrong).toBeGreaterThan(unknown)
    expect(GENERIC_LOGIN_ERROR).toBe('Incorrect username or password')
  })
  it('never returns the resolved email', () => {
    expect(fn).not.toMatch(/json\([^)]*email/)
    expect(fn).not.toMatch(/finish\(\{[^}]*email/)
  })
  it('is the only client of get_email_by_username and uses the service role for it', () => {
    expect(fn).toMatch(/getServiceClient\(\)\s*\n\s*\.rpc\('get_email_by_username'/)
  })
})
