import { defaultRecurrenceEndDate, generateEventDates } from '../utils/recurrence'

/** Local-time constructor: month is 1-based to read like a calendar. */
function local(y: number, mo: number, d: number, h = 19, mi = 0): Date {
  return new Date(y, mo - 1, d, h, mi, 0, 0)
}

/** "YYYY-MM-DD HH:mm" in local time, so assertions read as the host sees them. */
function fmt(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const SUN = 0
const MON = 1
const WED = 3
const FRI = 5

describe('generateEventDates', () => {
  it('returns just the start date when not recurring', () => {
    const start = local(2026, 3, 6)
    expect(generateEventDates(start, false, [MON], 'weekly', local(2026, 12, 31))).toEqual([start])
  })

  it('weekly with no days picked repeats on the start date weekday', () => {
    const start = local(2026, 3, 6) // Friday
    const dates = generateEventDates(start, true, [], 'weekly', local(2026, 3, 27, 23, 59))
    expect(dates.map(fmt)).toEqual(['2026-03-06 19:00', '2026-03-13 19:00', '2026-03-20 19:00', '2026-03-27 19:00'])
  })

  it('weekly on several days skips days before the start date and keeps date order', () => {
    const start = local(2026, 3, 4) // Wednesday
    const dates = generateEventDates(start, true, [FRI, MON, WED], 'weekly', local(2026, 3, 16, 23, 59))
    expect(dates.map(fmt)).toEqual([
      '2026-03-04 19:00', // Wed (start)
      '2026-03-06 19:00', // Fri
      '2026-03-09 19:00', // Mon
      '2026-03-11 19:00', // Wed
      '2026-03-13 19:00', // Fri
      '2026-03-16 19:00', // Mon
    ])
  })

  it('bi-weekly steps two weeks at a time', () => {
    const start = local(2026, 3, 6) // Friday
    const dates = generateEventDates(start, true, [FRI], 'biweekly', local(2026, 4, 30))
    expect(dates.map(fmt)).toEqual(['2026-03-06 19:00', '2026-03-20 19:00', '2026-04-03 19:00', '2026-04-17 19:00'])
  })

  it('bi-weekly with two days keeps both days in on-weeks and none in off-weeks', () => {
    const start = local(2026, 3, 2) // Monday
    const dates = generateEventDates(start, true, [MON, WED], 'biweekly', local(2026, 3, 31))
    expect(dates.map(fmt)).toEqual([
      '2026-03-02 19:00', '2026-03-04 19:00', // week of Mar 1
      '2026-03-16 19:00', '2026-03-18 19:00', // two weeks later
      '2026-03-30 19:00',                     // and Wed Apr 1 is past the end date
    ])
  })

  it('includes an event that lands exactly on the end date and excludes one a minute later', () => {
    const start = local(2026, 3, 6)
    expect(generateEventDates(start, true, [], 'weekly', local(2026, 3, 13, 19, 0))).toHaveLength(2)
    expect(generateEventDates(start, true, [], 'weekly', local(2026, 3, 13, 18, 59))).toHaveLength(1)
  })

  it('an end date before the start produces nothing', () => {
    expect(generateEventDates(local(2026, 3, 6), true, [], 'weekly', local(2026, 3, 1))).toEqual([])
  })

  it('monthly keeps the day-of-month and time', () => {
    const dates = generateEventDates(local(2026, 1, 15, 18, 30), true, [], 'monthly', local(2026, 4, 30))
    expect(dates.map(fmt)).toEqual(['2026-01-15 18:30', '2026-02-15 18:30', '2026-03-15 18:30', '2026-04-15 18:30'])
  })

  it('ignores the picked days for monthly', () => {
    const dates = generateEventDates(local(2026, 1, 15), true, [SUN, MON], 'monthly', local(2026, 2, 28))
    expect(dates).toHaveLength(2)
  })

  describe('daylight-saving boundaries', () => {
    // US clocks spring forward 2026-03-08 and fall back 2026-11-01. Under a
    // zone without DST these assertions hold trivially; under America/Chicago
    // (what `npm test` sets) a 24-hour-block implementation would drift an hour.
    it('weekly keeps 7:00 PM wall-clock time across spring-forward', () => {
      const dates = generateEventDates(local(2026, 3, 6), true, [], 'weekly', local(2026, 3, 27, 23, 59))
      expect(dates.map(fmt)).toEqual(['2026-03-06 19:00', '2026-03-13 19:00', '2026-03-20 19:00', '2026-03-27 19:00'])
    })

    it('bi-weekly keeps wall-clock time across fall-back', () => {
      const dates = generateEventDates(local(2026, 10, 23, 8, 15), true, [FRI], 'biweekly', local(2026, 11, 30))
      expect(dates.map(fmt)).toEqual(['2026-10-23 08:15', '2026-11-06 08:15', '2026-11-20 08:15'])
    })

    it('a series that starts on the boundary weekend itself stays on the hour', () => {
      const dates = generateEventDates(local(2026, 3, 8, 10, 0), true, [SUN, MON], 'weekly', local(2026, 3, 16, 23, 59))
      expect(dates.map(fmt)).toEqual(['2026-03-08 10:00', '2026-03-09 10:00', '2026-03-15 10:00', '2026-03-16 10:00'])
    })

    it('monthly keeps the hour when the next month is on the other side of a DST change', () => {
      const dates = generateEventDates(local(2026, 2, 20, 19, 0), true, [], 'monthly', local(2026, 4, 30))
      expect(dates.map(fmt)).toEqual(['2026-02-20 19:00', '2026-03-20 19:00', '2026-04-20 19:00'])
    })
  })
})

describe('defaultRecurrenceEndDate', () => {
  it('is four weeks after the start, on the same wall-clock time', () => {
    expect(fmt(defaultRecurrenceEndDate(local(2026, 3, 6)))).toBe('2026-04-03 19:00')
  })

  it('does not mutate its input', () => {
    const start = local(2026, 3, 6)
    defaultRecurrenceEndDate(start)
    expect(fmt(start)).toBe('2026-03-06 19:00')
  })
})
