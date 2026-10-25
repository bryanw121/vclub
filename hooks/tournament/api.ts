import { supabase } from '../../lib/supabase'
import { queryKey } from '../../lib/query'
import type {
  Tournament, TournamentComment, TournamentRules, TournamentTeam, TournamentTeamWithRoster,
  TournamentPrize, TournamentCommentWithAuthor,
} from '../../types'
import type {
  GeneratedSchedule, MyRegistration, PendingInvite, TournamentCore,
  TournamentJoinRequestWithRequester, TournamentMatchRow, TournamentViewer,
} from '../../types/tournamentScreen'

/**
 * Every Supabase call the tournament detail screen makes. Reads return data and
 * writes return nothing useful; both THROW on a Supabase `{ error }` so callers
 * (useQuery fetchers, useMutation fns) see failures instead of swallowing them.
 */

// ─── Query keys ───────────────────────────────────────────────────────────────

export const tournamentKeys = {
  /** Prefix: every cached read for this tournament. */
  all: (id: string) => queryKey('tournament', id),
  core: (id: string) => queryKey('tournament', id, 'core'),
  teams: (id: string) => queryKey('tournament', id, 'teams'),
  comments: (id: string) => queryKey('tournament', id, 'comments'),
  matches: (id: string) => queryKey('tournament', id, 'matches'),
  mine: (id: string, userId: string | null) => queryKey('tournament', id, 'mine', userId),
  /** Prefix covering `mine` for any user. */
  minePrefix: (id: string) => queryKey('tournament', id, 'mine'),
}

// ─── Select lists (explicit columns, no select('*')) ──────────────────────────

export const TOURNAMENT_COLUMNS =
  'id, club_id, created_by, title, description, location, skill_levels, start_date, registration_deadline, status, format, bracket_type, max_teams, min_roster_size, max_roster_size, teams_advance_per_pool, has_refs, price, venmo_handle, schedule_published, match_duration_minutes, break_duration_minutes, num_courts, schedule_generated_at, published_at, cancelled_at, created_at'

export const RULES_COLUMNS =
  'tournament_id, starting_score, winning_score, deciding_set_score, win_by_margin, point_cap, sets_to_win'

export const PRIZE_COLUMNS = 'id, tournament_id, place_label, description, amount, display_order, created_at'

export const TEAM_COLUMNS =
  'id, tournament_id, name, captain_user_id, status, is_locked, seed, is_approved, is_paid, created_at'

const TEAMS_WITH_ROSTER_SELECT = `
  ${TEAM_COLUMNS},
  tournament_team_members (
    id, team_id, user_id, is_captain, joined_at,
    profiles!tournament_team_members_user_id_fkey (id, username, first_name, last_name, avatar_url, skill_level, position)
  )
`

const MY_MEMBERSHIP_SELECT = `team_id, tournament_teams!inner(${TEAM_COLUMNS})`

const COMMENT_SELECT =
  'id, tournament_id, user_id, body, parent_id, mentions, is_announcement, edited_at, deleted_at, created_at, profiles!tournament_comments_user_id_fkey(id, username, first_name, last_name, avatar_url, selected_border)'

const MATCH_COLUMNS =
  'id, tournament_id, pool_id, stage, round, match_number, team_a_id, team_b_id, court, scheduled_at, status, winner_id, bracket_round_name, is_losers_bracket'

const INVITE_SELECT = 'id, tournament_id, team_id, inviter_id, invitee_id, status, created_at, tournament_teams!inner(name)'

const JOIN_REQUEST_SELECT =
  'id, tournament_id, team_id, requester_id, status, created_at, profiles!tournament_team_join_requests_requester_id_fkey(id, username, first_name, last_name, skill_level, position)'

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Result<T> = { data: T; error: { message: string } | null }

/** Await a PostgREST call; throw its error, otherwise hand back `data`. */
async function ok<T>(call: PromiseLike<Result<T>>): Promise<T> {
  const { data, error } = await call
  if (error) throw error
  return data
}

/**
 * For update/delete: RLS turns a forbidden write into "0 rows, no error". Ask for
 * the touched ids and treat an empty answer as a failure so the user is told.
 */
