import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { shared, theme } from '../../constants'
import { formatEventDate, profileDisplayName } from '../../utils'
import { deletionPlanIsEmpty } from '../../utils/accountDeletion'
import type { AccountDeletionPlan, AccountDeletionSuccessor } from '../../types'

type Props = { plan: AccountDeletionPlan }

type RowProps = {
  title: string
  subtitle?: string
  /** Destructive outcome (deleted / cancelled) vs a hand-over. */
  destructive: boolean
  outcome: string
}

function Row({ title, subtitle, destructive, outcome }: RowProps) {
  return (
    <View style={[shared.row, { gap: theme.spacing.sm, paddingVertical: theme.spacing.sm }]}>
      <Ionicons
        name={destructive ? 'trash-outline' : 'swap-horizontal-outline'}
        size={18}
        color={destructive ? theme.colors.error : theme.colors.primary}
      />
      <View style={{ flex: 1 }}>
        <Text style={shared.body} numberOfLines={2}>{title}</Text>
        {!!subtitle && <Text style={shared.caption}>{subtitle}</Text>}
        <Text style={[shared.caption, { color: destructive ? theme.colors.error : theme.colors.primary }]}>{outcome}</Text>
      </View>
    </View>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={[shared.card, { gap: 0 }]}>
      <Text style={[shared.subheading, { marginBottom: theme.spacing.xs }]}>{title}</Text>
      {children}
    </View>
  )
}

const to = (p: AccountDeletionSuccessor | null) => (p ? `Goes to ${profileDisplayName(p)} (@${p.username})` : '')

/** The confirm screen's list: every club, tournament and upcoming event, and what happens to it. */
export function DeletionPlanList({ plan }: Props) {
  if (deletionPlanIsEmpty(plan)) {
    return (
      <View style={shared.card}>
        <Text style={shared.body}>You don't own any clubs, tournaments or upcoming events, so nothing else is deleted or handed over.</Text>
      </View>
    )
  }
  return (
    <View style={{ gap: theme.spacing.md }} testID="deletion-plan">
      {plan.clubs.length > 0 && (
        <Section title="Clubs you created">
          {plan.clubs.map(c => (
            <Row
              key={c.id}
              title={c.name}
              destructive={c.action === 'delete'}
              outcome={c.action === 'delete' ? 'Deleted, with its posts, chat and tournaments (no other owner)' : to(c.to)}
            />
          ))}
        </Section>
      )}
      {plan.tournaments.length > 0 && (
        <Section title="Tournaments">
          {plan.tournaments.map(t => (
            <Row
              key={t.id}
              title={t.title}
              subtitle={t.with_club ? `In ${t.with_club}` : undefined}
              destructive={t.action === 'delete'}
              outcome={t.action === 'delete'
                ? (t.with_club ? 'Deleted with the club' : 'Deleted (no club owner to take it over)')
                : to(t.to)}
            />
          ))}
        </Section>
      )}
      {plan.events.length > 0 && (
        <Section title="Upcoming events you host">
          {plan.events.map(e => (
            <Row
              key={e.id}
              title={e.title}
              subtitle={formatEventDate(e.event_date)}
              destructive={e.action === 'cancel'}
              outcome={e.action === 'cancel' ? 'Cancelled, and players who joined are notified' : `${to(e.to)} (your co-host)`}
            />
          ))}
        </Section>
      )}
      {plan.past_events_kept > 0 && (
        <View style={shared.card}>
          <Text style={shared.body}>
            {plan.past_events_kept === 1 ? '1 past event' : `${plan.past_events_kept} past events`} you hosted will stay, without your name.
          </Text>
        </View>
      )}
    </View>
  )
}
