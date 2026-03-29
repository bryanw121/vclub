import { useEffect, useState } from 'react'
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import { shared, theme } from '../../../constants'
import type { Profile } from '../../../types'

export default function UserProfileDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (!error && data) setProfile(data as Profile)
        setLoading(false)
      })
  }, [id])

  function goBack() {
    if (router.canGoBack()) router.back()
    else router.replace('/(app)/(tabs)')
  }

  const displayName = profile
    ? ([profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.username)
    : ''

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Page header — shown on all platforms */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        backgroundColor: theme.colors.background,
        gap: theme.spacing.sm,
      }}>
        <TouchableOpacity onPress={goBack} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: theme.spacing.sm }}>
          <Ionicons name="chevron-back" size={20} color={theme.colors.primary} />
          <Text style={{ color: theme.colors.primary, fontSize: theme.font.size.sm }}>Back</Text>
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: theme.font.size.lg, fontWeight: theme.font.weight.semibold, color: theme.colors.text }} numberOfLines={1}>
          {displayName}
        </Text>
      </View>

      {loading ? (
        <View style={shared.centered}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : !profile ? (
        <View style={shared.centered}>
          <Text style={shared.errorText}>Profile not found</Text>
        </View>
      ) : (
        <ScrollView style={shared.screen} contentContainerStyle={shared.scrollContent}>
          <Text style={[shared.body, shared.mb_xs]}>{profile.username}</Text>
          <Text style={[shared.caption, shared.mb_xl]}>
            Joined {new Date(profile.created_at).toLocaleDateString()}
          </Text>
          {profile.position?.length > 0 && (
            <>
              <View style={shared.divider} />
              <Text style={[shared.subheading, shared.mb_sm]}>Positions</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
                {profile.position.map(p => (
                  <View key={p} style={shared.tag}>
                    <Text style={shared.tagText}>
                      {p.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      )}
    </View>
  )
}
