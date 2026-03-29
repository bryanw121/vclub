import type { Profile, VolleyballPosition, EventAttendee, EventAttendeeCountEmbed } from '../types'
import { supabase } from '../lib/supabase'
import { AVATARS_BUCKET, AVATAR_SIGNED_URL_TTL_SEC } from '../constants/storage'

export function formatEventDate(dateString: string, style: 'short' | 'long' = 'short') {
  // Supabase `timestamp without time zone` returns strings with no timezone suffix
  // (e.g. "2024-03-28T20:00:00"). JS treats those as local time, not UTC, which
  // shifts the displayed time by the user's UTC offset. Appending 'Z' forces UTC.
  const normalized = /[Z+]/.test(dateString) ? dateString : dateString + 'Z'
  const date = new Date(normalized)
  const options: Intl.DateTimeFormatOptions = {
    weekday: style === 'long' ? 'long' : 'short',
    month: style === 'long' ? 'long' : 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }
  return date.toLocaleString('en-US', options)
}

/** Display name for lists and comments (matches event detail / attendee cards). */
export function profileDisplayName(profile: Pick<Profile, 'username' | 'first_name' | 'last_name'>): string {
  if (profile.first_name && profile.last_name) {
    return `${profile.first_name} ${profile.last_name.charAt(0)}.`
  }
  return profile.username
}

export function profileInitial(profile: Pick<Profile, 'username' | 'first_name' | 'last_name'>): string {
  if (profile.first_name && profile.last_name) {
    return profile.first_name.charAt(0).toUpperCase() + profile.last_name.charAt(0).toUpperCase()
  }
  return profile.username.charAt(0).toUpperCase()
}

export function cleanDate(d: Date) {
  const clean = new Date(d)
  clean.setSeconds(0, 0)
  return clean.toISOString()
}

export function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

type EventAttendeesRelation = readonly (EventAttendee | EventAttendeeCountEmbed)[] | null | undefined

function isEventAttendeeCountEmbedRow(row: EventAttendee | EventAttendeeCountEmbed): row is EventAttendeeCountEmbed {
  return 'count' in row && !('user_id' in row)
}

/** Full attendee rows when the query embedded row data; empty when the relation is `event_attendees(count)` only. */
export function eventAttendeeRows(event: { event_attendees?: EventAttendeesRelation }): EventAttendee[] {
  const ea = event.event_attendees
  if (!ea || ea.length === 0) return []
  if (isEventAttendeeCountEmbedRow(ea[0])) return []
  return ea as EventAttendee[]
}

function listHeadcountFromEmbed(
  attending: readonly EventAttendeeCountEmbed[] | undefined,
  guests: readonly EventAttendeeCountEmbed[] | undefined,
): number | null {
  if (!attending || attending.length === 0 || !isEventAttendeeCountEmbedRow(attending[0])) return null
  const a = Math.max(0, Number(attending[0].count))
  const g =
    guests && guests.length > 0 && isEventAttendeeCountEmbedRow(guests[0]) ? Math.max(0, Number(guests[0].count)) : 0
  return a + g
}

/**
 * Count for EventCard / capacity: list queries use attending-only embeds (+1 guests included);
 * full `event_attendees` rows count non-waitlisted attendees only (guests are not on that relation).
 */
export function eventAttendeeDisplayCount(event: {
  event_attendees?: EventAttendeesRelation
  event_attendees_attending?: readonly EventAttendeeCountEmbed[]
  event_guests_attending?: readonly EventAttendeeCountEmbed[]
}): number {
  const fromList = listHeadcountFromEmbed(event.event_attendees_attending, event.event_guests_attending)
  if (fromList !== null) return fromList
  const ea = event.event_attendees
  if (!ea || ea.length === 0) return 0
  if (isEventAttendeeCountEmbedRow(ea[0])) return Math.max(0, Number(ea[0].count))
  return (ea as EventAttendee[]).filter(a => a.status !== 'waitlisted').length
}

const VOLLEYBALL_POSITION_ALLOWED = new Set<string>([
  'setter',
  'libero',
  'outside_hitter',
  'defensive_specialist',
  'opposite_hitter',
])

/** Normalizes DB `position` (text[], null, or legacy single text) to a deduped list. */
export function normalizeVolleyballPositions(raw: unknown): VolleyballPosition[] {
  if (raw == null) return []
  if (Array.isArray(raw)) {
    const out: VolleyballPosition[] = []
    const seen = new Set<string>()
    for (const x of raw) {
      if (typeof x !== 'string' || !VOLLEYBALL_POSITION_ALLOWED.has(x) || seen.has(x)) continue
      seen.add(x)
      out.push(x as VolleyballPosition)
    }
    return out
  }
  if (typeof raw === 'string' && VOLLEYBALL_POSITION_ALLOWED.has(raw))
    return [raw as VolleyballPosition]
  return []
}

export function volleyballPositionsEqualUnordered(a: VolleyballPosition[], b: VolleyballPosition[]): boolean {
  if (a.length !== b.length) return false
  const sb = [...b].sort()
  return [...a].sort().every((v, i) => v === sb[i])
}

/** `profiles.avatar_url` may hold a legacy full URL or a storage path for private buckets. */
export function profileAvatarFieldIsHttpUrl(ref: string | null | undefined): boolean {
  if (ref == null || ref === '') return false
  return /^https?:\/\//i.test(ref.trim())
}

/** Resolves `avatar_url` to an `Image` URI (signed URL for storage paths). */
export async function resolveProfileAvatarUri(ref: string | null | undefined): Promise<string | null> {
  const r = await resolveProfileAvatarUriWithError(ref)
  if (r.error) {
    console.warn('[vclub avatar]', r.error)
  }
  return r.uri
}

export async function resolveProfileAvatarUriWithError(
  ref: string | null | undefined,
): Promise<{ uri: string | null; error: string | null }> {
  if (ref == null || ref === '') return { uri: null, error: null }
  const trimmed = ref.trim()
  if (profileAvatarFieldIsHttpUrl(trimmed)) return { uri: trimmed, error: null }
  const { data, error } = await supabase.storage
    .from(AVATARS_BUCKET)
    .createSignedUrl(trimmed, AVATAR_SIGNED_URL_TTL_SEC)
  if (error) return { uri: null, error: error.message }
  if (!data?.signedUrl) return { uri: null, error: 'No signed URL returned' }
  return { uri: data.signedUrl, error: null }
}
