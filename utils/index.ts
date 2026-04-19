import type { Profile, VolleyballPosition, VolleyballSkillLevel, EventAttendee, EventAttendeeCountEmbed } from '../types'
import { AVATARS_BUCKET, CLUB_AVATARS_BUCKET } from '../constants/storage'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!

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

/** Short labels for host roster / team-balance UI (order follows `profiles.position`). */
const VOLLEYBALL_POSITION_ABBREV: Record<VolleyballPosition, string> = {
  setter: 'S',
  libero: 'L',
  outside_hitter: 'OH',
  middle_blocker: 'MB',
  defensive_specialist: 'DS',
  opposite_hitter: 'RH',
}

/** Comma-separated abbreviations (e.g. `S, OH, MB`). Empty array → empty string. */
export function volleyballPositionsAbbreviated(positions: VolleyballPosition[]): string {
  if (!positions.length) return ''
  return positions.map(p => VOLLEYBALL_POSITION_ABBREV[p]).join(', ')
}

/**
 * One line for hosts: skill tier and/or preferred positions (abbrev.), middle dot separator.
 * Uses "Skill not set" when tier missing; omits position segment when none listed.
 */
export function hostRosterSkillAndPositionsLine(profile: Pick<Profile, 'skill_level' | 'position'>): string {
  const skillPart = profile.skill_level ? volleyballSkillLevelLabel(profile.skill_level) : 'Skill not set'
  const posPart = volleyballPositionsAbbreviated(profile.position ?? [])
  return posPart ? `${skillPart} · ${posPart}` : skillPart
}

const VOLLEYBALL_SKILL_LEVEL_ALLOWED = new Set<string>([
  'd', 'c', 'b', 'bb', 'a', 'aa_plus',
])

/** Normalizes DB `skill_level` to a known tier or null. */
export function normalizeVolleyballSkillLevel(raw: unknown): VolleyballSkillLevel | null {
  if (raw == null || raw === '') return null
  if (typeof raw === 'string' && VOLLEYBALL_SKILL_LEVEL_ALLOWED.has(raw)) return raw as VolleyballSkillLevel
  return null
}

const SKILL_LEVEL_LABELS: Record<VolleyballSkillLevel, string> = {
  d:       'D',
  c:       'C',
  b:       'B',
  bb:      'BB',
  a:       'A',
  aa_plus: 'AA+',
}

export function volleyballSkillLevelLabel(level: VolleyballSkillLevel): string {
  return SKILL_LEVEL_LABELS[level]
}

/** `profiles.avatar_url` may hold a legacy full HTTP URL or a storage object path. */
export function profileAvatarFieldIsHttpUrl(ref: string | null | undefined): boolean {
  if (ref == null || ref === '') return false
  return /^https?:\/\//i.test(ref.trim())
}

// ─── Avatar URL helpers (avatars bucket is public) ────────────────────────────

/** Full-resolution public URL for a storage path in the avatars bucket. Synchronous — no network call. */
function avatarPublicUrl(path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${AVATARS_BUCKET}/${path}`
}

/** 80×80 compressed render URL — use for small avatars in lists and cards. */
function avatarSmallUrl(path: string): string {
  return `${SUPABASE_URL}/storage/v1/render/image/public/${AVATARS_BUCKET}/${path}?width=80&height=80&quality=70&resize=cover`
}

/** Resolves `avatar_url` to an `Image` URI. Public bucket — returns immediately. */
export async function resolveProfileAvatarUri(ref: string | null | undefined): Promise<string | null> {
  const r = await resolveProfileAvatarUriWithError(ref)
  return r.uri
}

export async function resolveProfileAvatarUriWithError(
  ref: string | null | undefined,
): Promise<{ uri: string | null; error: string | null }> {
  if (ref == null || ref === '') return { uri: null, error: null }
  const trimmed = ref.trim()
  if (profileAvatarFieldIsHttpUrl(trimmed)) return { uri: trimmed, error: null }
  return { uri: avatarPublicUrl(trimmed), error: null }
}

/** Resolves `avatar_url` to a compressed 80×80 URI — use for small avatars in lists and cards. */
export async function resolveProfileAvatarUriSmall(
  ref: string | null | undefined,
): Promise<{ uri: string | null; error: string | null }> {
  if (ref == null || ref === '') return { uri: null, error: null }
  const trimmed = ref.trim()
  if (profileAvatarFieldIsHttpUrl(trimmed)) return { uri: trimmed, error: null }
  return { uri: avatarSmallUrl(trimmed), error: null }
}

// ─── Club avatar/cover — public bucket ───────────────────────────────────────

/** Resolves a club `avatar_url` or `cover_url` storage path to a public URL. */
export function resolveClubAvatarUri(ref: string | null | undefined): Promise<string | null> {
  if (ref == null || ref === '') return Promise.resolve(null)
  const trimmed = ref.trim()
  if (/^https?:\/\//i.test(trimmed)) return Promise.resolve(trimmed)
  return Promise.resolve(`${SUPABASE_URL}/storage/v1/object/public/${CLUB_AVATARS_BUCKET}/${trimmed}`)
}
