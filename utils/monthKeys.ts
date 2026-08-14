/** `'2026-08'` + n months → `'2026-11'`. */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const total = (m - 1) + n
  const newY = y + Math.floor(total / 12)
  const newM = ((total % 12) + 12) % 12 + 1
  return `${newY}-${String(newM).padStart(2, '0')}`
}

export function monthStartIso(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toISOString()
}

export function monthEndIso(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 1)).toISOString()
}

/** Inclusive `startMonth` through inclusive `endMonth`, sorted. */
export function enumerateMonths(startMonth: string, endMonth: string): string[] {
  if (endMonth < startMonth) return []
  const out: string[] = []
  let cur = startMonth
  while (cur <= endMonth) {
    out.push(cur)
    cur = addMonths(cur, 1)
    if (out.length > 36) break
  }
  return out
}

export function monthKeyFromIso(iso: string): string {
  return iso.substring(0, 7)
}

export function bucketByMonthKey<T extends { event_date: string }>(
  items: T[],
  months: string[],
): Record<string, T[]> {
  const buckets: Record<string, T[]> = {}
  for (const m of months) buckets[m] = []
  for (const item of items) {
    const key = monthKeyFromIso(item.event_date)
    if (buckets[key]) buckets[key].push(item)
  }
  return buckets
}

/** True when the events tab actually left and came back, not an Expo Router remount. */
export function shouldRefreshEventsOnFocus(
  blurredAtMs: number | null,
  nowMs: number,
  minBlurMs = 400,
): boolean {
  return blurredAtMs != null && nowMs - blurredAtMs >= minBlurMs
}
