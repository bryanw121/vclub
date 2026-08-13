import { myStatusFor, eventEndMs, selectMyUpcomingEvents } from '../hooks/useMyUpcomingEvents'
import { EventWithDetails } from '../types'

const ME = 'user-me'
const OTHER = 'user-other'

/** Suffix-less ISO, exactly what PostgREST returns for `timestamp without time zone`. */
function isoIn(minutesFromNow: number, nowMs: number): string {
  return new Date(nowMs + minutesFromNow * 60_000).toISOString().replace(/\.\d{3}Z$/, '')
}

function makeEvent(over: Partial<EventWithDetails> & { id: string }): EventWithDetails {
  return {
    created_by: OTHER,
    club_id: null,
    title: `Event ${over.id}`,
    description: null,
    location: 'Roots',
    event_date: '2026-08-20T19:00:00',
    duration_minutes: 120,
    max_attendees: 12,
    created_at: '2026-08-01T00:00:00',
    price: 0,
    cancelled_at: null,
    profiles: { id: OTHER } as any,
    my_attendance: [],
    ...over,
  } as EventWithDetails
}

describe('myStatusFor', () => {
  it('returns null when the viewer has no relationship to the event', () => {
    expect(myStatusFor(makeEvent({ id: 'a' }), ME)).toBeNull()
  })

  it('reports attending', () => {
    const e = makeEvent({ id: 'a', my_attendance: [{ user_id: ME, status: 'attending' }] })
    expect(myStatusFor(e, ME)).toBe('attending')
  })

  it('reports waitlisted', () => {
    const e = makeEvent({ id: 'a', my_attendance: [{ user_id: ME, status: 'waitlisted' }] })
    expect(myStatusFor(e, ME)).toBe('waitlisted')
  })

  it('reports requested', () => {
    const e = makeEvent({ id: 'a', my_attendance: [{ user_id: ME, status: 'requested' }] })
    expect(myStatusFor(e, ME)).toBe('requested')
  })

  it('treats a denied request as no commitment', () => {
    const e = makeEvent({ id: 'a', my_attendance: [{ user_id: ME, status: 'denied' }] })
    expect(myStatusFor(e, ME)).toBeNull()
  })

  it('reports hosting for the creator even with no RSVP row', () => {
    expect(myStatusFor(makeEvent({ id: 'a', created_by: ME }), ME)).toBe('hosting')
  })

  it('prefers hosting over an RSVP when the host also RSVPd', () => {
    const e = makeEvent({ id: 'a', created_by: ME, my_attendance: [{ user_id: ME, status: 'attending' }] })
    expect(myStatusFor(e, ME)).toBe('hosting')
  })

  it('ignores another user\'s attendance row', () => {
    const e = makeEvent({ id: 'a', my_attendance: [{ user_id: OTHER, status: 'attending' }] })
    expect(myStatusFor(e, ME)).toBeNull()
  })

  it('treats a status-less row as attending, so an older query cannot blank the rail', () => {
    // Rows from the previous attending-only embed carry no `status`.
    const e = makeEvent({ id: 'a', my_attendance: [{ user_id: ME }] })
    expect(myStatusFor(e, ME)).toBe('attending')
  })
})

describe('eventEndMs', () => {
  it('is start plus duration', () => {
    const e = makeEvent({ id: 'a', event_date: '2026-08-20T19:00:00', duration_minutes: 90 })
    const start = new Date('2026-08-20T19:00:00Z').getTime()
    expect(eventEndMs(e)).toBe(start + 90 * 60_000)
  })

  it('treats a null duration as zero rather than NaN', () => {
    const e = makeEvent({ id: 'a', event_date: '2026-08-20T19:00:00', duration_minutes: null as any })
    expect(eventEndMs(e)).toBe(new Date('2026-08-20T19:00:00Z').getTime())
  })
})

