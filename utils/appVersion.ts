import Constants from 'expo-constants'

/** The installed app's version from app.json ("1.2.3"). */
export function currentAppVersion(): string {
  return Constants.expoConfig?.version ?? '0.0.0'
}

/**
 * Compare dotted version strings numerically: -1 if a < b, 0 if equal, 1 if a > b.
 * Missing parts count as 0 ("1.2" == "1.2.0"); non-numeric suffixes are ignored ("1.2.0-beta" == "1.2.0").
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const parse = (v: string) => v.split('-')[0].split('.').map(n => parseInt(n, 10) || 0)
  const pa = parse(a), pb = parse(b)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0, y = pb[i] ?? 0
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

export function isBelowMinimum(current: string, minimum: string | null | undefined): boolean {
  if (!minimum) return false
  return compareVersions(current, minimum) < 0
}
