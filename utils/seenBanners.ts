import { Platform } from 'react-native'

/**
 * Device-side record of one-time banners already shown (see constants/banners).
 * Web reads synchronously from localStorage; native loads AsyncStorage once.
 * Signed-in users are also recorded in user_settings.seen_banners, so a banner
 * seen on one device isn't shown on another.
 */
const STORAGE_KEY = 'vteam.seenBanners'
let seen: Set<string> | null = null
let loading: Promise<Set<string>> | null = null

function webStorage(): Storage | null {
  if (Platform.OS !== 'web') return null
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

function parse(raw: string | null | undefined): Set<string> {
  try {
    const list = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

/** The seen set if already known without waiting (always on web; on native after the first load). */
export function seenBannersNow(): Set<string> | null {
  if (seen) return seen
  const store = webStorage()
  if (store) {
    try { seen = parse(store.getItem(STORAGE_KEY)) } catch { seen = new Set() }
    return seen
  }
  return Platform.OS === 'web' ? (seen = new Set()) : null
}

export function loadSeenBanners(): Promise<Set<string>> {
  const now = seenBannersNow()
  if (now) return Promise.resolve(now)
  if (!loading) {
    loading = (async () => {
      try {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default
        seen = parse(await AsyncStorage.getItem(STORAGE_KEY))
      } catch {
        seen = new Set()
      }
      return seen
    })()
  }
  return loading
}

export function markBannerSeenOnDevice(id: string): void {
  const set = seenBannersNow() ?? (seen = new Set())
  if (set.has(id)) return
  set.add(id)
  const json = JSON.stringify([...set])
  const store = webStorage()
  if (store) {
    try { store.setItem(STORAGE_KEY, json) } catch { /* private mode: shown again next visit */ }
    return
  }
  void import('@react-native-async-storage/async-storage')
    .then(m => m.default.setItem(STORAGE_KEY, json))
    .catch(() => {})
}

/** Test-only. */
export function __resetSeenBanners(): void {
  seen = null
  loading = null
}
