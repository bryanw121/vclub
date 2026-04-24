import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View, Text, ScrollView, ActivityIndicator, TouchableOpacity,
  TextInput, Modal, Alert, KeyboardAvoidingView, Platform,
  FlatList,
} from 'react-native'
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../../lib/supabase'
import { theme, shared } from '../../../constants'
import { profileDisplayName, resolveProfileAvatarUriSmall } from '../../../utils'
import { DiscussionComposer } from '../../../components/DiscussionComposer'
import { ProfileAvatar } from '../../../components/ProfileAvatar'
import type {
  Tournament, TournamentRules, TournamentTeam, TournamentTeamWithRoster,
  TournamentPrize, TournamentComment, TournamentCommentWithAuthor,
  TournamentTeamInvitation, TournamentTeamJoinRequest, MentionUser, Profile,
} from '../../../types'

// ─── Constants ────────────────────────────────────────────────────────────────

const SKILL_LABELS: Record<string, string> = {
  d: 'D', c: 'C', b: 'B', bb: 'BB', a: 'A', aa_plus: 'AA+', open: 'Open',
}

const FORMAT_LABELS: Record<string, string> = {
  pool_bracket: 'Pool Play + Bracket',
  bracket:      'Bracket Only',
  pool_play:    'Pool Play Only',
  round_robin:  'Full Round Robin',
}

const TABS = ['Overview', 'Teams', 'Schedule', 'Discussion'] as const
type TabName = typeof TABS[number]

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short', month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function timeAgoOrCountdown(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return 'Started'
  const d = Math.floor(diff / 86400000)
  const h = Math.floor((diff % 86400000) / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatCommentTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
}

// ─── Comment body renderer ────────────────────────────────────────────────────

