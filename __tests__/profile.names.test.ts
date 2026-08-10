import {
  profileDisplayName,
  profileFullName,
  profileInitial,
  DISPLAY_NAME_FORMAT,
} from '../utils'

/**
 * Regression guards for the "real names only show on the profile page" bug.
 *
 * `profileDisplayName` used to require BOTH first_name and last_name before it
 * would use either, so a member who filled in only a first name fell all the
 way through to their username on event rosters, comments, and chat.
 */

const base = { username: 'jumpfloat22', first_name: null, last_name: null }

describe('profileDisplayName', () => {
  it('uses both names when both are set', () => {
    const name = profileDisplayName({ ...base, first_name: 'Jordan', last_name: 'Rivera' })
    expect(name).toBe(DISPLAY_NAME_FORMAT === 'full' ? 'Jordan Rivera' : 'Jordan R.')
  })

  // ── The actual bug ──────────────────────────────────────────────────────────
  it('uses the first name alone when no last name is set', () => {
    expect(profileDisplayName({ ...base, first_name: 'Rachel' })).toBe('Rachel')
  })

  it('does NOT fall back to username when only a first name is set', () => {
    expect(profileDisplayName({ ...base, first_name: 'Rachel' })).not.toBe('jumpfloat22')
  })

  it('uses the last name alone when no first name is set', () => {
    expect(profileDisplayName({ ...base, last_name: 'Rivera' })).toBe('Rivera')
  })

  // ── Fallbacks ───────────────────────────────────────────────────────────────
  it('falls back to username when no real name is set', () => {
    expect(profileDisplayName(base)).toBe('jumpfloat22')
  })

  it('treats blank and whitespace-only names as unset', () => {
    expect(profileDisplayName({ ...base, first_name: '', last_name: '   ' })).toBe('jumpfloat22')
  })

  it('trims surrounding whitespace', () => {
    expect(profileDisplayName({ ...base, first_name: '  Jordan  ', last_name: '  Rivera  ' }))
      .toBe(DISPLAY_NAME_FORMAT === 'full' ? 'Jordan Rivera' : 'Jordan R.')
  })

  it('never renders an empty string, even with no usable fields', () => {
    expect(profileDisplayName({ username: '', first_name: null, last_name: null })).toBe('Member')
  })
})

describe('profileFullName', () => {
  it('always shows the full last name, independent of DISPLAY_NAME_FORMAT', () => {
    // A profile header must not become "Jordan R." if the shared format is
    // ever flipped back to 'abbreviated'.
    expect(profileFullName({ ...base, first_name: 'Jordan', last_name: 'Rivera' }))
      .toBe('Jordan Rivera')
  })

  it('falls back through single name to username', () => {
    expect(profileFullName({ ...base, first_name: 'Rachel' })).toBe('Rachel')
    expect(profileFullName(base)).toBe('jumpfloat22')
  })
})

describe('profileInitial', () => {
  it('uses both initials when both names are set', () => {
    expect(profileInitial({ ...base, first_name: 'Jordan', last_name: 'Rivera' })).toBe('JR')
  })

  it('uses the first name initial when only a first name is set', () => {
    expect(profileInitial({ ...base, first_name: 'Rachel' })).toBe('R')
  })

  it('falls back to the username initial rather than "?"', () => {
    expect(profileInitial(base)).toBe('J')
  })

  it('returns "?" only when there is genuinely nothing to show', () => {
    expect(profileInitial({ username: '', first_name: null, last_name: null })).toBe('?')
  })
})