async function mustAffect(call: PromiseLike<Result<{ id: string }[] | null>>, what = 'That change'): Promise<void> {
  const rows = await ok(call)
  if (!rows || rows.length === 0) throw new Error(`${what} was not saved. You may not have permission, or it no longer exists.`)
}

// ─── Reads ────────────────────────────────────────────────────────────────────

export async function fetchTournamentCore(id: string): Promise<TournamentCore> {
  const [tournament, rules, prizes] = await Promise.all([
    ok(supabase.from('tournaments').select(TOURNAMENT_COLUMNS).eq('id', id).maybeSingle()),
    ok(supabase.from('tournament_rules').select(RULES_COLUMNS).eq('tournament_id', id).maybeSingle()),
    ok(supabase.from('tournament_prizes').select(PRIZE_COLUMNS).eq('tournament_id', id).order('display_order')),
  ])
  return {
    tournament: tournament as unknown as Tournament | null,
    rules: rules as unknown as TournamentRules | null,
    prizes: (prizes ?? []) as unknown as TournamentPrize[],
  }
}

export async function fetchTeams(id: string): Promise<TournamentTeamWithRoster[]> {
  const data = await ok(
    supabase.from('tournament_teams').select(TEAMS_WITH_ROSTER_SELECT).eq('tournament_id', id).order('created_at'),
  )
  return ((data ?? []) as any[]).map(team => ({
    ...team,
    members: team.tournament_team_members ?? [],
  })) as TournamentTeamWithRoster[]
}

export async function fetchComments(id: string): Promise<TournamentCommentWithAuthor[]> {
  const data = await ok(
    supabase.from('tournament_comments').select(COMMENT_SELECT).eq('tournament_id', id).order('created_at', { ascending: true }),
  )
  return (data ?? []) as unknown as TournamentCommentWithAuthor[]
}

export async function fetchMatches(id: string): Promise<TournamentMatchRow[]> {
  const data = await ok(
    supabase.from('tournament_matches').select(MATCH_COLUMNS).eq('tournament_id', id).order('round').order('match_number'),
  )
  return (data ?? []) as unknown as TournamentMatchRow[]
}

/**
 * The viewer's own slice: name (for the Venmo note), their team, pending invitations to
 * them and the join requests they may act on. All four are independent, so one round trip.
 * Join requests rely on RLS: a captain sees their team's, the organizer sees every one.
 */
export async function fetchMyRegistration(id: string, userId: string): Promise<MyRegistration> {
  const [profile, memberships, invites, requests] = await Promise.all([
    ok(supabase.from('profiles').select('id, username, first_name, last_name').eq('id', userId).maybeSingle()),
    ok(
      supabase.from('tournament_team_members').select(MY_MEMBERSHIP_SELECT)
        .eq('user_id', userId).eq('tournament_teams.tournament_id', id),
    ),
    ok(
      supabase.from('tournament_team_invitations').select(INVITE_SELECT)
        .eq('invitee_id', userId).eq('tournament_id', id).eq('status', 'pending'),
    ),
    ok(
      supabase.from('tournament_team_join_requests').select(JOIN_REQUEST_SELECT)
        .eq('tournament_id', id).eq('status', 'pending').neq('requester_id', userId),
    ),
  ])

  // Normally one row; if a user ended up on two teams, a real team beats a free-agent entry.
  const teams = ((memberships ?? []) as any[]).map(m => m.tournament_teams as TournamentTeam).filter(Boolean)
  const team = teams.find(t => t.status !== 'free_agent') ?? teams[0] ?? null

  return {
    profile: (profile ?? null) as TournamentViewer | null,
    team,
    invites: ((invites ?? []) as any[]).map(inv => ({
      id: inv.id, tournament_id: inv.tournament_id, team_id: inv.team_id, inviter_id: inv.inviter_id,
      invitee_id: inv.invitee_id, status: inv.status, created_at: inv.created_at,
      team_name: inv.tournament_teams?.name ?? 'Unknown Team',
    })) as PendingInvite[],
    joinRequests: ((requests ?? []) as any[]).map(r => ({
      id: r.id, tournament_id: r.tournament_id, team_id: r.team_id, requester_id: r.requester_id,
      status: r.status, created_at: r.created_at, requester: r.profiles ?? null,
    })) as TournamentJoinRequestWithRequester[],
  }
}