function CommentBody({ body, usernameToId }: { body: string; usernameToId: Map<string, string> }) {
  const router = useRouter()
  const SEGMENT_RE = /(https?:\/\/[^\s]+|@\w+)/g
  const parts = body.split(SEGMENT_RE)
  return (
    <Text style={{ fontSize: 14, color: theme.colors.text, lineHeight: 20 }}>
      {parts.map((part, i) => {
        if (/^@\w+$/.test(part)) {
          const uid = usernameToId.get(part.slice(1))
          if (uid) return (
            <Text key={i} style={{ color: theme.colors.primary, fontWeight: '600' }}
              onPress={() => router.push(`/profile/${uid}` as any)}>{part}</Text>
          )
        }
        return part
      })}
    </Text>
  )
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function TournamentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  // ── Core data ────────────────────────────────────────────────────────────────
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [rules, setRules] = useState<TournamentRules | null>(null)
  const [prizes, setPrizes] = useState<TournamentPrize[]>([])
  const [loading, setLoading] = useState(true)
  const [myId, setMyId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabName>('Overview')

  // ── Teams ─────────────────────────────────────────────────────────────────────
  const [teams, setTeams] = useState<TournamentTeamWithRoster[]>([])
  const [myTeam, setMyTeam] = useState<TournamentTeam | null>(null)
  const [myPendingInvites, setMyPendingInvites] = useState<(TournamentTeamInvitation & { team_name: string })[]>([])
  const [joinRequests, setJoinRequests] = useState<(TournamentTeamJoinRequest & { requester: Pick<Profile, 'id' | 'username' | 'first_name' | 'last_name' | 'skill_level' | 'position'> | null })[]>([])

  // ── Registration modals ───────────────────────────────────────────────────────
  const [showRegModal, setShowRegModal] = useState(false)
  const [regAsFreAgent, setRegAsFreAgent] = useState(false)
  const [teamName, setTeamName] = useState('')
  const [registering, setRegistering] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)

  // ── Invite modal ──────────────────────────────────────────────────────────────
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteQuery, setInviteQuery] = useState('')
  const [inviteResults, setInviteResults] = useState<Profile[]>([])
  const [inviting, setInviting] = useState<string | null>(null)

  // ── Join request modal ────────────────────────────────────────────────────────
  const [requestingTeam, setRequestingTeam] = useState<TournamentTeamWithRoster | null>(null)
  const [sendingRequest, setSendingRequest] = useState(false)

  // ── Organizer: assign free agent ──────────────────────────────────────────────
  const [assigningFreeAgent, setAssigningFreeAgent] = useState<TournamentTeamWithRoster | null>(null) // the free-agent team
  const [assignTargetTeam, setAssignTargetTeam] = useState<TournamentTeamWithRoster | null>(null)

  // ── Prizes management ─────────────────────────────────────────────────────────
  const [showPrizeModal, setShowPrizeModal] = useState(false)
  const [prizeForm, setPrizeForm] = useState({ place_label: '', description: '', amount: '' })
  const [savingPrize, setSavingPrize] = useState(false)

  // ── Announcements ────────────────────────────────────────────────────────────
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false)
  const [announcementText, setAnnouncementText] = useState('')
  const [postingAnnouncement, setPostingAnnouncement] = useState(false)

  // ── Discussion ────────────────────────────────────────────────────────────────
  const [comments, setComments] = useState<TournamentCommentWithAuthor[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [replyTo, setReplyTo] = useState<TournamentCommentWithAuthor | null>(null)
  const [editingComment, setEditingComment] = useState<TournamentCommentWithAuthor | null>(null)
  const [mentionableUsers, setMentionableUsers] = useState<MentionUser[]>([])
  const discussionScrollRef = useRef<ScrollView>(null)

  // ── Organizer: move player between teams ─────────────────────────────────────
  const [movingPlayer, setMovingPlayer] = useState<{ userId: string; fromTeamId: string; playerName: string } | null>(null)

  // ── Schedule ──────────────────────────────────────────────────────────────────
  const [matches, setMatches] = useState<any[]>([])
  const [generatingSchedule, setGeneratingSchedule] = useState(false)
  const [scheduleConfig, setScheduleConfig] = useState({ numCourts: 1, matchDuration: 45, breakDuration: 10 })
  const [editingMatch, setEditingMatch] = useState<any | null>(null)
  const [editingScheduleConfig, setEditingScheduleConfig] = useState(false)

  const isCreator = !!(myId && tournament?.created_by === myId)

  const registrationOpen = tournament ? (
    tournament.status === 'published' && (
      !tournament.registration_deadline || new Date(tournament.registration_deadline) > new Date()
    )
  ) : false

  // ─── Load ──────────────────────────────────────────────────────────────────────
  useEffect(() => { void initialLoad() }, [id])

  async function initialLoad() {
    const { data: { user } } = await supabase.auth.getUser()
    const uid = user?.id ?? null
    setMyId(uid)

    const [{ data: t }, { data: r }, { data: p }] = await Promise.all([
      supabase.from('tournaments').select('*').eq('id', id).single(),
      supabase.from('tournament_rules').select('*').eq('tournament_id', id).single(),
      supabase.from('tournament_prizes').select('*').eq('tournament_id', id).order('display_order'),
    ])

    setTournament(t as Tournament | null)
    setRules(r as TournamentRules | null)
    setPrizes((p ?? []) as TournamentPrize[])

    if (t) {
      setScheduleConfig({
        numCourts: (t as any).num_courts ?? 1,
        matchDuration: (t as any).match_duration_minutes ?? 45,
        breakDuration: (t as any).break_duration_minutes ?? 10,
      })
    }

    await Promise.all([
      loadTeams(),
      uid ? loadMyRegistration(uid) : Promise.resolve(),
      loadComments(),
      loadMatches(),
    ])
    setLoading(false)
  }

  async function loadTeams() {
    const { data } = await supabase
      .from('tournament_teams')
      .select(`
        id, tournament_id, name, captain_user_id, status, is_locked, seed, is_approved, is_paid, created_at,
        tournament_team_members (
          id, team_id, user_id, is_captain, joined_at,
          profiles!tournament_team_members_user_id_fkey (id, username, first_name, last_name, avatar_url, skill_level, position)
        )
      `)
      .eq('tournament_id', id)
      .order('created_at')

    setTeams((data ?? []).map((team: any) => ({
      ...team,
      members: team.tournament_team_members ?? [],
    })) as unknown as TournamentTeamWithRoster[])

    // Build mentionable users from all team members
    const users: MentionUser[] = []
    const seen = new Set<string>()
    for (const team of data ?? []) {
      for (const m of (team as any).tournament_team_members ?? []) {
        const p = m.profiles
        if (p && !seen.has(p.id)) {
          seen.add(p.id)
          users.push({ id: p.id, username: p.username, displayName: [p.first_name, p.last_name].filter(Boolean).join(' ') || p.username })
        }
      }
    }
    setMentionableUsers(users)
  }

  async function loadMyRegistration(uid: string) {
    // My team
    const { data: memberRow } = await supabase
      .from('tournament_team_members')
      .select('team_id, tournament_teams!inner(id, name, status, captain_user_id, is_locked, seed, tournament_id, created_at, is_approved, is_paid)')
      .eq('user_id', uid)
      .eq('tournament_teams.tournament_id', id)
      .maybeSingle()

    setMyTeam(memberRow?.tournament_teams ? memberRow.tournament_teams as unknown as TournamentTeam : null)

    // My pending invites
    const { data: invites } = await supabase
      .from('tournament_team_invitations')
      .select('id, tournament_id, team_id, inviter_id, invitee_id, status, created_at, tournament_teams!inner(name)')
      .eq('invitee_id', uid)
      .eq('tournament_id', id)
      .eq('status', 'pending')

    setMyPendingInvites((invites ?? []).map((inv: any) => ({
      ...inv,
      team_name: inv.tournament_teams?.name ?? 'Unknown Team',
    })))

    // Join requests for my team (if I'm captain)
    if (memberRow?.tournament_teams) {
      const team = memberRow.tournament_teams as any
      if (team.captain_user_id === uid) {
        const { data: requests } = await supabase
          .from('tournament_team_join_requests')
          .select('id, tournament_id, team_id, requester_id, status, created_at, profiles!tournament_team_join_requests_requester_id_fkey(id, username, first_name, last_name, skill_level, position)')
          .eq('team_id', team.id)
          .eq('status', 'pending')

        setJoinRequests((requests ?? []).map((r: any) => ({ ...r, requester: r.profiles ?? null })))
      }
    }
  }

  async function loadComments() {
    setCommentsLoading(true)
    const { data } = await supabase
      .from('tournament_comments')
      .select('id, tournament_id, user_id, body, parent_id, mentions, is_announcement, edited_at, deleted_at, created_at, profiles!tournament_comments_user_id_fkey(id, username, first_name, last_name, avatar_url, selected_border)')
      .eq('tournament_id', id)
      .order('created_at', { ascending: true })
    setComments((data ?? []) as unknown as TournamentCommentWithAuthor[])
    setCommentsLoading(false)
  }

  async function loadMatches() {
    const { data } = await supabase
      .from('tournament_matches')
      .select(`
        id, tournament_id, pool_id, stage, round, match_number, team_a_id, team_b_id,
        court, scheduled_at, status, winner_id, bracket_round_name, is_losers_bracket
      `)
      .eq('tournament_id', id)
      .order('round')
      .order('match_number')
    setMatches(data ?? [])
  }

  useFocusEffect(useCallback(() => {
    void loadTeams()
    if (myId) void loadMyRegistration(myId)
  }, [id, myId]))

  // ─── Registration ──────────────────────────────────────────────────────────────

  async function handleRegister() {
    if (!myId) return
    if (!regAsFreAgent && !teamName.trim()) return
    setRegistering(true)
    try {
      const name = regAsFreAgent ? `Free Agent - ${myId.slice(0, 6)}` : teamName.trim()
      const status = regAsFreAgent ? 'free_agent' : 'registered'
      const { data: team, error: teamErr } = await supabase
        .from('tournament_teams')
        .insert({ tournament_id: id, name, captain_user_id: myId, status })
        .select().single()
      if (teamErr) { Alert.alert('Registration failed', teamErr.message); return }
      const { error: memErr } = await supabase
        .from('tournament_team_members')
        .insert({ team_id: team.id, user_id: myId, is_captain: !regAsFreAgent })
      if (memErr) {
        await supabase.from('tournament_teams').delete().eq('id', team.id)
        Alert.alert('Registration failed', memErr.message); return
      }
      setMyTeam(team as TournamentTeam)
      setShowRegModal(false)
      setTeamName('')
      await loadTeams()
    } finally { setRegistering(false) }
  }

  async function handleWithdraw() {
    if (!myTeam) return
    Alert.alert('Withdraw?', `Remove "${myTeam.name}" from the tournament?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Withdraw', style: 'destructive', onPress: async () => {
        setWithdrawing(true)
        const { error } = await supabase.from('tournament_teams').delete().eq('id', myTeam.id)
        setWithdrawing(false)
        if (error) { Alert.alert('Error', error.message); return }
        setMyTeam(null)
        await loadTeams()
      }},
    ])
  }

  async function handleAcceptInvite(inviteId: string, teamId: string) {
    if (!myId) return
    // Accept invite → join team → remove from free agent if applicable
    await supabase.from('tournament_team_invitations').update({ status: 'accepted' }).eq('id', inviteId)
    // If already on a free agent team, remove self from it
    if (myTeam?.status === 'free_agent') {
      await supabase.from('tournament_teams').delete().eq('id', myTeam.id)
    }
    await supabase.from('tournament_team_members').insert({ team_id: teamId, user_id: myId, is_captain: false })
    await loadMyRegistration(myId)
    await loadTeams()
    setMyPendingInvites(prev => prev.filter(i => i.id !== inviteId))
  }

  async function handleDeclineInvite(inviteId: string) {
    await supabase.from('tournament_team_invitations').update({ status: 'declined' }).eq('id', inviteId)
    setMyPendingInvites(prev => prev.filter(i => i.id !== inviteId))
  }

  async function handleSendJoinRequest(team: TournamentTeamWithRoster) {
    if (!myId) return
    setSendingRequest(true)
    const { error } = await supabase.from('tournament_team_join_requests').insert({
      tournament_id: id, team_id: team.id, requester_id: myId,
    })
    setSendingRequest(false)
    if (error) { Alert.alert('Error', error.message); return }
    setRequestingTeam(null)
    Alert.alert('Request sent', 'The team captain will be notified.')
  }

  async function handleApproveJoinRequest(requestId: string, requesterId: string, teamId: string) {
    // If requester is a free agent on another team, remove them first
    const { data: memberRow } = await supabase
      .from('tournament_team_members')
      .select('team_id, tournament_teams!inner(status)')
      .eq('user_id', requesterId)
      .eq('tournament_teams.tournament_id', id)
      .maybeSingle()
    if ((memberRow?.tournament_teams as any)?.status === 'free_agent') {
      await supabase.from('tournament_teams').delete().eq('id', memberRow!.team_id)
    }
    await supabase.from('tournament_team_join_requests').update({ status: 'approved' }).eq('id', requestId)
    await supabase.from('tournament_team_members').insert({ team_id: teamId, user_id: requesterId, is_captain: false })
    await loadTeams()
    if (myId) await loadMyRegistration(myId)
    setJoinRequests(prev => prev.filter(r => r.id !== requestId))
  }

  async function handleDeclineJoinRequest(requestId: string) {
    await supabase.from('tournament_team_join_requests').update({ status: 'declined' }).eq('id', requestId)
    setJoinRequests(prev => prev.filter(r => r.id !== requestId))
  }

  // ─── Invite flow ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!inviteQuery.trim() || !myTeam) { setInviteResults([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, username, first_name, last_name, avatar_url')
        .or(`username.ilike.%${inviteQuery}%,first_name.ilike.%${inviteQuery}%,last_name.ilike.%${inviteQuery}%`)
        .neq('id', myId ?? '')
        .limit(20)
      setInviteResults((data ?? []) as Profile[])
    }, 300)
    return () => clearTimeout(t)
  }, [inviteQuery, myTeam, myId])

  async function handleSendInvite(inviteeId: string) {
    if (!myId || !myTeam) return
    setInviting(inviteeId)
    const { error } = await supabase.from('tournament_team_invitations').insert({
      tournament_id: id, team_id: myTeam.id, inviter_id: myId, invitee_id: inviteeId,
    })
    setInviting(null)
    if (error) { Alert.alert('Error', error.message); return }
    Alert.alert('Invited', 'They will be notified.')
  }

  // ─── Organizer: approve / pay / assign ────────────────────────────────────────

  async function handleOrgApprove(teamId: string) {
    await supabase.from('tournament_teams').update({ is_approved: true }).eq('id', teamId)
    setTeams(prev => prev.map(t => t.id === teamId ? { ...t, is_approved: true } : t))
  }

  async function handleOrgMarkPaid(teamId: string) {
    await supabase.from('tournament_teams').update({ is_paid: true }).eq('id', teamId)
    setTeams(prev => prev.map(t => t.id === teamId ? { ...t, is_paid: true } : t))
  }

  async function handleOrgReject(teamId: string, teamName: string) {
    Alert.alert('Remove team?', `Remove "${teamName}" from the tournament?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        await supabase.from('tournament_teams').delete().eq('id', teamId)
        await loadTeams()
      }},
    ])
  }

  async function handleMovePlayer(targetTeamId: string) {
    if (!movingPlayer) return
    await supabase.from('tournament_team_members')
      .update({ team_id: targetTeamId })
      .eq('team_id', movingPlayer.fromTeamId)
      .eq('user_id', movingPlayer.userId)
    setMovingPlayer(null)
    await loadTeams()
  }

  async function handleAssignFreeAgent(freeAgentTeam: TournamentTeamWithRoster, targetTeam: TournamentTeamWithRoster) {
    // Move the free agent member(s) to the target team
    const memberId = freeAgentTeam.members[0]?.user_id
    if (!memberId) return
    await supabase.from('tournament_team_members').update({ team_id: targetTeam.id }).eq('team_id', freeAgentTeam.id).eq('user_id', memberId)
    // Delete the now-empty free agent team
    await supabase.from('tournament_teams').delete().eq('id', freeAgentTeam.id)
    await loadTeams()
    setAssigningFreeAgent(null)
    setAssignTargetTeam(null)
  }

  // ─── Discussion ────────────────────────────────────────────────────────────────

  const usernameToId = useMemo(() => {
    const m = new Map<string, string>()
    for (const u of mentionableUsers) m.set(u.username, u.id)
    return m
  }, [mentionableUsers])

  async function handlePostComment(body: string, isAnnouncement: boolean, mentionIds: string[]) {
    if (!myId) return
    if (editingComment) {
      await supabase.from('tournament_comments').update({ body, edited_at: new Date().toISOString() }).eq('id', editingComment.id)
      setEditingComment(null)
      await loadComments()
      return
    }
    await supabase.from('tournament_comments').insert({
      tournament_id: id, user_id: myId, body,
      is_announcement: isAnnouncement && isCreator,
      mentions: mentionIds,
      parent_id: replyTo?.id ?? null,
    })
    setReplyTo(null)
    await loadComments()
    setTimeout(() => discussionScrollRef.current?.scrollToEnd({ animated: true }), 100)
  }

  async function handleDeleteComment(commentId: string) {
    await supabase.from('tournament_comments').update({ deleted_at: new Date().toISOString() }).eq('id', commentId)
    await loadComments()
  }

  // ─── Schedule generation ───────────────────────────────────────────────────────

  async function handleGenerateSchedule() {
    const registeredTeams = teams.filter(t => t.status === 'registered')
    if (registeredTeams.length < 2) { Alert.alert('Not enough teams', 'Need at least 2 registered teams to generate a schedule.'); return }

    setGeneratingSchedule(true)
    try {
      // Determine pools for pool play formats
      const format = tournament!.format
      const usePools = format === 'pool_play' || format === 'pool_bracket'
      const numCourts = scheduleConfig.numCourts
      const matchDuration = scheduleConfig.matchDuration
      const breakDuration = scheduleConfig.breakDuration
      const startTime = new Date(tournament!.start_date)

      let matchInserts: any[] = []

      if (!usePools) {
        // Bracket only or round robin — simple round-robin for now
        const pairs: [string, string][] = []
        for (let i = 0; i < registeredTeams.length; i++) {
          for (let j = i + 1; j < registeredTeams.length; j++) {
            pairs.push([registeredTeams[i].id, registeredTeams[j].id])
          }
        }
        // Schedule across courts with time slots
        const slotDuration = matchDuration + breakDuration
        let slotIndex = 0
        pairs.forEach((pair, pairIdx) => {
          const courtIndex = pairIdx % numCourts
          if (courtIndex === 0 && pairIdx > 0) slotIndex++
          const scheduledAt = new Date(startTime.getTime() + slotIndex * slotDuration * 60000)
          matchInserts.push({
            tournament_id: id,
            stage: format === 'round_robin' ? 'round_robin' : 'bracket',
            round: Math.floor(pairIdx / numCourts) + 1,
            match_number: pairIdx + 1,
            team_a_id: pair[0], team_b_id: pair[1],
            court: numCourts > 1 ? `Court ${courtIndex + 1}` : 'Main Court',
            scheduled_at: scheduledAt.toISOString(),
            status: 'scheduled',
          })
        })
      } else {
        // Pool play: distribute teams into pools
        const teamsPerPool = Math.ceil(registeredTeams.length / Math.max(1, Math.round(registeredTeams.length / 4)))
        const numPools = Math.ceil(registeredTeams.length / teamsPerPool)

        // Create pools
        const poolInserts = Array.from({ length: numPools }, (_, i) => ({
          tournament_id: id, name: `Pool ${String.fromCharCode(65 + i)}`, display_order: i,
        }))
        const { data: poolData } = await supabase.from('tournament_pools').insert(poolInserts).select()
        const pools = poolData ?? []

        // Shuffle teams randomly and assign to pools
        const shuffled = [...registeredTeams].sort(() => Math.random() - 0.5)
        const poolTeams: string[][] = pools.map(() => [])
        shuffled.forEach((team, idx) => poolTeams[idx % numPools].push(team.id))

        // Create pool_teams assignments
        const poolTeamInserts: any[] = []
        pools.forEach((pool: any, poolIdx: number) => {
          poolTeams[poolIdx].forEach(teamId => {
            poolTeamInserts.push({ pool_id: pool.id, team_id: teamId })
          })
        })
        await supabase.from('tournament_pool_teams').insert(poolTeamInserts)

        // Generate round-robin matches within each pool
        const slotDuration = matchDuration + breakDuration
        let globalSlotIndex = 0

        pools.forEach((pool: any, poolIdx: number) => {
          const poolTeamIds = poolTeams[poolIdx]
          const pairs: [string, string][] = []
          for (let i = 0; i < poolTeamIds.length; i++) {
            for (let j = i + 1; j < poolTeamIds.length; j++) {
              pairs.push([poolTeamIds[i], poolTeamIds[j]])
            }
          }
          pairs.forEach((pair, pairIdx) => {
            const courtIndex = (poolIdx * Math.ceil(numCourts / numPools) + pairIdx) % numCourts
            if (courtIndex === 0 && pairIdx > 0) globalSlotIndex++
            const scheduledAt = new Date(startTime.getTime() + globalSlotIndex * slotDuration * 60000)
            matchInserts.push({
              tournament_id: id,
              pool_id: pool.id,
              stage: 'pool_play',
              round: Math.floor(pairIdx / numCourts) + 1,
              match_number: pairIdx + 1,
              team_a_id: pair[0], team_b_id: pair[1],
              court: numCourts > 1 ? `Court ${courtIndex + 1}` : 'Main Court',
              scheduled_at: scheduledAt.toISOString(),
              status: 'scheduled',
            })
          })
          globalSlotIndex++
        })
      }

      // Delete existing matches and insert new ones
      await supabase.from('tournament_matches').delete().eq('tournament_id', id)
      if (matchInserts.length > 0) {
        await supabase.from('tournament_matches').insert(matchInserts)
      }

      // Mark schedule as generated
      await supabase.from('tournaments').update({ schedule_generated_at: new Date().toISOString() }).eq('id', id)
      setTournament(prev => prev ? { ...prev, schedule_generated_at: new Date().toISOString() } : prev)
      await loadMatches()
    } finally {
      setGeneratingSchedule(false)
    }
  }

  async function handlePublishSchedule() {
    await supabase.from('tournaments').update({ schedule_published: true }).eq('id', id)
    setTournament(prev => prev ? { ...prev, schedule_published: true } : prev)
  }

  async function handlePublishTournament() {
    await supabase.from('tournaments').update({ status: 'published', published_at: new Date().toISOString() }).eq('id', id)
    setTournament(prev => prev ? { ...prev, status: 'published' } : prev)
  }

  async function handleSaveMatchEdit(matchId: string, scheduledAt: string, court: string, teamAId: string | null, teamBId: string | null) {
    await supabase.from('tournament_matches').update({ scheduled_at: scheduledAt, court, team_a_id: teamAId, team_b_id: teamBId }).eq('id', matchId)
    await loadMatches()
    setEditingMatch(null)
  }

  // ─── Prizes ────────────────────────────────────────────────────────────────────

  async function handleSavePrize() {
    if (!prizeForm.place_label.trim() || !prizeForm.description.trim()) return
    setSavingPrize(true)
    const { error } = await supabase.from('tournament_prizes').insert({
      tournament_id: id,
      place_label: prizeForm.place_label.trim(),
      description: prizeForm.description.trim(),
      amount: prizeForm.amount.trim() || null,
      display_order: prizes.length,
    })
    setSavingPrize(false)
    if (error) { Alert.alert('Error', error.message); return }
    const { data } = await supabase.from('tournament_prizes').select('*').eq('tournament_id', id).order('display_order')
    setPrizes((data ?? []) as TournamentPrize[])
    setShowPrizeModal(false)
    setPrizeForm({ place_label: '', description: '', amount: '' })
  }

  async function handleDeletePrize(prizeId: string) {
    await supabase.from('tournament_prizes').delete().eq('id', prizeId)
    setPrizes(prev => prev.filter(p => p.id !== prizeId))
  }

  // ─── Announcements ────────────────────────────────────────────────────────────

  async function handlePostAnnouncement() {
    if (!myId || !announcementText.trim()) return
    setPostingAnnouncement(true)
    await supabase.from('tournament_comments').insert({
      tournament_id: id, user_id: myId, body: announcementText.trim(),
      is_announcement: true, mentions: [], parent_id: null,
    })
    setPostingAnnouncement(false)
    setAnnouncementText('')
    setShowAnnouncementModal(false)
    await loadComments()
  }

  // ─── Derived data ──────────────────────────────────────────────────────────────

  const approvedTeams = teams.filter(t => t.status === 'registered' && t.is_approved)
  const pendingTeams = teams.filter(t => t.status === 'registered' && !t.is_approved)
  const freeAgents = teams.filter(t => t.status === 'free_agent')
  const announcements = comments.filter(c => c.is_announcement && !c.deleted_at)
  const topLevelComments = comments.filter(c => !c.parent_id)

  // ─── Loading ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[shared.screen, shared.centered, { paddingTop: insets.top, backgroundColor: theme.colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    )
  }

  if (!tournament) {
    return (
      <View style={[shared.screen, shared.centered, { paddingTop: insets.top, backgroundColor: theme.colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={shared.body}>Tournament not found.</Text>
      </View>
    )
  }

  // ─── UI helpers ────────────────────────────────────────────────────────────────

  function renderSkillChips() {
    return (tournament!.skill_levels ?? []).map(s => (
      <View key={s} style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: theme.radius.full, backgroundColor: theme.colors.primary + '18' }}>
        <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: 12, color: theme.colors.primary }}>{SKILL_LABELS[s] ?? s}</Text>
      </View>
    ))
  }

  function renderTeamCard(team: TournamentTeamWithRoster, isOrganizer: boolean) {
    const isMyTeam = myTeam?.id === team.id
    const isFreeAgent = team.status === 'free_agent'
    return (
      <View key={team.id} style={[shared.card, { marginBottom: 10 }]}>
        {/* Team header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: 15, color: theme.colors.text }}>{team.name}</Text>
              {isMyTeam && <Text style={{ fontSize: 11, color: theme.colors.primary, fontWeight: '700' }}>· You</Text>}
            </View>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
              {team.is_paid && <StatusPill label="Paid" color={theme.colors.success} />}
              {team.is_approved && !team.is_paid && <StatusPill label="Approved" color={theme.colors.primary} />}
              {!team.is_approved && !isFreeAgent && <StatusPill label="Pending" color={theme.colors.warm} />}
              {isFreeAgent && <StatusPill label="Free Agent" color={theme.colors.subtext} />}
            </View>
          </View>
          <Text style={{ fontSize: 13, color: theme.colors.subtext }}>{team.members.length} player{team.members.length !== 1 ? 's' : ''}</Text>
        </View>

        {/* Roster */}
        {team.members.map(m => {
          const p = m.profiles
          const skillLabel = p?.skill_level ? SKILL_LABELS[p.skill_level] ?? p.skill_level : null
          return (
            <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}>
              <ProfileAvatar uri={null} border={null} size={28} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, color: theme.colors.text, fontWeight: m.is_captain ? '600' : '400' }}>
                  {p ? profileDisplayName(p) : 'Player'}{m.is_captain ? ' (C)' : ''}
                </Text>
                {isOrganizer && skillLabel && (
                  <Text style={{ fontSize: 11, color: theme.colors.subtext }}>{skillLabel}</Text>
                )}
              </View>
              {isOrganizer && (
                <TouchableOpacity
                  hitSlop={8}
                  onPress={() => setMovingPlayer({ userId: m.user_id, fromTeamId: team.id, playerName: p ? profileDisplayName(p) : 'Player' })}
                >
                  <Ionicons name="swap-horizontal-outline" size={15} color={theme.colors.subtext} />
                </TouchableOpacity>
              )}
            </View>
          )
        })}

        {/* Organizer actions */}
        {isOrganizer && !isFreeAgent && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {!team.is_approved && (
              <OrgBtn label="Approve" color={theme.colors.primary} onPress={() => handleOrgApprove(team.id)} />
            )}
            {!team.is_paid && (
              <OrgBtn label="Mark Paid" color={theme.colors.success} onPress={() => handleOrgMarkPaid(team.id)} />
            )}
            <OrgBtn label="Remove" color={theme.colors.error} onPress={() => handleOrgReject(team.id, team.name)} />
          </View>
        )}

        {/* Organizer: assign free agent */}
        {isOrganizer && isFreeAgent && (
          <TouchableOpacity
            onPress={() => setAssigningFreeAgent(team)}
            style={{ marginTop: 8, paddingVertical: 8, borderRadius: 8, backgroundColor: theme.colors.primary + '18', alignItems: 'center' }}
          >
            <Text style={{ fontSize: 13, color: theme.colors.primary, fontWeight: '600' }}>Assign to Team</Text>
          </TouchableOpacity>
        )}

        {/* Player: request to join (if not my team and not a free agent team and registration open) */}
        {!isOrganizer && !isMyTeam && !isFreeAgent && registrationOpen && myTeam?.status !== 'free_agent' && !myTeam && (
          <TouchableOpacity
            onPress={() => setRequestingTeam(team)}
            style={{ marginTop: 8, paddingVertical: 8, borderRadius: 8, backgroundColor: theme.colors.border, alignItems: 'center' }}
          >
            <Text style={{ fontSize: 13, color: theme.colors.text }}>Request to Join</Text>
          </TouchableOpacity>
        )}

        {/* Join requests (if I'm captain) */}
        {isMyTeam && joinRequests.length > 0 && (
          <View style={{ marginTop: 12 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: theme.colors.subtext, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
              Join Requests
            </Text>
            {joinRequests.map(req => (
              <View key={req.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, color: theme.colors.text }}>
                    {req.requester ? profileDisplayName(req.requester) : 'Unknown'}
                  </Text>
                  {req.requester?.skill_level && (
                    <Text style={{ fontSize: 11, color: theme.colors.subtext }}>{SKILL_LABELS[req.requester.skill_level] ?? req.requester.skill_level}</Text>
                  )}
                </View>
                <TouchableOpacity onPress={() => handleApproveJoinRequest(req.id, req.requester_id, team.id)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: theme.colors.success }}>
                  <Text style={{ fontSize: 12, color: '#fff', fontWeight: '600' }}>Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDeclineJoinRequest(req.id)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: theme.colors.border }}>
                  <Text style={{ fontSize: 12, color: theme.colors.text }}>Decline</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </View>
    )
  }

  function renderCommentRow(comment: TournamentCommentWithAuthor, indent: number = 0, replies: TournamentCommentWithAuthor[] = []) {
    const p = comment.profiles
    const name = p ? profileDisplayName(p) : 'Member'
    const isOwn = myId === comment.user_id
    const isDeleted = !!comment.deleted_at

    return (
      <View key={comment.id} style={{ marginLeft: indent > 0 ? 36 : 0 }}>
        {indent > 0 && <View style={{ position: 'absolute', left: -2, top: 0, bottom: 0, width: 2, backgroundColor: theme.colors.border, borderRadius: 1 }} />}
        {isDeleted ? (
          <Text style={{ fontSize: 13, color: theme.colors.subtext, fontStyle: 'italic', paddingVertical: 4, paddingLeft: 40 }}>Message deleted</Text>
        ) : (
          <View style={[comment.is_announcement ? { backgroundColor: theme.colors.primary + '0D', borderRadius: 10, padding: 8, marginBottom: 4 } : { paddingVertical: 4 }]}>
            {comment.is_announcement && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Ionicons name="megaphone-outline" size={12} color={theme.colors.primary} />
                <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.primary, textTransform: 'uppercase', letterSpacing: 0.6 }}>Announcement</Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
              <TouchableOpacity onPress={() => router.push(`/profile/${comment.user_id}` as any)}>
                <AutoAvatar avatarUrl={p?.avatar_url} border={(p as any)?.selected_border ?? null} size={indent > 0 ? 26 : 32} />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <TouchableOpacity onPress={() => router.push(`/profile/${comment.user_id}` as any)}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: theme.colors.text }}>{name}</Text>
                  </TouchableOpacity>
                  {(isOwn || isCreator) && (
                    <View style={{ flexDirection: 'row', gap: 4 }}>
                      {isOwn && <TouchableOpacity hitSlop={8} onPress={() => setEditingComment(comment)}><Ionicons name="pencil-outline" size={13} color={theme.colors.subtext} /></TouchableOpacity>}
                      <TouchableOpacity hitSlop={8} onPress={() => Alert.alert('Delete?', 'Remove this comment?', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: () => handleDeleteComment(comment.id) },
                      ])}><Ionicons name="trash-outline" size={13} color={theme.colors.subtext} /></TouchableOpacity>
                    </View>
                  )}
                </View>
                <CommentBody body={comment.body} usernameToId={usernameToId} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 }}>
                  <Text style={{ fontSize: 11, color: theme.colors.subtext }}>
                    {formatCommentTime(comment.created_at)}{comment.edited_at ? ' · edited' : ''}
                  </Text>
                  {indent === 0 && (
                    <TouchableOpacity hitSlop={8} onPress={() => setReplyTo(comment)}>
                      <Text style={{ fontSize: 12, color: theme.colors.primary, fontWeight: '600' }}>Reply</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          </View>
        )}

        {/* 1-level replies */}
        {replies.length > 0 && (
          <View style={{ marginLeft: 42, borderLeftWidth: 2, borderLeftColor: theme.colors.border, paddingLeft: 10, marginTop: 4 }}>
            {replies.map(r => renderCommentRow(r, 1))}
          </View>
        )}
      </View>
    )
  }

  // ─── Render ────────────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: insets.top }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── Header ──────────────────────────────────────────────────────────────── */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: theme.colors.border,
        backgroundColor: theme.colors.background,
      }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginHorizontal: 12 }}>
          <Text style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: 16, color: theme.colors.text }} numberOfLines={1}>
            {tournament.title}
          </Text>
        </View>
        <StatusBadge status={tournament.status} />
      </View>

      {/* ── Tab Bar ─────────────────────────────────────────────────────────────── */}
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: theme.colors.border, backgroundColor: theme.colors.background }}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={{
              flex: 1, paddingVertical: 12, alignItems: 'center',
              borderBottomWidth: 2,
              borderBottomColor: activeTab === tab ? theme.colors.primary : 'transparent',
            }}
          >
            <Text style={{
              fontSize: 13, fontWeight: activeTab === tab ? '700' : '400',
              color: activeTab === tab ? theme.colors.primary : theme.colors.subtext,
            }}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Tab Content ─────────────────────────────────────────────────────────── */}

      {/* ── OVERVIEW ─────────────────────────────────────────────────────────────── */}
      {activeTab === 'Overview' && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

          {/* Banner */}
          <View style={{ backgroundColor: theme.colors.warm + '18', borderRadius: 20, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: theme.colors.warm + '33', position: 'relative', overflow: 'hidden' }}>
            <Text style={{ position: 'absolute', right: -8, top: -16, fontSize: 100, opacity: 0.07 }}>🏆</Text>
            <Text style={{ fontFamily: theme.fonts.display, fontWeight: '700', fontSize: 26, letterSpacing: -0.8, color: theme.colors.text, marginBottom: 6 }}>{tournament.title}</Text>
            {tournament.location && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                <Ionicons name="location-outline" size={13} color={theme.colors.subtext} />
                <Text style={{ fontFamily: theme.fonts.body, fontSize: 13, color: theme.colors.subtext }}>{tournament.location}</Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 }}>
              <Ionicons name="calendar-outline" size={13} color={theme.colors.subtext} />
              <Text style={{ fontFamily: theme.fonts.body, fontSize: 13, color: theme.colors.subtext }}>{formatDate(tournament.start_date)}</Text>
            </View>
            {(tournament.skill_levels ?? []).length > 0 && (
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>{renderSkillChips()}</View>
            )}
          </View>

          {/* Countdown */}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
            <CountdownCard label="Tournament starts" iso={tournament.start_date} />
            {tournament.registration_deadline && (
              <CountdownCard label="Registration closes" iso={tournament.registration_deadline} />
            )}
          </View>

          {/* Registration progress */}
          {tournament.max_teams && (
            <View style={[shared.card, { marginBottom: 16 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: 13, color: theme.colors.text }}>Teams Registered</Text>
                <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: 13, color: theme.colors.primary }}>{teams.filter(t => t.status === 'registered').length}/{tournament.max_teams}</Text>
              </View>
              <View style={{ height: 6, backgroundColor: theme.colors.border, borderRadius: 3, overflow: 'hidden' }}>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.colors.primary, width: `${Math.min(100, (teams.filter(t => t.status === 'registered').length / tournament.max_teams) * 100)}%` }} />
              </View>
            </View>
          )}

          {/* Registration CTA */}
          {!isCreator && (
            myTeam ? (
              <View style={{ backgroundColor: theme.colors.success + '14', borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: theme.colors.success + '40', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <Ionicons name="checkmark-circle" size={22} color={theme.colors.success} />
                  <View>
                    <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: 14, color: theme.colors.text }}>{myTeam.name}</Text>
                    <Text style={{ fontSize: 12, color: theme.colors.subtext, textTransform: 'capitalize' }}>{myTeam.status === 'free_agent' ? 'Free Agent' : 'Registered'}</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={handleWithdraw} disabled={withdrawing} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.error + '66' }}>
                  {withdrawing ? <ActivityIndicator size="small" color={theme.colors.error} /> : <Text style={{ fontSize: 13, color: theme.colors.error }}>Withdraw</Text>}
                </TouchableOpacity>
              </View>
            ) : registrationOpen ? (
              <TouchableOpacity onPress={() => setShowRegModal(true)} style={{ backgroundColor: theme.colors.primary, borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 16 }}>
                <Text style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: 15, color: '#fff' }}>Register</Text>
              </TouchableOpacity>
            ) : null
          )}

          {/* Pending invitations */}
          {myPendingInvites.length > 0 && (
            <View style={[shared.card, { marginBottom: 16 }]}>
              <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: 13, color: theme.colors.subtext, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>Team Invitations</Text>
              {myPendingInvites.map(inv => (
                <View key={inv.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
                  <Text style={{ flex: 1, fontSize: 14, color: theme.colors.text }}>Invited to <Text style={{ fontWeight: '600' }}>{inv.team_name}</Text></Text>
                  <TouchableOpacity onPress={() => handleAcceptInvite(inv.id, inv.team_id)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: theme.colors.primary }}>
                    <Text style={{ fontSize: 12, color: '#fff', fontWeight: '600' }}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeclineInvite(inv.id)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: theme.colors.border }}>
                    <Text style={{ fontSize: 12, color: theme.colors.text }}>Decline</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* Prizes */}
          {(prizes.length > 0 || isCreator) && (
            <View style={[shared.card, { marginBottom: 16 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: prizes.length > 0 ? 10 : 0 }}>
                <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: 13, color: theme.colors.subtext, textTransform: 'uppercase', letterSpacing: 0.6 }}>Prizes</Text>
                {isCreator && <TouchableOpacity hitSlop={8} onPress={() => setShowPrizeModal(true)}><Ionicons name="add-circle-outline" size={20} color={theme.colors.primary} /></TouchableOpacity>}
              </View>
              {prizes.map((prize, idx) => {
                const medals = ['🥇', '🥈', '🥉']
                return (
                  <View key={prize.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: theme.colors.border }}>
                    <Text style={{ fontSize: 22 }}>{medals[idx] ?? '🏅'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: 14, color: theme.colors.text }}>{prize.place_label}</Text>
                      <Text style={{ fontSize: 13, color: theme.colors.subtext }}>{prize.description}{prize.amount ? ` · ${prize.amount}` : ''}</Text>
                    </View>
                    {isCreator && (
                      <TouchableOpacity hitSlop={8} onPress={() => handleDeletePrize(prize.id)}>
                        <Ionicons name="trash-outline" size={16} color={theme.colors.subtext} />
                      </TouchableOpacity>
                    )}
                  </View>
                )
              })}
              {prizes.length === 0 && <Text style={{ fontSize: 13, color: theme.colors.subtext }}>No prizes configured yet.</Text>}
            </View>
          )}

          {/* Announcements */}
          {(announcements.length > 0 || isCreator) && (
            <View style={[shared.card, { marginBottom: 16 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: 13, color: theme.colors.subtext, textTransform: 'uppercase', letterSpacing: 0.6 }}>Announcements</Text>
                {isCreator && <TouchableOpacity hitSlop={8} onPress={() => setShowAnnouncementModal(true)}><Ionicons name="add-circle-outline" size={20} color={theme.colors.primary} /></TouchableOpacity>}
              </View>
              {announcements.length === 0 ? (
                <Text style={{ fontSize: 13, color: theme.colors.subtext }}>No announcements yet.</Text>
              ) : (
                announcements.slice().reverse().map(ann => (
                  <View key={ann.id} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
                    <Text style={{ fontSize: 14, color: theme.colors.text, lineHeight: 20 }}>{ann.body}</Text>
                    <Text style={{ fontSize: 11, color: theme.colors.subtext, marginTop: 2 }}>{formatCommentTime(ann.created_at)}</Text>
                  </View>
                ))
              )}
            </View>
          )}

          {/* Details */}
          <View style={[shared.card, { marginBottom: 16, gap: 0 }]}>
            {[
              { label: 'Format',        value: FORMAT_LABELS[tournament.format] ?? tournament.format },
              { label: 'Bracket',       value: tournament.bracket_type === 'double' ? 'Double elimination' : 'Single elimination', hide: !tournament.bracket_type },
              { label: 'Max teams',     value: tournament.max_teams ? String(tournament.max_teams) : 'Unlimited' },
              { label: 'Roster',        value: `${tournament.min_roster_size}–${tournament.max_roster_size} players` },
              { label: 'Refs',          value: tournament.has_refs ? 'Yes' : 'No' },
              { label: 'Entry fee',     value: tournament.price > 0 ? `$${tournament.price.toFixed(2)}` : 'Free' },
              { label: 'Reg. deadline', value: tournament.registration_deadline ? formatDate(tournament.registration_deadline) : 'None', hide: !tournament.registration_deadline },
            ].filter(r => !r.hide).map((row, i, arr) => (
              <View key={row.label} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: theme.colors.border }}>
                <Text style={{ fontFamily: theme.fonts.body, fontSize: 14, color: theme.colors.subtext }}>{row.label}</Text>
                <Text style={{ fontFamily: theme.fonts.bodyMedium, fontSize: 14, color: theme.colors.text }}>{row.value}</Text>
              </View>
            ))}
          </View>

          {tournament.description && (
            <View style={[shared.card, { marginBottom: 16 }]}>
              <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: 13, color: theme.colors.subtext, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6 }}>About</Text>
              <Text style={{ fontFamily: theme.fonts.body, fontSize: 14, color: theme.colors.text, lineHeight: 20 }}>{tournament.description}</Text>
            </View>
          )}

          {rules && (
            <View style={[shared.card, { marginBottom: 16, gap: 0 }]}>
              <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: 13, color: theme.colors.subtext, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: 4 }}>Scoring Rules</Text>
              {[
                { label: 'Win to', value: `${rules.winning_score} pts` },
                { label: 'Deciding set', value: `${rules.deciding_set_score} pts` },
                { label: 'Win by', value: `${rules.win_by_margin}` },
                { label: 'Point cap', value: rules.point_cap ? String(rules.point_cap) : 'None' },
                { label: 'Sets to win', value: String(rules.sets_to_win) },
              ].map((row, i, arr) => (
                <View key={row.label} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: theme.colors.border }}>
                  <Text style={{ fontFamily: theme.fonts.body, fontSize: 14, color: theme.colors.subtext }}>{row.label}</Text>
                  <Text style={{ fontFamily: theme.fonts.bodyMedium, fontSize: 14, color: theme.colors.text }}>{row.value}</Text>
                </View>
              ))}
            </View>
          )}

          {isCreator && tournament.status === 'draft' && (
            <TouchableOpacity onPress={handlePublishTournament} style={{ backgroundColor: theme.colors.primary, borderRadius: 14, padding: 16, alignItems: 'center' }}>
              <Text style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: 15, color: '#fff' }}>Publish Tournament</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      {/* ── TEAMS ─────────────────────────────────────────────────────────────────── */}
      {activeTab === 'Teams' && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

          {/* My team actions */}
          {myTeam && !isCreator && (
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
              {myTeam.captain_user_id === myId && (
                <TouchableOpacity onPress={() => setShowInviteModal(true)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: theme.colors.primary }}>
                  <Ionicons name="person-add-outline" size={16} color="#fff" />
                  <Text style={{ fontSize: 14, color: '#fff', fontWeight: '600' }}>Invite Players</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={handleWithdraw} disabled={withdrawing} style={{ flex: myTeam.captain_user_id === myId ? 0 : 1, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.error + '66', alignItems: 'center' }}>
                {withdrawing ? <ActivityIndicator size="small" color={theme.colors.error} /> : <Text style={{ fontSize: 14, color: theme.colors.error }}>Withdraw</Text>}
              </TouchableOpacity>
            </View>
          )}

          {/* Approved teams */}
          {approvedTeams.length > 0 && (
            <SectionHeader title="Registered & Approved" count={approvedTeams.length} />
          )}
          {approvedTeams.map(t => renderTeamCard(t, isCreator))}

          {/* Pending teams */}
          {pendingTeams.length > 0 && (
            <SectionHeader title="Pending Approval" count={pendingTeams.length} />
          )}
          {pendingTeams.map(t => renderTeamCard(t, isCreator))}

          {/* Free agents */}
          {freeAgents.length > 0 && (
            <SectionHeader title="Free Agents" count={freeAgents.length} />
          )}
          {freeAgents.map(t => renderTeamCard(t, isCreator))}

          {teams.length === 0 && (
            <View style={{ alignItems: 'center', paddingVertical: 48 }}>
              <Ionicons name="people-outline" size={40} color={theme.colors.border} />
              <Text style={{ fontSize: 14, color: theme.colors.subtext, marginTop: 12 }}>No teams registered yet.</Text>
            </View>
          )}

          {/* Join requests for organizer (all teams) */}
          {isCreator && joinRequests.length > 0 && (
            <View style={[shared.card, { marginTop: 8 }]}>
              <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: 13, color: theme.colors.subtext, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>All Join Requests</Text>
              {joinRequests.map(req => (
                <View key={req.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, color: theme.colors.text }}>{req.requester ? profileDisplayName(req.requester) : 'Unknown'}</Text>
                    {req.requester?.skill_level && <Text style={{ fontSize: 11, color: theme.colors.subtext }}>{SKILL_LABELS[req.requester.skill_level] ?? req.requester.skill_level}</Text>}
                    <Text style={{ fontSize: 11, color: theme.colors.subtext }}>→ {teams.find(t => t.id === req.team_id)?.name ?? 'Unknown team'}</Text>
                  </View>
                  <TouchableOpacity onPress={() => handleApproveJoinRequest(req.id, req.requester_id, req.team_id)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: theme.colors.success }}>
                    <Text style={{ fontSize: 12, color: '#fff', fontWeight: '600' }}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeclineJoinRequest(req.id)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: theme.colors.border }}>
                    <Text style={{ fontSize: 12, color: theme.colors.text }}>Decline</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* ── SCHEDULE ──────────────────────────────────────────────────────────────── */}
      {activeTab === 'Schedule' && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {!tournament.schedule_generated_at ? (
            // Not yet generated
            isCreator ? (
              <View style={[shared.card, { gap: 16 }]}>
                <Text style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: 16, color: theme.colors.text }}>Generate Schedule</Text>
                <Text style={{ fontSize: 13, color: theme.colors.subtext }}>Auto-assigns teams to pools and creates round-robin matches. You can edit individual matches after generating.</Text>

                <ScheduleField label={`Courts (${scheduleConfig.numCourts})`}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {[1, 2, 3, 4, 6].map(n => (
                      <TouchableOpacity key={n} onPress={() => setScheduleConfig(p => ({ ...p, numCourts: n }))} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: scheduleConfig.numCourts === n ? theme.colors.primary : theme.colors.border }}>
                        <Text style={{ fontSize: 13, color: scheduleConfig.numCourts === n ? '#fff' : theme.colors.text }}>{n}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScheduleField>

                <ScheduleField label={`Match duration (${scheduleConfig.matchDuration} min)`}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {[30, 45, 60, 75, 90].map(n => (
                      <TouchableOpacity key={n} onPress={() => setScheduleConfig(p => ({ ...p, matchDuration: n }))} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: scheduleConfig.matchDuration === n ? theme.colors.primary : theme.colors.border }}>
                        <Text style={{ fontSize: 13, color: scheduleConfig.matchDuration === n ? '#fff' : theme.colors.text }}>{n}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScheduleField>

                <ScheduleField label={`Break between matches (${scheduleConfig.breakDuration} min)`}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {[0, 5, 10, 15, 20].map(n => (
                      <TouchableOpacity key={n} onPress={() => setScheduleConfig(p => ({ ...p, breakDuration: n }))} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: scheduleConfig.breakDuration === n ? theme.colors.primary : theme.colors.border }}>
                        <Text style={{ fontSize: 13, color: scheduleConfig.breakDuration === n ? '#fff' : theme.colors.text }}>{n}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScheduleField>

                <TouchableOpacity
                  onPress={handleGenerateSchedule}
                  disabled={generatingSchedule || teams.filter(t => t.status === 'registered').length < 2}
                  style={{ backgroundColor: theme.colors.primary, borderRadius: 12, padding: 14, alignItems: 'center', opacity: generatingSchedule ? 0.6 : 1 }}
                >
                  {generatingSchedule
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: 15, color: '#fff' }}>Generate Schedule</Text>
                  }
                </TouchableOpacity>
                {teams.filter(t => t.status === 'registered').length < 2 && (
                  <Text style={{ fontSize: 12, color: theme.colors.subtext, textAlign: 'center' }}>Need at least 2 registered teams.</Text>
                )}
              </View>
            ) : (
              <View style={{ alignItems: 'center', paddingVertical: 60 }}>
                <Ionicons name="calendar-outline" size={40} color={theme.colors.border} />
                <Text style={{ fontSize: 14, color: theme.colors.subtext, marginTop: 12, textAlign: 'center' }}>The schedule hasn't been published yet.</Text>
              </View>
            )
          ) : (
            // Schedule generated — show matches (or config if host wants to change settings)
            <>
              {isCreator && !tournament.schedule_published && (
                editingScheduleConfig ? (
                  <View style={[shared.card, { gap: 16, marginBottom: 16 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: 16, color: theme.colors.text }}>Regenerate Schedule</Text>
                      <TouchableOpacity hitSlop={8} onPress={() => setEditingScheduleConfig(false)}>
                        <Ionicons name="close" size={20} color={theme.colors.subtext} />
                      </TouchableOpacity>
                    </View>
                    <Text style={{ fontSize: 13, color: theme.colors.subtext }}>This will replace the existing schedule.</Text>

                    <ScheduleField label={`Courts (${scheduleConfig.numCourts})`}>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {[1, 2, 3, 4, 6].map(n => (
                          <TouchableOpacity key={n} onPress={() => setScheduleConfig(p => ({ ...p, numCourts: n }))} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: scheduleConfig.numCourts === n ? theme.colors.primary : theme.colors.border }}>
                            <Text style={{ fontSize: 13, color: scheduleConfig.numCourts === n ? '#fff' : theme.colors.text }}>{n}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScheduleField>

                    <ScheduleField label={`Match duration (${scheduleConfig.matchDuration} min)`}>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {[30, 45, 60, 75, 90].map(n => (
                          <TouchableOpacity key={n} onPress={() => setScheduleConfig(p => ({ ...p, matchDuration: n }))} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: scheduleConfig.matchDuration === n ? theme.colors.primary : theme.colors.border }}>
                            <Text style={{ fontSize: 13, color: scheduleConfig.matchDuration === n ? '#fff' : theme.colors.text }}>{n}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScheduleField>

                    <ScheduleField label={`Break between matches (${scheduleConfig.breakDuration} min)`}>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {[0, 5, 10, 15, 20].map(n => (
                          <TouchableOpacity key={n} onPress={() => setScheduleConfig(p => ({ ...p, breakDuration: n }))} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: scheduleConfig.breakDuration === n ? theme.colors.primary : theme.colors.border }}>
                            <Text style={{ fontSize: 13, color: scheduleConfig.breakDuration === n ? '#fff' : theme.colors.text }}>{n}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScheduleField>

                    <TouchableOpacity
                      onPress={async () => { await handleGenerateSchedule(); setEditingScheduleConfig(false) }}
                      disabled={generatingSchedule}
                      style={{ backgroundColor: theme.colors.primary, borderRadius: 12, padding: 14, alignItems: 'center', opacity: generatingSchedule ? 0.6 : 1 }}
                    >
                      {generatingSchedule
                        ? <ActivityIndicator color="#fff" />
                        : <Text style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: 15, color: '#fff' }}>Regenerate Schedule</Text>
                      }
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                    <TouchableOpacity onPress={() => setEditingScheduleConfig(true)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border }}>
                      <Ionicons name="settings-outline" size={15} color={theme.colors.text} />
                      <Text style={{ fontSize: 14, color: theme.colors.text }}>Change Settings</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handlePublishSchedule} style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: theme.colors.primary, alignItems: 'center' }}>
                      <Text style={{ fontSize: 14, color: '#fff', fontWeight: '600' }}>Publish Schedule</Text>
                    </TouchableOpacity>
                  </View>
                )
              )}

              {!tournament.schedule_published && !isCreator && (
                <View style={{ alignItems: 'center', paddingVertical: 60 }}>
                  <Ionicons name="calendar-outline" size={40} color={theme.colors.border} />
                  <Text style={{ fontSize: 14, color: theme.colors.subtext, marginTop: 12 }}>Schedule not yet published.</Text>
                </View>
              )}

              {(tournament.schedule_published || isCreator) && matches.map(match => {
                const teamA = teams.find(t => t.id === match.team_a_id)
                const teamB = teams.find(t => t.id === match.team_b_id)
                const isEditing = editingMatch?.id === match.id

                return (
                  <View key={match.id} style={[shared.card, { marginBottom: 10 }]}>
                    {isEditing ? (
                      <MatchEditForm
                        match={match}
                        teams={teams.filter(t => t.status === 'registered')}
                        onSave={(scheduledAt, court, aId, bId) => handleSaveMatchEdit(match.id, scheduledAt, court, aId, bId)}
                        onCancel={() => setEditingMatch(null)}
                      />
                    ) : (
                      <>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: theme.colors.border }}>
                              <Text style={{ fontSize: 11, color: theme.colors.subtext, textTransform: 'capitalize' }}>{match.stage.replace('_', ' ')}</Text>
                            </View>
                            {match.bracket_round_name && (
                              <Text style={{ fontSize: 12, color: theme.colors.subtext }}>{match.bracket_round_name}</Text>
                            )}
                          </View>
                          {isCreator && (
                            <TouchableOpacity hitSlop={8} onPress={() => setEditingMatch(match)}>
                              <Ionicons name="pencil-outline" size={16} color={theme.colors.subtext} />
                            </TouchableOpacity>
                          )}
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: theme.colors.text, textAlign: 'center' }}>{teamA?.name ?? 'TBD'}</Text>
                          <Text style={{ fontSize: 13, color: theme.colors.subtext, fontWeight: '700' }}>vs</Text>
                          <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: theme.colors.text, textAlign: 'center' }}>{teamB?.name ?? 'TBD'}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 12, justifyContent: 'center' }}>
                          {match.scheduled_at && (
                            <Text style={{ fontSize: 12, color: theme.colors.subtext }}>
                              <Ionicons name="time-outline" size={12} color={theme.colors.subtext} /> {formatShortDate(match.scheduled_at)}
                            </Text>
                          )}
                          {match.court && (
                            <Text style={{ fontSize: 12, color: theme.colors.subtext }}>
                              <Ionicons name="location-outline" size={12} color={theme.colors.subtext} /> {match.court}
                            </Text>
                          )}
                        </View>
                      </>
                    )}
                  </View>
                )
              })}
            </>
          )}
        </ScrollView>
      )}

      {/* ── DISCUSSION ────────────────────────────────────────────────────────────── */}
      {activeTab === 'Discussion' && (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.top + 88}>
          {commentsLoading && comments.length === 0 ? (
            <View style={shared.centered}><ActivityIndicator color={theme.colors.primary} /></View>
          ) : (
            <ScrollView
              ref={discussionScrollRef}
              contentContainerStyle={{ padding: 16, paddingBottom: 8, gap: 4 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {topLevelComments.length === 0 && (
                <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                  <Ionicons name="chatbubbles-outline" size={40} color={theme.colors.border} />
                  <Text style={{ fontSize: 14, color: theme.colors.subtext, marginTop: 12 }}>No messages yet. Start the conversation.</Text>
                </View>
              )}
              {topLevelComments.map(c =>
                renderCommentRow(c, 0, comments.filter(r => r.parent_id === c.id))
              )}
            </ScrollView>
          )}

          {myId && (
            <View style={{
              paddingHorizontal: 16, paddingTop: 8,
              paddingBottom: insets.bottom + 8,
              borderTopWidth: 1, borderTopColor: theme.colors.border,
              backgroundColor: theme.colors.background,
            }}>
              <DiscussionComposer
                mentionableUsers={mentionableUsers}
                onPost={handlePostComment}
                showAnnouncementToggle={isCreator}
                announcementLabel="Post as announcement"
                placeholder="Add a comment…"
                replyToAuthor={replyTo ? (replyTo.profiles ? profileDisplayName(replyTo.profiles) : 'Member') : null}
                onClearReply={() => setReplyTo(null)}
                editingBody={editingComment?.body ?? null}
                onCancelEdit={() => setEditingComment(null)}
                onFocusScroll={() => discussionScrollRef.current?.scrollToEnd({ animated: true })}
              />
            </View>
          )}
        </KeyboardAvoidingView>
      )}

      {/* ── Registration Modal ────────────────────────────────────────────────────── */}
      <Modal visible={showRegModal} transparent animationType="slide" onRequestClose={() => setShowRegModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowRegModal(false)} />
          <View style={{ backgroundColor: theme.colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: insets.bottom + 24, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: theme.colors.border, alignSelf: 'center', marginBottom: 20 }} />
            <Text style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: 18, color: theme.colors.text, marginBottom: 16 }}>Register</Text>

            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
              <TouchableOpacity onPress={() => setRegAsFreAgent(false)} style={{ flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 2, borderColor: !regAsFreAgent ? theme.colors.primary : theme.colors.border, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, color: !regAsFreAgent ? theme.colors.primary : theme.colors.subtext, fontWeight: '600' }}>Register Team</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setRegAsFreAgent(true)} style={{ flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 2, borderColor: regAsFreAgent ? theme.colors.primary : theme.colors.border, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, color: regAsFreAgent ? theme.colors.primary : theme.colors.subtext, fontWeight: '600' }}>Free Agent</Text>
              </TouchableOpacity>
            </View>

            {!regAsFreAgent && (
              <>
                <Text style={{ fontFamily: theme.fonts.bodyMedium, fontSize: 13, color: theme.colors.subtext, marginBottom: 6 }}>Team name</Text>
                <TextInput
                  value={teamName}
                  onChangeText={setTeamName}
                  placeholder="e.g. Block Party"
                  placeholderTextColor={theme.colors.subtext}
                  autoFocus
                  style={{ backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.colors.text, marginBottom: 20, fontFamily: theme.fonts.body }}
                />
                <Text style={{ fontSize: 12, color: theme.colors.subtext, marginBottom: 20 }}>Roster size: {tournament.min_roster_size}–{tournament.max_roster_size} players. You'll be the captain.</Text>
              </>
            )}

            {regAsFreAgent && (
              <Text style={{ fontSize: 13, color: theme.colors.subtext, marginBottom: 20 }}>You'll be placed in the free agent pool. You can request to join a team later, or the organizer may assign you.</Text>
            )}

            <TouchableOpacity
              onPress={handleRegister}
              disabled={(!regAsFreAgent && !teamName.trim()) || registering}
              style={{ backgroundColor: (!regAsFreAgent && !teamName.trim()) ? theme.colors.border : theme.colors.primary, borderRadius: 14, padding: 16, alignItems: 'center' }}
            >
              {registering ? <ActivityIndicator color="#fff" /> : <Text style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: 15, color: '#fff' }}>Register</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Invite Modal ──────────────────────────────────────────────────────────── */}
      <Modal visible={showInviteModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setShowInviteModal(false); setInviteQuery('') }}>
        <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border, gap: 12 }}>
            <TextInput
              autoFocus
              placeholder="Search by name or username…"
              placeholderTextColor={theme.colors.subtext}
              value={inviteQuery}
              onChangeText={setInviteQuery}
              style={{ flex: 1, height: 40, backgroundColor: theme.colors.card, borderRadius: 12, paddingHorizontal: 14, fontSize: 14, color: theme.colors.text }}
            />
            <TouchableOpacity onPress={() => { setShowInviteModal(false); setInviteQuery('') }}>
              <Text style={{ color: theme.colors.primary, fontSize: 14 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={inviteResults}
            keyExtractor={p => p.id}
            renderItem={({ item }) => {
              const name = [item.first_name, item.last_name].filter(Boolean).join(' ') || item.username
              const alreadyOnTeam = teams.some(t => t.members.some(m => m.user_id === item.id))
              return (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: theme.colors.text }}>{name}</Text>
                    <Text style={{ fontSize: 12, color: theme.colors.subtext }}>@{item.username}</Text>
                    {alreadyOnTeam && <Text style={{ fontSize: 11, color: theme.colors.subtext }}>Already registered</Text>}
                  </View>
                  {!alreadyOnTeam && (
                    <TouchableOpacity onPress={() => handleSendInvite(item.id)} disabled={inviting === item.id} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: theme.colors.primary }}>
                      {inviting === item.id ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ fontSize: 13, color: '#fff', fontWeight: '600' }}>Invite</Text>}
                    </TouchableOpacity>
                  )}
                </View>
              )
            }}
            ListEmptyComponent={inviteQuery.trim() ? <Text style={{ textAlign: 'center', padding: 24, color: theme.colors.subtext }}>No users found</Text> : null}
          />
        </View>
      </Modal>

      {/* ── Join Request Modal ────────────────────────────────────────────────────── */}
      <Modal visible={!!requestingTeam} transparent animationType="slide" onRequestClose={() => setRequestingTeam(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setRequestingTeam(null)} />
          <View style={{ backgroundColor: theme.colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: insets.bottom + 24, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
            <Text style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: 18, color: theme.colors.text, marginBottom: 8 }}>Request to Join</Text>
            <Text style={{ fontSize: 14, color: theme.colors.subtext, marginBottom: 20 }}>
              Send a join request to <Text style={{ color: theme.colors.text, fontWeight: '600' }}>{requestingTeam?.name}</Text>. The captain will be notified.
            </Text>
            <TouchableOpacity onPress={() => requestingTeam && handleSendJoinRequest(requestingTeam)} disabled={sendingRequest} style={{ backgroundColor: theme.colors.primary, borderRadius: 14, padding: 16, alignItems: 'center' }}>
              {sendingRequest ? <ActivityIndicator color="#fff" /> : <Text style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: 15, color: '#fff' }}>Send Request</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Assign Free Agent Modal ───────────────────────────────────────────────── */}
      <Modal visible={!!assigningFreeAgent} transparent animationType="slide" onRequestClose={() => setAssigningFreeAgent(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setAssigningFreeAgent(null)} />
          <View style={{ backgroundColor: theme.colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: insets.bottom + 24, borderTopWidth: 1, borderTopColor: theme.colors.border, maxHeight: '70%' }}>
            <Text style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: 18, color: theme.colors.text, marginBottom: 6 }}>Assign to Team</Text>
            <Text style={{ fontSize: 13, color: theme.colors.subtext, marginBottom: 16 }}>
              Move {assigningFreeAgent?.members[0]?.profiles ? profileDisplayName(assigningFreeAgent.members[0].profiles as any) : 'free agent'} to:
            </Text>
            <ScrollView>
              {teams.filter(t => t.status === 'registered').map(t => (
                <TouchableOpacity key={t.id} onPress={() => assigningFreeAgent && handleAssignFreeAgent(assigningFreeAgent, t)}
                  style={{ paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
                  <Text style={{ fontSize: 15, color: theme.colors.text }}>{t.name}</Text>
                  <Text style={{ fontSize: 12, color: theme.colors.subtext }}>{t.members.length} players</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Prize Modal ───────────────────────────────────────────────────────────── */}
      <Modal visible={showPrizeModal} transparent animationType="slide" onRequestClose={() => setShowPrizeModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowPrizeModal(false)} />
          <View style={{ backgroundColor: theme.colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: insets.bottom + 24, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
            <Text style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: 18, color: theme.colors.text, marginBottom: 16 }}>Add Prize</Text>
            {[
              { label: 'Place label', key: 'place_label', placeholder: 'e.g. 1st Place', autoFocus: true },
              { label: 'Description', key: 'description', placeholder: 'e.g. Trophy + Medal' },
              { label: 'Amount (optional)', key: 'amount', placeholder: 'e.g. $200' },
            ].map(field => (
              <View key={field.key} style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: 13, color: theme.colors.subtext, marginBottom: 6 }}>{field.label}</Text>
                <TextInput
                  autoFocus={field.autoFocus}
                  value={(prizeForm as any)[field.key]}
                  onChangeText={v => setPrizeForm(p => ({ ...p, [field.key]: v }))}
                  placeholder={field.placeholder}
                  placeholderTextColor={theme.colors.subtext}
                  style={{ backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: theme.colors.text }}
                />
              </View>
            ))}
            <TouchableOpacity onPress={handleSavePrize} disabled={!prizeForm.place_label.trim() || !prizeForm.description.trim() || savingPrize} style={{ backgroundColor: theme.colors.primary, borderRadius: 12, padding: 14, alignItems: 'center', opacity: (!prizeForm.place_label.trim() || !prizeForm.description.trim()) ? 0.5 : 1 }}>
              {savingPrize ? <ActivityIndicator color="#fff" /> : <Text style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: 15, color: '#fff' }}>Add Prize</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Announcement Modal ────────────────────────────────────────────────────── */}
      <Modal visible={showAnnouncementModal} transparent animationType="slide" onRequestClose={() => setShowAnnouncementModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowAnnouncementModal(false)} />
          <View style={{ backgroundColor: theme.colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: insets.bottom + 24, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
            <Text style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: 18, color: theme.colors.text, marginBottom: 16 }}>Post Announcement</Text>
            <TextInput
              autoFocus
              value={announcementText}
              onChangeText={setAnnouncementText}
              placeholder="Write an announcement for all participants…"
              placeholderTextColor={theme.colors.subtext}
              multiline
              numberOfLines={4}
              style={{ backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: theme.colors.text, minHeight: 100, textAlignVertical: 'top', marginBottom: 16 }}
            />
            <TouchableOpacity onPress={handlePostAnnouncement} disabled={!announcementText.trim() || postingAnnouncement} style={{ backgroundColor: !announcementText.trim() ? theme.colors.border : theme.colors.primary, borderRadius: 12, padding: 14, alignItems: 'center' }}>
              {postingAnnouncement ? <ActivityIndicator color="#fff" /> : <Text style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: 15, color: '#fff' }}>Post</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Move Player Modal ─────────────────────────────────────────────────────── */}
      <Modal visible={!!movingPlayer} transparent animationType="slide" onRequestClose={() => setMovingPlayer(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setMovingPlayer(null)} />
          <View style={{ backgroundColor: theme.colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: insets.bottom + 24, borderTopWidth: 1, borderTopColor: theme.colors.border, maxHeight: '70%' }}>
            <Text style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: 18, color: theme.colors.text, marginBottom: 4 }}>Move Player</Text>
            <Text style={{ fontSize: 13, color: theme.colors.subtext, marginBottom: 16 }}>
              Move <Text style={{ color: theme.colors.text, fontWeight: '600' }}>{movingPlayer?.playerName}</Text> to:
            </Text>
            <ScrollView>
              {teams
                .filter(t => t.status === 'registered' && t.id !== movingPlayer?.fromTeamId)
                .map(t => (
                  <TouchableOpacity
                    key={t.id}
                    onPress={() => handleMovePlayer(t.id)}
                    style={{ paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}
                  >
                    <Text style={{ fontSize: 15, color: theme.colors.text }}>{t.name}</Text>
                    <Text style={{ fontSize: 12, color: theme.colors.subtext }}>{t.members.length} player{t.members.length !== 1 ? 's' : ''}</Text>
                  </TouchableOpacity>
                ))}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

// ─── Small helper components ──────────────────────────────────────────────────

function AutoAvatar({ avatarUrl, border, size }: { avatarUrl?: string | null; border: string | null; size: number }) {
  const [uri, setUri] = React.useState<string | null>(null)
  React.useEffect(() => {
    let cancelled = false
    resolveProfileAvatarUriSmall(avatarUrl).then(r => { if (!cancelled) setUri(r.uri) })
    return () => { cancelled = true }
  }, [avatarUrl])
  return <ProfileAvatar uri={uri} border={border} size={size} />
}

function StatusBadge({ status }: { status: string }) {
  const isPub = status === 'published'
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: isPub ? theme.colors.primary + '22' : theme.colors.border }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: isPub ? theme.colors.primary : theme.colors.subtext, textTransform: 'capitalize' }}>{status}</Text>
    </View>
  )
}

