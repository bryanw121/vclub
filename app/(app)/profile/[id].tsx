import { useEffect, useState } from 'react'
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import { shared, theme } from '../../../constants'
import { CheerRadarChart } from '../../../components/CheerRadarChart'
import { BadgeIcon } from '../../../components/BadgeIcon'
import { ProfileAvatar } from '../../../components/ProfileAvatar'
import { BADGE_DEFINITIONS } from '../../../constants/badges'
import { resolveProfileAvatarUriWithError } from '../../../utils'
import type { CheerType, Profile, UserBadge } from '../../../types'

type CheerCounts = Partial<Record<CheerType, number>>

const AVATAR_SIZE = 80

export default function UserProfileDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [avatarUri, setAvatarUri] = useState<string | null>(null)
  const [cheerCounts, setCheerCounts] = useState<CheerCounts>({})
  const [totalCheers, setTotalCheers] = useState(0)
  const [displayBadges, setDisplayBadges] = useState<UserBadge[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [profileRes, cheersRes, badgesRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', id).single(),
        supabase.from('cheers').select('cheer_type').eq('receiver_id', id),
        supabase.from('user_badges')
          .select('id, user_id, badge_type, tier, awarded_at, display_order, display_tier')
          .eq('user_id', id)
          .not('display_order', 'is', null)
          .order('display_order', { ascending: true }),
      ])

      if (!profileRes.error && profileRes.data) {
        const p = profileRes.data as Profile
        setProfile(p)
        if (p.avatar_url) {
          const { uri } = await resolveProfileAvatarUriWithError(p.avatar_url)
          setAvatarUri(uri)
        }
      }

      const rows = (cheersRes.data ?? []) as { cheer_type: CheerType }[]
      const counts: CheerCounts = {}
      for (const row of rows) counts[row.cheer_type] = (counts[row.cheer_type] ?? 0) + 1
      setCheerCounts(counts)
      setTotalCheers(rows.length)
      setDisplayBadges((badgesRes.data ?? []) as UserBadge[])
      setLoading(false)
    }
    void load()
  }, [id])

  function goBack() {
    if (router.canGoBack()) router.back()
    else router.replace('/(app)/(tabs)')
  }

  async function openDM() {
    const { data: convId } = await supabase.rpc('find_or_create_dm', { other_user_id: id })
    if (convId) router.push(`/chat/${convId}` as any)
  }

  const displayName = profile
    ? ([profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.username)
    : ''

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Nav bar */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md,
        borderBottomWidth: 1, borderBottomColor: theme.colors.border,
        backgroundColor: theme.colors.background,
      }}>
        <TouchableOpacity onPress={goBack} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="chevron-back" size={20} color={theme.colors.primary} />
          <Text style={{ color: theme.colors.primary, fontSize: theme.font.size.sm }}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={openDM} style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="chatbubble-outline" size={20} color={theme.colors.primary} />
          <Text style={{ color: theme.colors.primary, fontSize: theme.font.size.sm }}>Message</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={shared.centered}><ActivityIndicator color={theme.colors.primary} /></View>
      ) : !profile ? (
        <View style={shared.centered}><Text style={shared.errorText}>Profile not found</Text></View>
      ) : (
        <ScrollView style={shared.screen} contentContainerStyle={shared.scrollContent}>

          {/* Profile card */}
          <View style={shared.card}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md }}>
              {/* Avatar with border */}
              <ProfileAvatar uri={avatarUri} border={profile.selected_border ?? null} size={AVATAR_SIZE} />

              {/* Info */}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={shared.heading} numberOfLines={1}>{displayName}</Text>
                {profile.first_name && profile.last_name && (
                  <Text style={[shared.caption, { marginTop: 2 }]}>@{profile.username}</Text>
                )}
                {profile.position?.length > 0 && (
                  <Text style={[shared.body, { marginTop: theme.spacing.xs }]}>
                    {profile.position
                      .map(p => p.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))
                      .join(' · ')}
                  </Text>
                )}
                {profile.bio ? (
                  <Text style={[shared.body, { marginTop: theme.spacing.xs }]}>{profile.bio}</Text>
                ) : null}
                <Text style={[shared.caption, { marginTop: theme.spacing.xs }]}>
                  joined {new Date(profile.created_at).toLocaleDateString()}
                </Text>
              </View>
            </View>

            {/* Display badges — appended inside the profile card */}
            {displayBadges.length > 0 && (
              <View style={{ flexDirection: 'row', gap: theme.spacing.md, marginTop: theme.spacing.md, justifyContent: 'center' }}>
                {displayBadges.map(badge => {
                  const def = BADGE_DEFINITIONS.find(d => d.type === badge.badge_type)
                  if (!def) return null
                  return <BadgeIcon key={badge.badge_type} def={def} tier={badge.display_tier ?? badge.tier} size="sm" />
                })}
              </View>
            )}
          </View>

          {/* Cheers */}
          {totalCheers > 0 && (
            <View style={[shared.card, { marginTop: theme.spacing.md }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.sm }}>
                <Text style={shared.subheading}>Cheers</Text>
                <View style={{
                  paddingHorizontal: theme.spacing.sm, paddingVertical: 2,
                  borderRadius: theme.radius.full,
                  backgroundColor: theme.colors.primary + '18',
                  borderWidth: 1, borderColor: theme.colors.primary + '40',
                }}>
                  <Text style={{ fontSize: theme.font.size.xs, fontWeight: theme.font.weight.bold, color: theme.colors.primary }}>
                    {totalCheers}
                  </Text>
                </View>
              </View>
              <CheerRadarChart counts={cheerCounts} />
            </View>
          )}

        </ScrollView>
      )}
    </View>
  )
}