export async function searchProfiles(filter: string, excludeUserId: string | null) {
  return ok(
    supabase.from('profiles').select('id, username, first_name, last_name, avatar_url')
      .or(filter).neq('id', excludeUserId ?? '').limit(20),
  )
}

// ─── Registration & teams ─────────────────────────────────────────────────────

export async function registerTeam(args: { tournamentId: string; userId: string; name: string; freeAgent: boolean }): Promise<void> {
  const { tournamentId, userId, name, freeAgent } = args
  const team = await ok(
    supabase.from('tournament_teams')
      .insert({ tournament_id: tournamentId, name, captain_user_id: userId, status: freeAgent ? 'free_agent' : 'registered' })
      .select('id').single(),
  )
  if (!team) throw new Error('Registration failed. Please try again.')
  const { error } = await supabase.from('tournament_team_members')
    .insert({ team_id: team.id, user_id: userId, is_captain: !freeAgent })
  if (error) {
    // Don't leave a captain-less empty team behind (best effort; the original error is what matters).
    await supabase.from('tournament_teams').delete().eq('id', team.id)
    throw error
  }
}

export async function withdrawTeam(teamId: string): Promise<void> {
  await mustAffect(supabase.from('tournament_teams').delete().eq('id', teamId).select('id'), 'Withdrawal')
}

/** One transaction: leave my free-agent entry, join the inviting team, mark accepted. */
export async function acceptInvite(inviteId: string): Promise<void> {
  await ok(supabase.rpc('accept_tournament_invite', { p_invite_id: inviteId }))
}

export async function declineInvite(inviteId: string): Promise<void> {
  await mustAffect(supabase.from('tournament_team_invitations').update({ status: 'declined' }).eq('id', inviteId).select('id'))
}

export async function sendInvite(args: { tournamentId: string; teamId: string; inviterId: string; inviteeId: string }): Promise<void> {
  await ok(supabase.from('tournament_team_invitations').insert({
    tournament_id: args.tournamentId, team_id: args.teamId, inviter_id: args.inviterId, invitee_id: args.inviteeId,
  }))
}

export async function sendJoinRequest(args: { tournamentId: string; teamId: string; userId: string }): Promise<void> {
  await ok(supabase.from('tournament_team_join_requests').insert({
    tournament_id: args.tournamentId, team_id: args.teamId, requester_id: args.userId,
  }))
}

/**
 * Add the requester to the team first, then close the request, then dissolve their
 * free-agent entry. Each step is checked and the first two are retry-safe (idempotent
 * upsert + update), so a mid-way failure never leaves the player on no team.
 * The last delete is best effort: RLS only lets the free agent or the organizer remove it.
 */
export async function approveJoinRequest(args: { tournamentId: string; requestId: string; requesterId: string; teamId: string }): Promise<void> {
  const { tournamentId, requestId, requesterId, teamId } = args
  const existing = await ok(
    supabase.from('tournament_team_members').select('team_id, tournament_teams!inner(status)')
      .eq('user_id', requesterId).eq('tournament_teams.tournament_id', tournamentId),
  )
  const freeAgentTeamIds = ((existing ?? []) as any[])
    .filter(r => r.tournament_teams?.status === 'free_agent' && r.team_id !== teamId)
    .map(r => r.team_id as string)

  await ok(supabase.from('tournament_team_members')
    .upsert({ team_id: teamId, user_id: requesterId, is_captain: false }, { onConflict: 'team_id,user_id', ignoreDuplicates: true }))
  await mustAffect(supabase.from('tournament_team_join_requests').update({ status: 'approved' }).eq('id', requestId).select('id'))
  if (freeAgentTeamIds.length > 0) {
    await ok(supabase.from('tournament_teams').delete().in('id', freeAgentTeamIds))
  }
}

export async function declineJoinRequest(requestId: string): Promise<void> {
  await mustAffect(supabase.from('tournament_team_join_requests').update({ status: 'declined' }).eq('id', requestId).select('id'))
}

