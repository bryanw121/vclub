import { supabase } from '../lib/supabase'
import type { EventCardPreviewRow, EventCardPreviews, EventWithDetails } from '../types'

/**
 * Group preview rows by event. Every id in `eventIds` gets an entry (empty when
 * nobody is going yet), so merging the result replaces stale previews too.
 */
export function previewsFromRows(rows: EventCardPreviewRow[], eventIds: string[] = []): EventCardPreviews {
  const byEvent: EventCardPreviews = new Map(eventIds.map(id => [id, []]))
  for (const row of rows) {
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

/**
 * Up to 3 attendee avatar previews per event via RPC (avoids unbounded
 * `event_attendees_attending → profiles` embeds on list queries).
 * Returns an empty map on error — previews are decoration, never block a list.
 */
export async function fetchEventCardPreviews(eventIds: string[]): Promise<EventCardPreviews> {
  if (eventIds.length === 0) return new Map()

  const { data, error } = await supabase.rpc('get_event_card_attendee_previews', {
    p_event_ids: eventIds,
  })
  if (error) {
    console.error('[fetchEventCardPreviews]', error.message)
    return new Map()
  }
  return previewsFromRows(data ?? [])
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
