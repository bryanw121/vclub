import { escapeMemberSearchTerm, buildMemberSearchFilter } from '../utils'

/**
 * Regression guards for the member-search filter.
 *
 * The search boxes used to interpolate raw input straight into a PostgREST
 * `or=(...)` logic tree. Verified against the live API before this fix:
 *   - a comma  → HTTP 400 `PGRST100 failed to parse logic tree` (search dies)
 *   - a `)`    → HTTP 200 but with wrong rows (filter silently truncated)
 *
 * Quoting the value makes PostgREST treat it as a literal. These tests assert
 * the shape of the generated filter, so a regression is caught without a
 * network call.
 */

describe('escapeMemberSearchTerm', () => {
  it('leaves ordinary terms untouched', () => {
    expect(escapeMemberSearchTerm('rivera')).toBe('rivera')
  })

  it('trims surrounding whitespace', () => {
    expect(escapeMemberSearchTerm('  rivera  ')).toBe('rivera')
  })

  it('preserves a comma in the value (quoting makes it safe)', () => {
    expect(escapeMemberSearchTerm('Smith, John')).toBe('Smith, John')
  })

  it('preserves parentheses and dots in the value', () => {
    expect(escapeMemberSearchTerm('J.R. (JJ)')).toBe('J.R. (JJ)')
  })

  it('escapes double quotes so they cannot close the quoted value', () => {
    expect(escapeMemberSearchTerm('a"b')).toBe('a\\"b')
  })

  it('escapes backslashes', () => {
    expect(escapeMemberSearchTerm('a\\b')).toBe('a\\\\b')
  })

  it('strips LIKE and PostgREST wildcards so search stays literal', () => {
    expect(escapeMemberSearchTerm('%')).toBe('')
    expect(escapeMemberSearchTerm('a%b_c*d')).toBe('abcd')
  })
})

describe('buildMemberSearchFilter', () => {
  it('searches username, first name, and last name', () => {
    const filter = buildMemberSearchFilter('rivera')
    expect(filter).toBe(
      'username.ilike."%rivera%",first_name.ilike."%rivera%",last_name.ilike."%rivera%"',
    )
  })

  it('always wraps values in double quotes', () => {
    // Unquoted values are what let a comma or paren corrupt the logic tree.
    for (const clause of buildMemberSearchFilter('rivera')!.split(',')) {
      expect(clause).toMatch(/\.ilike\."%.*%"$/)
    }
  })

  // ── The actual bug ──────────────────────────────────────────────────────────
  it('keeps a comma inside the quoted value instead of splitting the tree', () => {
    const filter = buildMemberSearchFilter('Smith, John')!
    expect(filter).toContain('username.ilike."%Smith, John%"')
    // Three clauses, not five — the comma in the name must not add conditions.
    expect(filter.match(/\.ilike\./g)).toHaveLength(3)
  })

  it('keeps a closing paren inside the quoted value', () => {
    expect(buildMemberSearchFilter('r)i')).toContain('username.ilike."%r)i%"')
  })

  it('returns null when nothing searchable remains, so callers skip the query', () => {
    // Without this, an all-wildcard term would collapse to `%%` and match every
    // profile in the database.
    expect(buildMemberSearchFilter('%%%')).toBeNull()
    expect(buildMemberSearchFilter('   ')).toBeNull()
    expect(buildMemberSearchFilter('')).toBeNull()
  })
})
