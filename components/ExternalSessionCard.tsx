import { memo } from 'react'
import { Linking, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { shared, theme } from '../constants'
import type { ExternalSession } from '../types'
import { formatSessionTimeRange, signupHost } from '../utils/feedItems'

type Props = { session: ExternalSession }

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

const SURFACE: Record<NonNullable<ExternalSession['surface']>, { label: string; color: string }> = {
  indoor: { label: 'Indoor', color: theme.colors.primary },
  sand:   { label: 'Sand',   color: theme.colors.warm },
  grass:  { label: 'Grass',  color: theme.colors.cool },
}

/**
 * A session another Austin venue or group runs (synced from Volley ATX). Not a
 * vclub event: nobody RSVPs here, so the whole card links out to the venue's
 * own sign-up page. Dashed border keeps it visibly distinct from club events.
 */
function ExternalSessionCardInner({ session }: Props) {
  const start = new Date(session.starts_at)
  const surface = session.surface ? SURFACE[session.surface] : null
  const accent = surface?.color ?? theme.colors.subtext
  const meta = [formatSessionTimeRange(session.starts_at, session.ends_at), session.level, session.price]
    .filter(Boolean)
    .join(' · ')
  const signupLabel = session.signup_label ?? (session.signup_url ? `Sign up on ${signupHost(session.signup_url)}` : null)

  const open = () => {
    if (session.signup_url) void Linking.openURL(session.signup_url)
  }

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={open}
      disabled={!session.signup_url}
      style={shared.externalCard}
      accessibilityRole="link"
      accessibilityLabel={`${session.title} at ${session.venue}. ${signupLabel ?? ''}`}
      testID="external-session-card"
    >
      <View style={[shared.externalDateBlock, { backgroundColor: accent + '22' }]}>
        <Text style={[shared.externalDay, { color: accent }]}>{DAYS[start.getDay()]}</Text>
        <Text style={[shared.externalDate, { color: accent }]}>{start.getDate()}</Text>
      </View>

      <View style={shared.externalBody}>
        <Text style={shared.externalKicker} numberOfLines={1}>
          {['Around Austin', surface?.label, session.session_type].filter(Boolean).join(' · ')}
        </Text>
        <Text style={shared.externalTitle} numberOfLines={2}>{session.title}</Text>
        <Text style={shared.externalMeta} numberOfLines={1}>
          {session.city ? `${session.venue} · ${session.city}` : session.venue}
        </Text>
        {meta ? <Text style={shared.externalMeta} numberOfLines={1}>{meta}</Text> : null}
        {signupLabel && (
          <View style={shared.externalSignup}>
            <Text style={shared.externalSignupLabel}>{signupLabel}</Text>
            <Ionicons name="open-outline" size={13} color={theme.colors.text} />
          </View>
        )}
      </View>
    </TouchableOpacity>
  )
}

export const ExternalSessionCard = memo(ExternalSessionCardInner)
