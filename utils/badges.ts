import { supabase } from '../lib/supabase'
import { BADGE_DEFINITIONS, BETA_ACTIVE, VEX_MEMBER_ACTIVE, badgeTierLabel } from '../constants/badges'
import type { UserBadge, Profile } from '../types'

// ─── Stats ────────────────────────────────────────────────────────────────────

export type BadgeStats = {
  events_attended_past: number
  events_hosted_past: number
  cheers_received_total: number
  cheers_given_events: number   // distinct event count where user gave cheers
  spike_cheers: number
  serve_cheers: number
  block_cheers: number
  set_cheers: number
  dig_pass_cheers: number
  communication_cheers: number
  tournament_hosted: boolean
  profile_complete: boolean
}

export async function collectBadgeStats(
  userId: string,
  profile: Pick<Profile, 'first_name' | 'last_name' | 'position' | 'avatar_url'>,
): Promise<BadgeStats> {
  const now = new Date().toISOString()

  const [attendedRes, hostedRes, cheersReceivedRes, cheersGivenRes] = await Promise.all([
    // Past events attended (status = attending, event already started)
    supabase
      .from('event_attendees')
      .select('event_id, events!inner(event_date)')
      .eq('user_id', userId)
      .eq('status', 'attending')
      .lt('events.event_date', now),

    // Past events hosted (with tags to detect tournaments)
    supabase
      .from('events')
      .select('id, event_tags(tags(name))')
      .eq('created_by', userId)
      .lt('event_date', now),

    // All cheers received (with type breakdown)
    supabase
      .from('cheers')
      .select('cheer_type')
      .eq('receiver_id', userId),

    // Events where this user gave cheers (for distinct-event count)
    supabase
      .from('cheers')
      .select('event_id')
      .eq('giver_id', userId),
  ])

  // Attendee count
  const attendedCount = (attendedRes.data ?? []).length

  // Hosted count + tournament check
  const hostedEvents = hostedRes.data ?? []
  const hostedCount = hostedEvents.length
  const tournamentHosted = hostedEvents.some((e: any) =>
    (e.event_tags ?? []).some((et: any) =>
      et.tags?.name?.toLowerCase().includes('tournament'),
    ),
  )

  // Cheer breakdown
  const cheersReceived = cheersReceivedRes.data ?? []
  const byType: Record<string, number> = {}
  for (const c of cheersReceived as { cheer_type: string }[]) {
    byType[c.cheer_type] = (byType[c.cheer_type] ?? 0) + 1
  }

  // Distinct events where cheers were given
  const cheersGiven = cheersGivenRes.data ?? []
  const distinctCheersGivenEvents = new Set(
    (cheersGiven as { event_id: string }[]).map(c => c.event_id),
  ).size

  const profileComplete = !!(
    profile.first_name &&
    profile.last_name &&
    (profile.position?.length ?? 0) > 0 &&
    profile.avatar_url
  )

  return {
    events_attended_past: attendedCount,
    events_hosted_past: hostedCount,
    cheers_received_total: cheersReceived.length,
    cheers_given_events: distinctCheersGivenEvents,
    spike_cheers: byType['spike'] ?? 0,
    serve_cheers: byType['serve'] ?? 0,
    block_cheers: byType['block'] ?? 0,
    set_cheers: byType['set'] ?? 0,
    dig_pass_cheers: (byType['dig'] ?? 0) + (byType['pass'] ?? 0),
    communication_cheers: byType['communication'] ?? 0,
    tournament_hosted: tournamentHosted,
    profile_complete: profileComplete,
  }
}

// ─── Award logic ──────────────────────────────────────────────────────────────

/**
 * Compares current stats to badge thresholds. Inserts new badges and upgrades
 * existing tiers as needed. Fires a notification for each new award/upgrade.
 * Returns the list of newly awarded / upgraded badges.
 */
export async function checkAndAwardBadges(
  userId: string,
  stats: BadgeStats,
  existingBadges: UserBadge[],
): Promise<UserBadge[]> {
  const awarded: UserBadge[] = []

  for (const def of BADGE_DEFINITIONS) {
    // Resolve numeric stat value for this badge's criterion
    let statValue: number
    switch (def.stat) {
      case 'beta_active':
        statValue = BETA_ACTIVE ? 1 : 0
        break
      case 'vex_member':
        statValue = VEX_MEMBER_ACTIVE ? 1 : 0
        break
      case 'tournament_hosted':
        statValue = stats.tournament_hosted ? 1 : 0
        break
      case 'profile_complete':
        statValue = stats.profile_complete ? 1 : 0
        break
      default:
        statValue = stats[def.stat as keyof BadgeStats] as number
    }

    // Highest tier the user qualifies for
    const qualifyingTiers = def.tiers.filter(t => statValue >= t.threshold)
    if (qualifyingTiers.length === 0) continue
    const highest = qualifyingTiers[qualifyingTiers.length - 1]

    const existing = existingBadges.find(b => b.badge_type === def.type)

    if (!existing) {
      // Award brand-new badge
      const { data, error } = await supabase
        .from('user_badges')
        .insert({ user_id: userId, badge_type: def.type, tier: highest.tier })
        .select('id, user_id, badge_type, tier, awarded_at, display_order')
        .single()

      if (!error && data) {
        awarded.push(data as UserBadge)
        await supabase.from('notifications').insert({
          user_id: userId,
          notification_type: 'badge_earned',
          title: `Badge unlocked: ${highest.label}`,
          body: def.description,
          data: { badge_type: def.type },
        })
      }
    } else if (highest.tier > existing.tier) {
      // Upgrade tier
      const { data, error } = await supabase
        .from('user_badges')
        .update({ tier: highest.tier, awarded_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select('id, user_id, badge_type, tier, awarded_at, display_order')
        .single()

      if (!error && data) {
        awarded.push(data as UserBadge)
        await supabase.from('notifications').insert({
          user_id: userId,
          notification_type: 'badge_earned',
          title: `Badge upgraded: ${badgeTierLabel(def, highest.tier)}`,
          body: def.description,
          data: { badge_type: def.type },
        })
      }
    }
  }

  return awarded
}
