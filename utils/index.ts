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

/**
 * Short "Mar 28, 8:00 PM" stamp for comment/discussion rows. Normalizes the
 * missing-timezone Supabase string to UTC (see `formatEventDate`) so the time
 * doesn't shift by the viewer's offset.
 */
export function formatCommentTime(iso: string): string {
  const normalized = /[Z+]/.test(iso) ? iso : iso + 'Z'
  return new Date(normalized).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

/** Human duration label, e.g. "45 min" or "2h". */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = minutes / 60
  return `${h}h`
}

// ─── Member display names ─────────────────────────────────────────────────────

type NameParts = Pick<Profile, 'username' | 'first_name' | 'last_name'>

/**
 * How a member's real name renders across shared surfaces (event rosters,
 * comments, chat, clubs, tournaments).
 *
 *   'full'        → "Jordan Rivera"
 *   'abbreviated' → "Jordan R."
 *
 * Deliberately a single switch: the last-name-visibility call is a product /
 * privacy decision, so flipping it back is a one-line change here rather than
 * an edit across every call site.
 */
export const DISPLAY_NAME_FORMAT: 'full' | 'abbreviated' = 'full'

/** Trimmed value, or null when absent/blank — DB holds null *and* empty strings. */
function cleanNamePart(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/**
 * The name shown for a member anywhere other than their own profile header.
 *
 * Falls back progressively: both names → whichever single name is set →
 * username. Members who filled in only a first name previously fell all the
 * way through to their username, which is why real names appeared to be
 * "profile-only" on the events page.
 */
export function profileDisplayName(profile: NameParts): string {
  const first = cleanNamePart(profile.first_name)
  const last = cleanNamePart(profile.last_name)

  if (first && last) {
    return DISPLAY_NAME_FORMAT === 'full' ? `${first} ${last}` : `${first} ${last.charAt(0)}.`
  }
  return first ?? last ?? cleanNamePart(profile.username) ?? 'Member'
}

/**
 * The name for a profile *header* (own profile, another member's profile).
 *
 * Always the full real name — a profile page is where someone expects to see
 * it in full, so this deliberately ignores `DISPLAY_NAME_FORMAT`. Flipping
 * that switch back to 'abbreviated' must not turn a profile header into
 * "Jordan R.".
 */
export function profileFullName(profile: NameParts): string {
  const first = cleanNamePart(profile.first_name)
  const last = cleanNamePart(profile.last_name)
  const joined = [first, last].filter(Boolean).join(' ')
  return joined || cleanNamePart(profile.username) || 'Member'
}

/** Avatar-placeholder initials. Mirrors `profileDisplayName`'s fallback order. */
export function profileInitial(profile: NameParts): string {
  const first = cleanNamePart(profile.first_name)
  const last = cleanNamePart(profile.last_name)

  if (first && last) return first.charAt(0).toUpperCase() + last.charAt(0).toUpperCase()
  const single = first ?? last ?? cleanNamePart(profile.username)
  return single ? single.charAt(0).toUpperCase() : '?'
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

/**
 * Synchronous small-avatar URI for `<Image>` — public bucket, no network call.
 * Legacy full HTTP URLs pass through; storage paths become a `size`×`size` render URL.
 * Returns null for empty refs. Use this in list/message rows that resolve inline.
 */
export function profileAvatarSmallUri(ref: string | null | undefined, size = 80): string | null {
  if (ref == null || ref === '') return null
  const trimmed = ref.trim()
  if (profileAvatarFieldIsHttpUrl(trimmed)) return trimmed
  return `${SUPABASE_URL}/storage/v1/render/image/public/${AVATARS_BUCKET}/${trimmed}?width=${size}&height=${size}&quality=70&resize=cover`
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
