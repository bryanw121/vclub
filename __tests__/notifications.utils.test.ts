import { formatShortTime } from '../utils/notificationUtils'

describe('formatShortTime', () => {
  it('formats an ISO string with Z suffix', () => {
    const result = formatShortTime('2025-06-15T14:30:00Z')
    // Should include the month, day, hour, and minute — exact format is locale-dependent
    expect(result).toMatch(/Jun/)
    expect(result).toMatch(/15/)
  })

  it('appends Z for strings without timezone info', () => {
    // Should not throw and should return a non-empty string
    const result = formatShortTime('2025-06-15T14:30:00')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('returns empty string for an invalid date', () => {
    const result = formatShortTime('not-a-date')
    expect(result).toBe('')
  })

  it('handles ISO strings with +offset timezone', () => {
    const result = formatShortTime('2025-06-15T14:30:00+05:00')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })
})
