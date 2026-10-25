import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert } from 'react-native'
import { supabase } from '../../lib/supabase'
import { useMutation } from '../../lib/query'
import type { EventGuest, EventWithDetails, TeamAssignment } from '../../types'
import { eventKeys, patchQuery } from './keys'
import { attendeeRowsWithProfiles, deriveAssignments, mergeAssignments, randomizeAssignments } from './derive'
import { reportEventError } from './telemetry'
import type { EventData } from './useEventData'

/**
 * Team builder state for the People/Cheers tabs. `assignments` is the host's
 * working draft: it starts from the saved `team_number`/`team_pinned` columns
 * and is re-merged whenever the cached rows change (someone joins, a refetch
 * lands), keeping unsaved edits for players whose saved value didn't move.
 * Nothing is written until `saveTeams`.
 */
export function useEventTeams(data: EventData, isHostOrCohost: boolean) {
  const { id, userId, roster } = data
  const { attendingRows, attendingGuests, attendees } = roster

  const saved = useMemo(() => deriveAssignments(attendingRows, attendingGuests), [attendingRows, attendingGuests])
  const [assignments, setAssignments] = useState<Record<string, TeamAssignment>>(saved.assignments)
  const [numTeams, setNumTeams] = useState(2)
  const baseRef = useRef(saved.assignments)

  useEffect(() => {
    const base = baseRef.current
    baseRef.current = saved.assignments
    setAssignments(local => mergeAssignments(base, local, saved.assignments))
    if (Object.values(saved.assignments).some(a => a.team !== null)) {
      setNumTeams(prev => Math.max(prev, saved.maxTeam))
    }
  }, [saved])

  const playerIds = useMemo(
    () => [...attendees.map(p => p.id), ...attendingGuests.map(g => g.id)],
    [attendees, attendingGuests],
  )

  function togglePin(playerId: string) {
    setAssignments(prev => ({ ...prev, [playerId]: { ...prev[playerId], pinned: !prev[playerId]?.pinned } }))
  }

  function moveToTeam(playerId: string, team: number | null) {
    setAssignments(prev => ({ ...prev, [playerId]: { team, pinned: prev[playerId]?.pinned ?? false } }))
  }

  function resetTeams() {
    setAssignments(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(k => { next[k] = { team: null, pinned: false } })
      return next
    })
  }

  function randomizeTeams() {
    const result = randomizeAssignments(playerIds, assignments, numTeams)
    if (!result.ok) {
      Alert.alert(result.title, result.message)
      return
    }
    setAssignments(result.assignments)
  }

  const save = useMutation(
    async (draft: Record<string, TeamAssignment>) => {
      const guestIds = new Set(attendingGuests.map(g => g.id))
      const entries = Object.entries(draft)
      const attendeeEntries = entries.filter(([k]) => !guestIds.has(k))
      const guestEntries = entries.filter(([k]) => guestIds.has(k))

      const attendeeResults = await Promise.all(
        attendeeEntries.map(([uid, { team, pinned }]) =>
          supabase.from('event_attendees').update({ team_number: team, team_pinned: pinned })
            .eq('event_id', id).eq('user_id', uid).select('user_id'),
        ),
      )
      const failed = attendeeResults.find(r => r.error)
      if (failed?.error) throw failed.error
      if (attendeeResults.some(r => !r.data || r.data.length === 0)) {
        throw new Error('Update blocked — add an RLS UPDATE policy for event_attendees')
      }
      await Promise.all(
        guestEntries.map(([gid, { team, pinned }]) =>
          supabase.from('event_guests').update({ team_number: team, team_pinned: pinned }).eq('id', gid),
        ),
      )
      return draft
    },
    {
      onSuccess: draft => {
        patchQuery<EventWithDetails | null>(eventKeys.root(id), ev => ev && {
          ...ev,
          event_attendees: attendeeRowsWithProfiles(ev).map(a => {
            const asgn = draft[a.user_id]
            return asgn ? { ...a, team_number: asgn.team, team_pinned: asgn.pinned } : a
          }),
        })
        patchQuery<EventGuest[]>(eventKeys.guests(id), rows => rows.map(g => {
          const asgn = draft[g.id]
          return asgn ? { ...g, team_number: asgn.team, team_pinned: asgn.pinned } : g
        }))
      },
      onError: e => {
        reportEventError(id, userId, 'saveTeams', e)
        Alert.alert('Error', 'Could not save teams. Please try again.')
      },
    },
  )

  const totalPlayers = playerIds.length
  const hasTeams = isHostOrCohost ? totalPlayers > 0 : Object.values(assignments).some(a => a.team !== null)

  return {
    assignments,
    numTeams,
    setNumTeams,
    hasTeams,
    togglePin,
    moveToTeam,
    resetTeams,
    randomizeTeams,
    saveTeams: () => { void save.mutate(assignments) },
    savingTeams: save.isPending,
  }
}

export type EventTeamsApi = ReturnType<typeof useEventTeams>
