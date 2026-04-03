import { useEffect, useState } from 'react'
import { View, Text, Image, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import { shared, theme } from '../../../constants'
import { CheerRadarChart } from '../../../components/CheerRadarChart'
import { resolveProfileAvatarUriWithError } from '../../../utils'
import type { KudoType, Profile } from '../../../types'

type CheerCounts = Partial<Record<KudoType, number>>

const AVATAR_SIZE = 80

export default function UserProfileDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [avatarUri, setAvatarUri] = useState<string | null>(null)
  const [cheerCounts, setCheerCounts] = useState<CheerCounts>({})
  const [totalCheers, setTotalCheers] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [profileRes, cheersRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', id).single(),
        supabase.from('cheers').select('cheer_type').eq('receiver_id', id),
      ])

      if (!profileRes.error && profileRes.data) {
        const p = profileRes.data as Profile
        setProfile(p)
        if (p.avatar_url) {
          const { uri } = await resolveProfileAvatarUriWithError(p.avatar_url)
          setAvatarUri(uri)
        }
      }

      const rows = (cheersRes.data ?? []) as { cheer_type: KudoType }[]
      const counts: CheerCounts = {}
      for (const row of rows) counts[row.cheer_type] = (counts[row.cheer_type] ?? 0) + 1
      setCheerCounts(counts)
      setTotalCheers(rows.length)
      setLoading(false)
    }
    void load()
  }, [id])

  function goBack() {
    if (router.canGoBack()) router.back()
    else router.replace('/(app)/(tabs)')
  }

  const displayName = profile
    ? ([profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.username)
    : ''

  const initial = profile
    ? (profile.first_name?.charAt(0) ?? profile.username.charAt(0)).toUpperCase()
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
              {/* Avatar */}
              <View style={{
                width: AVATAR_SIZE, height: AVATAR_SIZE,
                borderRadius: AVATAR_SIZE / 2,
                backgroundColor: theme.colors.border,
                borderWidth: 2, borderColor: theme.colors.border,
                alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden', flexShrink: 0,
              }}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }} />
                ) : (
                  <Text style={{ fontSize: theme.font.size.xl, fontWeight: theme.font.weight.bold, color: theme.colors.subtext }}>
                    {initial}
                  </Text>
                )}
              </View>

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
                <Text style={[shared.caption, { marginTop: theme.spacing.xs }]}>
                  joined {new Date(profile.created_at).toLocaleDateString()}
                </Text>
              </View>
            </View>
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
