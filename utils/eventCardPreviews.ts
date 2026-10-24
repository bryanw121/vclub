import { supabase } from '../lib/supabase'
import type { EventWithDetails } from '../types'

type PreviewRow = {
  event_id: string
  user_id: string
  username: string
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
}

export type EventCardPreviews = Map<string, EventWithDetails['attendee_previews']>

/**
 * Up to 3 attendee avatar previews per event via RPC (avoids unbounded
 * `event_attendees_attending → profiles` embeds on list queries).
 * Returns an empty map on error — previews are decoration, never block a list.
 */
export async function fetchEventCardPreviews(eventIds: string[]): Promise<EventCardPreviews> {
  const byEvent: EventCardPreviews = new Map()
  if (eventIds.length === 0) return byEvent

  const { data, error } = await supabase.rpc('get_event_card_attendee_previews', {
    p_event_ids: eventIds,
  })
  if (error) {
    console.error('[fetchEventCardPreviews]', error.message)
    return byEvent
  }

  for (const row of (data ?? []) as PreviewRow[]) {
    const list = byEvent.get(row.event_id) ?? []
    list.push({
      user_id: row.user_id,
      profiles: {
        id: row.user_id,
        username: row.username,
        first_name: row.first_name,
        last_name: row.last_name,
        avatar_url: row.avatar_url,
      },
    })
    byEvent.set(row.event_id, list)
  }
  return byEvent
}

/** Copy of `events` with `attendee_previews` filled from `previews` (tournaments get none). */
export function withEventCardPreviews(
  events: EventWithDetails[],
  previews: EventCardPreviews,
): EventWithDetails[] {
  return events.map(e => ({
    ...e,
    attendee_previews: e._isTournament ? [] : (previews.get(e.id) ?? e.attendee_previews ?? []),
  }))
}

/** Fetch + attach in one step, for screens that render after both are ready. */
export async function attachEventCardPreviews(
  events: EventWithDetails[],
): Promise<EventWithDetails[]> {
  const previews = await fetchEventCardPreviews(events.filter(e => !e._isTournament).map(e => e.id))
  return withEventCardPreviews(events, previews)
}