function StatusPill({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99, backgroundColor: color + '22', borderWidth: 1, borderColor: color + '44' }}>
      <Text style={{ fontSize: 11, color, fontWeight: '600' }}>{label}</Text>
    </View>
  )
}

function OrgBtn({ label, color, onPress }: { label: string; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: color + '18', borderWidth: 1, borderColor: color + '44' }}>
      <Text style={{ fontSize: 12, color, fontWeight: '600' }}>{label}</Text>
    </TouchableOpacity>
  )
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, marginTop: 4 }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: theme.colors.subtext, textTransform: 'uppercase', letterSpacing: 0.6 }}>{title}</Text>
      <Text style={{ fontSize: 12, color: theme.colors.subtext }}>{count}</Text>
    </View>
  )
}

function CountdownCard({ label, iso }: { label: string; iso: string }) {
  const val = timeAgoOrCountdown(iso)
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: theme.colors.border }}>
      <Text style={{ fontSize: 11, color: theme.colors.subtext, marginBottom: 4 }}>{label}</Text>
      <Text style={{ fontSize: 18, fontWeight: '700', color: theme.colors.text }}>{val}</Text>
    </View>
  )
}

function ScheduleField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: theme.colors.text }}>{label}</Text>
      {children}
    </View>
  )
}

function MatchEditForm({ match, teams, onSave, onCancel }: {
  match: any
  teams: TournamentTeamWithRoster[]
  onSave: (scheduledAt: string, court: string, aId: string | null, bId: string | null) => void
  onCancel: () => void
}) {
  const [court, setCourt] = useState(match.court ?? '')
  const [scheduledAt, setScheduledAt] = useState(match.scheduled_at ? new Date(match.scheduled_at).toISOString().slice(0, 16) : '')
  const [teamAId, setTeamAId] = useState<string | null>(match.team_a_id)
  const [teamBId, setTeamBId] = useState<string | null>(match.team_b_id)

  return (
    <View style={{ gap: 10 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.subtext, textTransform: 'uppercase', letterSpacing: 0.6 }}>Edit Match</Text>
      <EditField label="Court" value={court} onChangeText={setCourt} placeholder="Court A" />
      <EditField label="Start time" value={scheduledAt} onChangeText={setScheduledAt} placeholder="YYYY-MM-DDTHH:MM" />
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 12, color: theme.colors.subtext }}>Team A</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {teams.map(t => (
              <TouchableOpacity key={t.id} onPress={() => setTeamAId(t.id)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: teamAId === t.id ? theme.colors.primary : theme.colors.border }}>
                <Text style={{ fontSize: 12, color: teamAId === t.id ? '#fff' : theme.colors.text }}>{t.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 12, color: theme.colors.subtext }}>Team B</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {teams.map(t => (
              <TouchableOpacity key={t.id} onPress={() => setTeamBId(t.id)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: teamBId === t.id ? theme.colors.primary : theme.colors.border }}>
                <Text style={{ fontSize: 12, color: teamBId === t.id ? '#fff' : theme.colors.text }}>{t.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity onPress={onCancel} style={{ flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center' }}>
          <Text style={{ fontSize: 14, color: theme.colors.text }}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onSave(scheduledAt ? new Date(scheduledAt).toISOString() : match.scheduled_at, court, teamAId, teamBId)} style={{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: theme.colors.primary, alignItems: 'center' }}>
          <Text style={{ fontSize: 14, color: '#fff', fontWeight: '600' }}>Save</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

function EditField({ label, value, onChangeText, placeholder }: { label: string; value: string; onChangeText: (v: string) => void; placeholder: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ fontSize: 12, color: theme.colors.subtext }}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={theme.colors.subtext}
        style={{ backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: theme.colors.text }} />
    </View>
  )
}
