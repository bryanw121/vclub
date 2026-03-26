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