describe('selectMyUpcomingEvents', () => {
  const NOW = Date.parse('2026-08-20T18:00:00Z')

  it('returns nothing when signed out', () => {
    const e = makeEvent({ id: 'a', my_attendance: [{ user_id: ME, status: 'attending' }] })
    expect(selectMyUpcomingEvents([e], null, NOW)).toEqual([])
  })

  it('returns nothing when the viewer is registered for nothing', () => {
    expect(selectMyUpcomingEvents([makeEvent({ id: 'a' })], ME, NOW)).toEqual([])
  })

  it('includes attending, waitlisted, requested and hosted events', () => {
    const events = [
      makeEvent({ id: 'att',  event_date: isoIn(60,  NOW), my_attendance: [{ user_id: ME, status: 'attending'  }] }),
      makeEvent({ id: 'wait', event_date: isoIn(120, NOW), my_attendance: [{ user_id: ME, status: 'waitlisted' }] }),
      makeEvent({ id: 'req',  event_date: isoIn(180, NOW), my_attendance: [{ user_id: ME, status: 'requested'  }] }),
      makeEvent({ id: 'host', event_date: isoIn(240, NOW), created_by: ME }),
    ]
    expect(selectMyUpcomingEvents(events, ME, NOW).map(m => [m.event.id, m.status])).toEqual([
      ['att', 'attending'],
      ['wait', 'waitlisted'],
      ['req', 'requested'],
      ['host', 'hosting'],
    ])
  })

  it('sorts soonest first regardless of input order', () => {
    const events = [
      makeEvent({ id: 'late',  event_date: isoIn(600, NOW), my_attendance: [{ user_id: ME, status: 'attending' }] }),
      makeEvent({ id: 'soon',  event_date: isoIn(30,  NOW), my_attendance: [{ user_id: ME, status: 'attending' }] }),
      makeEvent({ id: 'mid',   event_date: isoIn(300, NOW), my_attendance: [{ user_id: ME, status: 'attending' }] }),
    ]
    expect(selectMyUpcomingEvents(events, ME, NOW).map(m => m.event.id)).toEqual(['soon', 'mid', 'late'])
  })

  // The whole point of cutting on end rather than start: you're in the gym.
  it('keeps an event that started 30 minutes ago and runs 120', () => {
    const e = makeEvent({
      id: 'live',
      event_date: isoIn(-30, NOW),
      duration_minutes: 120,
      my_attendance: [{ user_id: ME, status: 'attending' }],
    })
    const out = selectMyUpcomingEvents([e], ME, NOW)
    expect(out.map(m => m.event.id)).toEqual(['live'])
    expect(out[0].inProgress).toBe(true)
  })

  it('drops an event that has already ended', () => {
    const e = makeEvent({
      id: 'done',
      event_date: isoIn(-180, NOW),
      duration_minutes: 120,
      my_attendance: [{ user_id: ME, status: 'attending' }],
    })
    expect(selectMyUpcomingEvents([e], ME, NOW)).toEqual([])
  })

  it('drops an event at the exact instant it ends', () => {
    const e = makeEvent({
      id: 'edge',
      event_date: isoIn(-120, NOW),
      duration_minutes: 120,
      my_attendance: [{ user_id: ME, status: 'attending' }],
    })
    expect(selectMyUpcomingEvents([e], ME, NOW)).toEqual([])
  })

  it('marks a not-yet-started event as not in progress', () => {
    const e = makeEvent({ id: 'soon', event_date: isoIn(30, NOW), my_attendance: [{ user_id: ME, status: 'attending' }] })
    expect(selectMyUpcomingEvents([e], ME, NOW)[0].inProgress).toBe(false)
  })

  it('leaves waitlistPosition null — it is hydrated separately', () => {
    const e = makeEvent({ id: 'w', event_date: isoIn(30, NOW), my_attendance: [{ user_id: ME, status: 'waitlisted' }] })
    expect(selectMyUpcomingEvents([e], ME, NOW)[0].waitlistPosition).toBeNull()
  })

  it('excludes tournaments, which carry no attendance rows and would show a false HOSTING card', () => {
    const t = makeEvent({ id: 't', created_by: ME, event_date: isoIn(60, NOW), _isTournament: true })
    expect(selectMyUpcomingEvents([t], ME, NOW)).toEqual([])
  })

  it('does not include an event the viewer was denied from', () => {
    const e = makeEvent({ id: 'd', event_date: isoIn(60, NOW), my_attendance: [{ user_id: ME, status: 'denied' }] })
    expect(selectMyUpcomingEvents([e], ME, NOW)).toEqual([])
  })
})
