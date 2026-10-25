import type { RecurrenceCadence } from '../constants/events'

/** Default "repeat until" date for a new recurring series: four weeks after the first event. */
export function defaultRecurrenceEndDate(from: Date): Date {
  const d = new Date(from)
  d.setDate(d.getDate() + 28)
  return d
}

/**
 * Every start time a (possibly recurring) event series produces.
 *
 * - Not recurring: just `startDate`.
 * - Monthly: the same day-of-month and time, one month apart, through `endDate`.
 * - Weekly / bi-weekly: each selected weekday (default: the start date's own),
 *   every 1 / 2 weeks, from `startDate` through `endDate`.
 *
 * Times are local wall-clock: a 7:00 PM event stays at 7:00 PM across a
 * daylight-saving change (dates are built with `setDate` / `setHours`, never by
 * adding 24-hour blocks of milliseconds).
 */
export function generateEventDates(
  startDate: Date,
  enabled: boolean,
  days: number[],
  cadence: RecurrenceCadence,
  endDate: Date,
): Date[] {
  if (!enabled) return [startDate]

  const h = startDate.getHours()
  const m = startDate.getMinutes()
  const dates: Date[] = []

  if (cadence === 'monthly') {
    let d = new Date(startDate)
    while (d <= endDate) {
      dates.push(new Date(d))
      d = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate(), h, m)
    }
    return dates
  }

  const stepDays = cadence === 'biweekly' ? 14 : 7
  const selectedDays = days.length > 0 ? days : [startDate.getDay()]

  const weekSunday = new Date(startDate)
  weekSunday.setDate(weekSunday.getDate() - weekSunday.getDay())
  weekSunday.setHours(h, m, 0, 0)

  const cursor = new Date(weekSunday)
  while (cursor <= endDate) {
    for (const dayIdx of [...selectedDays].sort((a, b) => a - b)) {
      const d = new Date(cursor)
      d.setDate(d.getDate() + dayIdx)
      d.setHours(h, m, 0, 0)
      if (d >= startDate && d <= endDate) dates.push(new Date(d))
    }
    cursor.setDate(cursor.getDate() + stepDays)
  }

  return dates
}
