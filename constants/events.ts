// ─── Venues ───────────────────────────────────────────────────────────────────
// Add new locations here — the form picker reads from this array automatically.

export type VenueLocation = { id: string; label: string; address?: string }

export const LOCATIONS: VenueLocation[] = [
  { id: 'roots',       label: 'Roots',       address: '15407 Long Vista Dr Suite 100, Austin, TX 78728'          },
  { id: 'volleyworld', label: 'VolleyWorld',  address: '21419 Martin Ln Suite 240, Pflugerville, TX 78660'        },
  { id: 'crossover',  label: 'Crossover',   address: '1717 Scottsdale Dr, Leander, TX 78641'                    },
  { id: 'other',      label: 'Other'                                                                             },
]

// ─── Templates ────────────────────────────────────────────────────────────────
// Add new templates here — they appear as quick-fill chips in the create form.

export type EventTemplate = {
  id: string
  label: string
  title: string
  description: string
  locationId: string        // must match a LOCATIONS[*].id, or '' for none
  maxAttendees: number | null
}

export const EVENT_TEMPLATES: EventTemplate[] = [
  {
    id: 'open-play',
    label: 'Open Play',
    title: 'Open Play',
    description: 'Come join us for open play! All skill levels welcome.',
    locationId: 'roots',
    maxAttendees: 18,
  },
  {
    id: 'tournament',
    label: 'Tournament',
    title: 'Tournament',
    description: 'Competitive tournament. Teams will be assigned before play.',
    locationId: 'volleyworld',
    maxAttendees: null,
  },
  {
    id: 'practice',
    label: 'Practice',
    title: 'Team Practice',
    description: 'Focused skill-development session.',
    locationId: 'crossover',
    maxAttendees: 12,
  },
]

// ─── Duration ─────────────────────────────────────────────────────────────────

export const DEFAULT_DURATION_MINUTES = 120

export const DURATION_OPTIONS: { label: string; minutes: number }[] = [
  { label: '30 min', minutes: 30  },
  { label: '1h',     minutes: 60  },
  { label: '1.5h',   minutes: 90  },
  { label: '2h',     minutes: 120 },
  { label: '2.5h',   minutes: 150 },
  { label: '3h',     minutes: 180 },
  { label: '4h',     minutes: 240 },
]

// ─── Cheers ───────────────────────────────────────────────────────────────────

export const CHEERS_MAX_PER_EVENT = 5

export type CheerTypeConfig = {
  type: import('../types').CheerType
  label: string
  icon: string
}

export const CHEER_TYPES: CheerTypeConfig[] = [
  { type: 'spike',         label: 'Spiking',        icon: 'flash-outline'               },
  { type: 'block',         label: 'Blocking',        icon: 'shield-outline'              },
  { type: 'serve',         label: 'Serving',         icon: 'radio-outline'               },
  { type: 'dig',           label: 'Digging',         icon: 'arrow-down-circle-outline'   },
  { type: 'set',           label: 'Setting',         icon: 'git-merge-outline'           },
  { type: 'pass',          label: 'Passing',         icon: 'swap-horizontal-outline'     },
  { type: 'communication', label: 'Communication',   icon: 'chatbubbles-outline'         },
]

// ─── Recurrence ───────────────────────────────────────────────────────────────

export type RecurrenceCadence = 'weekly' | 'biweekly' | 'monthly'

export const DAY_LABELS_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const

// ─── Supabase list queries (EventCard / feeds) ─────────────────────────────────
/** Core `events` columns for cards — omits `description` to shrink rows and JSON payload. */
export const EVENT_LIST_EVENT_COLUMNS =
  'id, created_by, club_id, title, location, event_date, duration_minutes, max_attendees, created_at, price'

/** Main Events tab + club upcoming: host, RSVP count, tags, club badge. */
export const EVENT_CARD_LIST_SELECT = `${EVENT_LIST_EVENT_COLUMNS}, profiles!events_created_by_fkey (id, username, first_name, last_name, avatar_url), event_attendees_attending(count), event_guests_attending(count), event_attendees_waitlisted(count), attendee_previews:event_attendees_attending(user_id, profiles!event_attendees_user_id_fkey(id, first_name, last_name, avatar_url)), event_tags (tag_id, tags (id, name, category, display_order)), clubs (id, name, avatar_url)`

/** Hosted / history settings lists: host + RSVP count only (no tag/club embeds). */
export const EVENT_CARD_LIST_SELECT_MINIMAL = `${EVENT_LIST_EVENT_COLUMNS}, profiles!events_created_by_fkey (id, username, first_name, last_name, avatar_url), event_attendees_attending(count), event_guests_attending(count), event_attendees_waitlisted(count)`