export async function setTeamFlag(teamId: string, patch: { is_approved: true } | { is_paid: true }): Promise<void> {
  await mustAffect(supabase.from('tournament_teams').update(patch).eq('id', teamId).select('id'), 'The team update')
}

export async function removeTeam(teamId: string): Promise<void> {
  await mustAffect(supabase.from('tournament_teams').delete().eq('id', teamId).select('id'), 'Removing the team')
}

export async function movePlayer(args: { fromTeamId: string; userId: string; toTeamId: string }): Promise<void> {
  await mustAffect(
    supabase.from('tournament_team_members').update({ team_id: args.toTeamId })
      .eq('team_id', args.fromTeamId).eq('user_id', args.userId).select('id'),
    'Moving the player',
  )
}

export async function assignFreeAgent(args: { freeAgentTeamId: string; userId: string; targetTeamId: string }): Promise<void> {
  await movePlayer({ fromTeamId: args.freeAgentTeamId, userId: args.userId, toTeamId: args.targetTeamId })
  await ok(supabase.from('tournament_teams').delete().eq('id', args.freeAgentTeamId))
}

// ─── Tournament, schedule, prizes ─────────────────────────────────────────────

export async function publishTournament(id: string): Promise<void> {
  await mustAffect(
    supabase.from('tournaments').update({ status: 'published', published_at: new Date().toISOString() }).eq('id', id).select('id'),
    'Publishing',
  )
}

export async function publishSchedule(id: string): Promise<void> {
  await mustAffect(supabase.from('tournaments').update({ schedule_published: true }).eq('id', id).select('id'), 'Publishing the schedule')
}

/** One transaction: delete old matches/pools, create the new ones, stamp schedule_generated_at. */
export async function replaceSchedule(tournamentId: string, schedule: GeneratedSchedule): Promise<number> {
  const count = await ok(supabase.rpc('replace_tournament_schedule', {
    p_tournament_id: tournamentId,
    p_matches: schedule.matches,
    p_pools: schedule.pools,
  }))
  return typeof count === 'number' ? count : schedule.matches.length
}

export async function saveMatch(args: { matchId: string; scheduledAt: string; court: string; teamAId: string | null; teamBId: string | null }): Promise<void> {
  await mustAffect(
    supabase.from('tournament_matches')
      .update({ scheduled_at: args.scheduledAt, court: args.court, team_a_id: args.teamAId, team_b_id: args.teamBId })
      .eq('id', args.matchId).select('id'),
    'The match',
  )
}

export async function addPrize(args: { tournamentId: string; placeLabel: string; description: string; amount: string; displayOrder: number }): Promise<void> {
  await ok(supabase.from('tournament_prizes').insert({
    tournament_id: args.tournamentId,
    place_label: args.placeLabel,
    description: args.description,
    amount: args.amount || null,
    display_order: args.displayOrder,
  }))
}

export async function deletePrize(prizeId: string): Promise<void> {
  await mustAffect(supabase.from('tournament_prizes').delete().eq('id', prizeId).select('id'), 'Removing the prize')
}

// ─── Discussion ───────────────────────────────────────────────────────────────

export async function insertComment(args: {
  tournamentId: string; userId: string; body: string
  isAnnouncement: boolean; mentions: string[]; parentId: string | null
}): Promise<void> {
  const row: Partial<TournamentComment> & { tournament_id: string; user_id: string; body: string } = {
    tournament_id: args.tournamentId,
    user_id: args.userId,
    body: args.body,
    is_announcement: args.isAnnouncement,
    mentions: args.mentions,
    parent_id: args.parentId,
  }
  await ok(supabase.from('tournament_comments').insert(row))
}

export async function editComment(commentId: string, body: string): Promise<void> {
  await mustAffect(
    supabase.from('tournament_comments').update({ body, edited_at: new Date().toISOString() }).eq('id', commentId).select('id'),
    'Your edit',
  )
}

export async function deleteComment(commentId: string): Promise<void> {
  await mustAffect(
    supabase.from('tournament_comments').update({ deleted_at: new Date().toISOString() }).eq('id', commentId).select('id'),
    'Deleting the comment',
  )
}
