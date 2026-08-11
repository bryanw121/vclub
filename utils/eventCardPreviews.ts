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

/**
 * Attach up to 3 attendee avatar previews per event via RPC (avoids unbounded
 * `event_attendees_attending → profiles` embeds on list queries).
 */
export async function attachEventCardPreviews(
  events: EventWithDetails[],
): Promise<EventWithDetails[]> {
  const ids = events.filter(e => !e._isTournament).map(e => e.id)
  if (ids.length === 0) return events

  const { data, error } = await supabase.rpc('get_event_card_attendee_previews', {
    p_event_ids: ids,
  })
  if (error) {
    console.error('[attachEventCardPreviews]', error.message)
    return events.map(e => ({ ...e, attendee_previews: e.attendee_previews ?? [] }))
  }

  const byEvent = new Map<string, EventWithDetails['attendee_previews']>()
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

  return events.map(e => ({
    ...e,
    attendee_previews: e._isTournament ? [] : (byEvent.get(e.id) ?? []),
  }))
}
