/**
 * Types for the tournament detail screen, its hooks and the schedule generator.
 * Kept beside (not inside) `types/index.ts` so the tournament work does not
 * conflict with other screens' type edits; fold into index.ts when convenient.
 */
import type {
  Profile, Tournament, TournamentFormat, TournamentMatch, TournamentPrize, TournamentRules,
  TournamentTeam, TournamentTeamInvitation, TournamentTeamJoinRequest,
} from './index'

// ─── Schedule generator ───────────────────────────────────────────────────────

export type ScheduleConfig = {
  numCourts: number
  /** Minutes a match occupies a court. */
  matchDuration: number
  /** Minutes between consecutive time slots. */
  breakDuration: number
  /** Max opponents each team faces; null = full round robin. */
  gamesPerTeam: number | null
}

export type ScheduleInput = {
  format: TournamentFormat
  /** First slot starts here. */
  startDate: Date
  /** Registered team ids, in registration order. */
  teamIds: string[]
  config: ScheduleConfig
  /** Injected for tests; defaults to Math.random. Only used to deal pool play teams. */
  random?: () => number
}

/** One pool to create. `key` links matches to it before the DB assigns ids. */
export type SchedulePool = {
  key: string
  name: string
  display_order: number
  team_ids: string[]
}

/** A match row as the `replace_tournament_schedule` RPC takes it. */
export type ScheduleMatch = {
  pool_key: string | null
  stage: 'pool_play' | 'bracket' | 'round_robin'
  round: number
  match_number: number
  team_a_id: string
  team_b_id: string
  court: string
  scheduled_at: string
  status: 'scheduled'
}

export type GeneratedSchedule = {
  pools: SchedulePool[]
  matches: ScheduleMatch[]
}

// ─── Screen data ──────────────────────────────────────────────────────────────

export type TournamentCore = {
  /** null = no such tournament (or RLS hides it). */
  tournament: Tournament | null
  rules: TournamentRules | null
  prizes: TournamentPrize[]
}

export type TournamentViewer = Pick<Profile, 'id' | 'username' | 'first_name' | 'last_name'>

export type JoinRequestRequester = Pick<Profile, 'id' | 'username' | 'first_name' | 'last_name' | 'skill_level' | 'position'>

export type TournamentJoinRequestWithRequester = TournamentTeamJoinRequest & {
  requester: JoinRequestRequester | null
}

export type PendingInvite = TournamentTeamInvitation & { team_name: string }

/** The signed-in viewer's own state in one tournament. */
export type MyRegistration = {
  profile: TournamentViewer | null
  team: TournamentTeam | null
  invites: PendingInvite[]
  /** Pending requests the viewer can act on (their team's, or all of them for the organizer). */
  joinRequests: TournamentJoinRequestWithRequester[]
}

export type TournamentMatchRow = Pick<
  TournamentMatch,
  | 'id' | 'tournament_id' | 'pool_id' | 'stage' | 'round' | 'match_number' | 'team_a_id' | 'team_b_id'
  | 'court' | 'scheduled_at' | 'status' | 'winner_id' | 'bracket_round_name' | 'is_losers_bracket'
>

/** Which destructive action the confirm dialog is asking about. */
export type TournamentConfirm =
  | { kind: 'withdraw' }
  | { kind: 'removeTeam'; teamId: string; teamName: string }
  | { kind: 'deleteComment'; commentId: string }
