import { nextUpLabel } from '../components/events/NextUpCard'

// A Wednesday, 10am local.
const NOW = new Date(2026, 9, 21, 10, 0, 0)

/** Local wall-clock time → the UTC ISO string the DB would return. */
function at(y: number, m: number, d: number, h: number): string {
  return new Date(y, m, d, h, 0, 0).toISOString()
}

describe('nextUpLabel', () => {
  it('says TONIGHT for an evening event today', () => {
    expect(nextUpLabel(at(2026, 9, 21, 19), NOW)).toBe('TONIGHT')
  })

  it('says TODAY for a daytime event today', () => {
    expect(nextUpLabel(at(2026, 9, 21, 12), NOW)).toBe('TODAY')
  })

  it('says TOMORROW for tomorrow, any hour', () => {
    expect(nextUpLabel(at(2026, 9, 22, 7), NOW)).toBe('TOMORROW')
    expect(nextUpLabel(at(2026, 9, 22, 21), NOW)).toBe('TOMORROW')
  })

  it('uses the weekday within the coming week', () => {
    expect(nextUpLabel(at(2026, 9, 24, 19), NOW)).toBe('SAT')
    expect(nextUpLabel(at(2026, 9, 27, 19), NOW)).toBe('TUE')
  })

  it('falls back to a short date a week or more out', () => {
    expect(nextUpLabel(at(2026, 9, 28, 19), NOW)).toBe('OCT 28')
  })

  it('reads suffix-less timestamps as UTC, like the feed', () => {
    const iso = at(2026, 9, 21, 19).replace(/\.\d{3}Z$/, '')
    expect(nextUpLabel(iso, NOW)).toBe('TONIGHT')
  })
})
