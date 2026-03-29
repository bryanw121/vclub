// ─── Venues ───────────────────────────────────────────────────────────────────
// Add new locations here — the form picker reads from this array automatically.

export type VenueLocation = { id: string; label: string }

export const LOCATIONS: VenueLocation[] = [
  { id: 'roots',       label: 'Roots'       },
  { id: 'volleyworld', label: 'VolleyWorld'  },
  { id: 'crossover',  label: 'CrossOver'   },
  { id: 'other',      label: 'Other'       },
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

// ─── Recurrence ───────────────────────────────────────────────────────────────

export type RecurrenceCadence = 'weekly' | 'biweekly' | 'monthly'

export const DAY_LABELS_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const

// ─── Supabase list queries (EventCard / feeds) ─────────────────────────────────
/** Core `events` columns for cards — omits `description` to shrink rows and JSON payload. */
export const EVENT_LIST_EVENT_COLUMNS =
  'id, created_by, club_id, title, location, event_date, max_attendees, created_at'

/** Main Events tab + club upcoming: host, RSVP count, tags, club badge. */
export const EVENT_CARD_LIST_SELECT = `${EVENT_LIST_EVENT_COLUMNS}, profiles!events_created_by_fkey (id, username, first_name, last_name, avatar_url), event_attendees_attending(count), event_guests_attending(count), event_tags (tag_id, tags (id, name, category, display_order)), clubs (id, name, avatar_url)`

/** Hosted / history settings lists: host + RSVP count only (no tag/club embeds). */
export const EVENT_CARD_LIST_SELECT_MINIMAL = `${EVENT_LIST_EVENT_COLUMNS}, profiles!events_created_by_fkey (id, username, first_name, last_name, avatar_url), event_attendees_attending(count), event_guests_attending(count)`
