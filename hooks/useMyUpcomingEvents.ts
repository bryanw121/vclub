import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { parseEventDate } from '../utils'
import { EventWithDetails, MyEventStatus, MyUpcomingEvent } from '../types'

/** How many cards the rail renders. The rest are reachable via the Mine filter. */
export const MY_EVENTS_RAIL_CAP = 3

/**
 * The viewer's relationship to one feed event, or null if they have none.
 *
 * Hosting is checked first and outranks an RSVP: a host who also RSVP'd is
 * committed as the host, and that's the more useful label on the card.
 *
 * `my_attendance` is a viewer-scoped embed (0–1 rows). Rows from callers that
 * still embed the attending-only view carry no `status` — treat those as
 * attending rather than dropping them, so an older query can't blank the rail.
 */
export function myStatusFor(event: EventWithDetails, userId: string): MyEventStatus | null {
  if (event.created_by === userId) return 'hosting'
  const row = (event.my_attendance ?? []).find(a => a.user_id === userId)
  if (!row) return null
  switch (row.status ?? 'attending') {
    case 'attending':  return 'attending'
    case 'waitlisted': return 'waitlisted'
    case 'requested':  return 'requested'
    // A denied request is not a commitment — the viewer isn't going anywhere.
    default:           return null
  }
}

/**
 * When the event stops being "upcoming".
 *
 * Deliberately the *end* of the event, not its start: someone standing in the
 * gym at 7:30 for a 7:00 session still needs the card. Matches the `isEventOver`
 * rule on the detail screen.
 */
export function eventEndMs(event: EventWithDetails): number {
  const start = parseEventDate(event.event_date).getTime()
  return start + (event.duration_minutes ?? 0) * 60_000
}

/**
 * Pure derivation: which of the already-loaded feed events is the viewer
 * committed to, soonest first.
 *
 * Tournaments are excluded. They're normalized into the same feed from a
 * different table and carry no attendance rows at all, so they can only ever
 * produce a false "hosting" card for their creator. Team-based tournament
 * registration is its own thing — see the follow-up note in the PR.
 */
export function selectMyUpcomingEvents(
  events: EventWithDetails[],
  userId: string | null,
  nowMs: number,
): MyUpcomingEvent[] {
  if (!userId) return []
  const out: MyUpcomingEvent[] = []
  for (const event of events) {
    if (event._isTournament) continue
    const status = myStatusFor(event, userId)
    if (!status) continue
    const endMs = eventEndMs(event)
    if (endMs <= nowMs) continue
    out.push({
      event,
      status,
      waitlistPosition: null,
      inProgress: parseEventDate(event.event_date).getTime() <= nowMs,
    })
  }
  return out.sort((a, b) => a.event.event_date.localeCompare(b.event.event_date))
}

/**
 * Waitlist positions for the events where the viewer is waitlisted.
 *
 * Position can't come from the feed query: it depends on where the viewer sits
 * among *all* waitlisted rows for that event, and the feed's `my_attendance`
 * embed is scoped to the viewer. Fetching it needs the other rows — but only for
 * the handful of events the viewer is actually waitlisted on, which is almost
 * always zero. No waitlisted events → no query at all.
 */
export function useWaitlistPositions(eventIds: string[], userId: string | null) {
  const [positions, setPositions] = useState<Record<string, number>>({})
  // Join the ids so the effect keys off contents, not array identity — the
  // caller rebuilds this array on every render.
  const key = eventIds.join(',')
  const latestRequest = useRef(0)

  useEffect(() => {
    if (!userId || eventIds.length === 0) {
      setPositions({})
      return
    }
    const requestId = ++latestRequest.current
    void (async () => {
      const { data, error } = await supabase
        .from('event_attendees')
        .select('event_id, user_id, joined_at')
        .in('event_id', eventIds)
        .eq('status', 'waitlisted')
        .order('joined_at', { ascending: true })
      // A later request already answered — discard this one.
      if (requestId !== latestRequest.current) return
      if (error || !data) return

      const seenPerEvent: Record<string, number> = {}
      const next: Record<string, number> = {}
      for (const row of data as Array<{ event_id: string; user_id: string }>) {
        const rank = (seenPerEvent[row.event_id] = (seenPerEvent[row.event_id] ?? 0) + 1)
        if (row.user_id === userId) next[row.event_id] = rank
      }
      setPositions(next)
    })()
  }, [key, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  return positions
}

/**
 * The "You're going" rail's data. Derives from events already in memory, then
 * hydrates waitlist positions only when the viewer is actually waitlisted.
 *
 * `nowMs` is a parameter so tests can pin it; callers pass nothing and get a
 * value that advances each minute, which is what drops a finished event off the
 * rail without a refetch.
 */
export function useMyUpcomingEvents(
  events: EventWithDetails[],
  userId: string | null,
  nowMs?: number,
): MyUpcomingEvent[] {
  const [tickNow, setTickNow] = useState(() => Date.now())
  useEffect(() => {
    if (nowMs !== undefined) return
    const t = setInterval(() => setTickNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [nowMs])

  const effectiveNow = nowMs ?? tickNow

  const mine = useMemo(
    () => selectMyUpcomingEvents(events, userId, effectiveNow),
    [events, userId, effectiveNow],
  )

  const waitlistedIds = useMemo(
    () => mine.filter(m => m.status === 'waitlisted').map(m => m.event.id),
    [mine],
  )
  const positions = useWaitlistPositions(waitlistedIds, userId)

  return useMemo(
    () => mine.map(m => (
      m.status === 'waitlisted' && positions[m.event.id] !== undefined
        ? { ...m, waitlistPosition: positions[m.event.id] }
        : m
    )),
    [mine, positions],
  )
}
