import { useMemo } from 'react'
import { STALE } from '../../constants/cache'
import { useFocusRefetch, useQuery } from '../../lib/query'
import type { MentionUser, TournamentTeamWithRoster } from '../../types'
import {
  fetchComments, fetchMatches, fetchMyRegistration, fetchTeams, fetchTournamentCore, tournamentKeys,
} from './api'

/** @-mention candidates: everyone on a roster, once each. */
export function mentionableFromTeams(teams: readonly TournamentTeamWithRoster[]): MentionUser[] {
  const users: MentionUser[] = []
  const seen = new Set<string>()
  for (const team of teams) {
    for (const m of team.members) {
      const p = m.profiles
      if (p && !seen.has(p.id)) {
        seen.add(p.id)
        users.push({
          id: p.id,
          username: p.username,
          displayName: [p.first_name, p.last_name].filter(Boolean).join(' ') || p.username,
        })
      }
    }
  }
  return users
}

/**
 * Everything the tournament detail screen reads, as independent cached queries.
 * They all depend only on the route id (and the signed-in user, from the session
 * context — no network hop), so they start together in one request round:
 *   core (tournament + rules + prizes), teams, comments, the viewer's registration
 *   (+ invites + join requests + name), and — once the Schedule tab has been
 *   opened — matches.
 */
export function useTournamentData(id: string, userId: string | null, opts: { loadMatches: boolean }) {
  const core = useQuery(tournamentKeys.core(id), () => fetchTournamentCore(id), { staleMs: STALE.detail })
  const teams = useQuery(tournamentKeys.teams(id), () => fetchTeams(id), { staleMs: STALE.detail })
  const comments = useQuery(tournamentKeys.comments(id), () => fetchComments(id), { staleMs: STALE.detail })
  const mine = useQuery(
    tournamentKeys.mine(id, userId),
    () => fetchMyRegistration(id, userId as string),
    { staleMs: STALE.detail, enabled: !!userId },
  )
  const matches = useQuery(tournamentKeys.matches(id), () => fetchMatches(id), {
    staleMs: STALE.detail,
    enabled: opts.loadMatches,
  })

  useFocusRefetch(tournamentKeys.core(id))
  useFocusRefetch(tournamentKeys.teams(id))
  useFocusRefetch(tournamentKeys.comments(id))
  useFocusRefetch(userId ? tournamentKeys.mine(id, userId) : null)
  useFocusRefetch(opts.loadMatches ? tournamentKeys.matches(id) : null)

  const teamList = teams.data
  const mentionableUsers = useMemo(() => mentionableFromTeams(teamList ?? []), [teamList])

  return { core, teams, comments, mine, matches, mentionableUsers }
}
