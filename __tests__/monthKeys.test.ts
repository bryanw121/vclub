import {
  addMonths,
  bucketByMonthKey,
  enumerateMonths,
  monthEndIso,
  monthKeyFromIso,
  monthStartIso,
  shouldRefreshEventsOnFocus,
} from '../utils/monthKeys'

describe('monthKeys', () => {
  it('adds months across a year boundary', () => {
    expect(addMonths('2026-11', 1)).toBe('2026-12')
    expect(addMonths('2026-11', 3)).toBe('2027-02')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
  })

  it('enumerates an inclusive month span', () => {
    expect(enumerateMonths('2026-08', '2026-11')).toEqual([
      '2026-08', '2026-09', '2026-10', '2026-11',
    ])
    expect(enumerateMonths('2026-08', '2026-08')).toEqual(['2026-08'])
    expect(enumerateMonths('2026-11', '2026-08')).toEqual([])
  })

  it('uses UTC month bounds', () => {
    expect(monthStartIso('2026-08')).toBe('2026-08-01T00:00:00.000Z')
    expect(monthEndIso('2026-08')).toBe('2026-09-01T00:00:00.000Z')
    expect(monthEndIso('2026-11')).toBe('2026-12-01T00:00:00.000Z')
  })

  it('buckets events into the requested months and drops out-of-span rows', () => {
    const buckets = bucketByMonthKey(
      [
        { event_date: '2026-08-13T18:00:00.000Z' },
        { event_date: '2026-09-01T00:00:00.000Z' },
        { event_date: '2026-12-01T00:00:00.000Z' },
      ],
      ['2026-08', '2026-09', '2026-10'],
    )
    expect(Object.keys(buckets)).toEqual(['2026-08', '2026-09', '2026-10'])
    expect(buckets['2026-08']).toHaveLength(1)
    expect(buckets['2026-09']).toHaveLength(1)
    expect(buckets['2026-10']).toHaveLength(0)
    expect(monthKeyFromIso('2026-09-01T00:00:00.000Z')).toBe('2026-09')
  })

  it('only cache-busts the events feed after a real blur, not an instant remount', () => {
    expect(shouldRefreshEventsOnFocus(null, 1_000)).toBe(false)
    expect(shouldRefreshEventsOnFocus(1_000, 1_200)).toBe(false)
    expect(shouldRefreshEventsOnFocus(1_000, 1_400)).toBe(true)
  })
})
