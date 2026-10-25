import React from 'react'
import { ScrollView, Text, View } from 'react-native'
import { theme } from '../../constants'
import { SKILL_LABELS } from '../../constants/tournamentCopy'
import { profileDisplayName } from '../../utils'
import { Button } from '../Button'
import type { TournamentTeam, TournamentTeamWithRoster } from '../../types'
import type { TournamentJoinRequestWithRequester } from '../../types/tournamentScreen'
import { TeamCard, type TeamCardActions } from './TeamCard'
import { MiniButton, TeamSectionLabel } from './TournamentBits'
import { ts } from './tournamentStyles'

type Props = {
  teams: TournamentTeamWithRoster[]
  myTeam: TournamentTeam | null
  viewerId: string | null
  isCreator: boolean
  registrationOpen: boolean
  joinRequests: TournamentJoinRequestWithRequester[]
  actions: TeamCardActions
}

export function TeamsTab({ teams, myTeam, viewerId, isCreator, registrationOpen, joinRequests, actions }: Props) {
  const approved = teams.filter(t => t.status === 'registered' && t.is_approved)
  const pending = teams.filter(t => t.status === 'registered' && !t.is_approved)
  const freeAgents = teams.filter(t => t.status === 'free_agent')

  const card = (t: TournamentTeamWithRoster) => (
    <TeamCard
      key={t.id}
      team={t}
      isOrganizer={isCreator}
      viewerId={viewerId}
      myTeam={myTeam}
      registrationOpen={registrationOpen}
      joinRequests={joinRequests}
      actions={actions}
    />
  )

  return (
    <ScrollView contentContainerStyle={ts.scrollContent} showsVerticalScrollIndicator={false}>
      {/* Captain action strip */}
      {myTeam && !isCreator && myTeam.captain_user_id === viewerId && (
        <View style={{ marginBottom: 14 }}>
          <Button label="Invite Players" icon="person-add-outline" onPress={actions.onInvite} />
        </View>
      )}

      {approved.length > 0 && <TeamSectionLabel title="Registered" count={approved.length} />}
      {approved.map(card)}

      {pending.length > 0 && <TeamSectionLabel title="Pending Approval" count={pending.length} />}
      {pending.map(card)}

      {freeAgents.length > 0 && <TeamSectionLabel title="Free Agents" count={freeAgents.length} />}
      {freeAgents.map(card)}

      {teams.length === 0 && (
        <View style={{ alignItems: 'center', paddingVertical: 56 }}>
          <Text style={{ fontSize: 36, marginBottom: 10 }}>🏐</Text>
          <Text style={{ fontFamily: theme.fonts.display, fontSize: 16, color: theme.colors.subtext }}>No teams yet</Text>
          <Text style={{ fontFamily: theme.fonts.body, fontSize: 13, color: theme.colors.subtext, marginTop: 4 }}>Be the first to register.</Text>
        </View>
      )}

      {/* Organizer: join requests across all teams */}
      {isCreator && joinRequests.length > 0 && (
        <View style={[ts.card, { marginTop: 8, marginBottom: 0 }]}>
          <Text style={[ts.sectionTitle, { marginBottom: 10 }]}>All Join Requests</Text>
          {joinRequests.map(req => (
            <View key={req.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: 13, color: theme.colors.text }}>{req.requester ? profileDisplayName(req.requester) : 'Unknown'}</Text>
                <Text style={{ fontSize: 11, color: theme.colors.subtext }}>
                  {req.requester?.skill_level ? SKILL_LABELS[req.requester.skill_level] ?? req.requester.skill_level : ''} → {teams.find(t => t.id === req.team_id)?.name ?? '?'}
                </Text>
              </View>
              <MiniButton label="Approve" tone="accept" onPress={() => actions.onApproveRequest(req)} />
              <MiniButton label="Decline" tone="neutral" onPress={() => actions.onDeclineRequest(req.id)} />
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  )
}
