import { useEffect, useState } from 'react'
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../../lib/supabase'
import { shared, theme } from '../../../constants'
import { BadgeIcon } from '../../../components/BadgeIcon'
import { ProfileAvatar } from '../../../components/ProfileAvatar'
import { BADGE_DEFINITIONS } from '../../../constants/badges'
import { resolveProfileAvatarUriWithError, normalizeVolleyballSkillLevel, volleyballSkillLevelLabel } from '../../../utils'
import type { Profile, UserBadge } from '../../../types'

const POS_ABBREV: Record<string, string> = {
  setter: 'S',
  libero: 'L',
  outside_hitter: 'OH',
  middle_blocker: 'MB',
  defensive_specialist: 'DS',
  opposite_hitter: 'OPP',
}

const AVATAR_SIZE = 88

export default function UserProfileDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [avatarUri, setAvatarUri] = useState<string | null>(null)
  const [totalCheers, setTotalCheers] = useState(0)
  const [displayBadges, setDisplayBadges] = useState<UserBadge[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [profileRes, cheersRes, badgesRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', id).single(),
        supabase.from('cheers').select('id', { count: 'exact', head: true }).eq('receiver_id', id),
        supabase.from('user_badges')
          .select('id, user_id, badge_type, tier, awarded_at, display_order, display_tier')
          .eq('user_id', id)
          .not('display_order', 'is', null)
          .order('display_order', { ascending: true }),
      ])

      if (!profileRes.error && profileRes.data) {
        const raw = profileRes.data as Profile
        const p = { ...raw, skill_level: normalizeVolleyballSkillLevel((raw as any).skill_level) }
        setProfile(p)
        if (p.avatar_url) {
          const { uri } = await resolveProfileAvatarUriWithError(p.avatar_url)
          setAvatarUri(uri)
        }
      }

      setTotalCheers(cheersRes.count ?? 0)
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
        paddingTop: insets.top + theme.spacing.sm,
        paddingBottom: theme.spacing.sm,
        paddingHorizontal: theme.spacing.lg,
        backgroundColor: theme.colors.background,
      }}>
        <TouchableOpacity onPress={goBack} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="chevron-back" size={20} color={theme.colors.primary} />
          <Text style={{ color: theme.colors.primary, fontSize: theme.font.size.sm }}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={openDM} style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="chatbubble-outline" size={18} color={theme.colors.primary} />
          <Text style={{ color: theme.colors.primary, fontSize: theme.font.size.sm, fontFamily: theme.fonts.bodySemiBold }}>Message</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={shared.centered}><ActivityIndicator color={theme.colors.primary} /></View>
      ) : !profile ? (
        <View style={shared.centered}><Text style={shared.errorText}>Profile not found</Text></View>
      ) : (
        <ScrollView
          style={shared.screen}
          contentContainerStyle={[shared.scrollContent, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Hero card ── */}
          <View style={{
            backgroundColor: theme.colors.card,
            borderRadius: 24,
            padding: 18,
            alignItems: 'center',
            gap: theme.spacing.xs,
            overflow: 'hidden',
            position: 'relative',
          }}>
            {/* Radial gradient decoration */}
            <LinearGradient
              colors={[theme.colors.primary, 'transparent']}
              start={{ x: 1, y: 0 }}
              end={{ x: 0.3, y: 0.7 }}
              style={{
                position: 'absolute', top: 0, right: 0,
                width: 200, height: 200, borderRadius: 100,
                opacity: 0.55,
              }}
              pointerEvents="none"
            />

            {/* Avatar + name row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, width: '100%' }}>
              <ProfileAvatar
                uri={avatarUri}
                border={profile.selected_border ?? null}
                size={AVATAR_SIZE}
              />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{
                  fontFamily: theme.fonts.body,
                  fontSize: 10.5, fontWeight: '700',
                  color: 'rgba(255,255,255,0.55)',
                  letterSpacing: 1, textTransform: 'uppercase',
                }}>
                  Member since '{new Date(profile.created_at).getFullYear().toString().slice(2)}
                </Text>
                <Text style={{
                  fontFamily: theme.fonts.display,
                  fontSize: 22, letterSpacing: -0.5,
                  color: '#FFFFFF', lineHeight: 24,
                }}>
                  {displayName}
                </Text>
                {/* Position chips */}
                {(profile.position?.length ?? 0) > 0 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 2 }}>
                    {profile.position.slice(0, 2).map(pos => (
                      <View key={pos} style={{
                        paddingHorizontal: 9, paddingVertical: 4,
                        borderRadius: theme.radius.full,
                        backgroundColor: theme.colors.accent,
                      }}>
                        <Text style={{
                          fontFamily: theme.fonts.displaySemiBold,
                          fontSize: 11, color: theme.colors.accentInk,
                        }}>{POS_ABBREV[pos] ?? pos}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>

            {/* Bio */}
            {profile.bio ? (
              <Text style={{
                fontFamily: theme.fonts.body,
                fontSize: theme.font.size.sm,
                color: 'rgba(255,255,255,0.75)',
                lineHeight: 18, marginTop: 4, width: '100%',
              }}>
                {profile.bio}
              </Text>
            ) : null}

            {/* Stat trio */}
            <View style={{
              flexDirection: 'row', gap: 1, marginTop: 14,
              borderRadius: 14, overflow: 'hidden',
              backgroundColor: 'rgba(255,255,255,0.08)', width: '100%',
            }}>
              <View style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 10, backgroundColor: 'rgba(255,255,255,0.04)', alignItems: 'center' }}>
                <Text style={{ fontFamily: theme.fonts.display, fontSize: 26, letterSpacing: -1, color: theme.colors.accent }}>
                  {profile.skill_level ? volleyballSkillLevelLabel(profile.skill_level) : '—'}
                </Text>
                <Text style={{ fontFamily: theme.fonts.body, fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.55)', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 1 }}>Skill</Text>
              </View>
              <View style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 10, backgroundColor: 'rgba(255,255,255,0.04)', alignItems: 'center' }}>
                <Text style={{ fontFamily: theme.fonts.display, fontSize: 26, letterSpacing: -1, color: '#FFFFFF' }}>{totalCheers}</Text>
                <Text style={{ fontFamily: theme.fonts.body, fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.55)', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 1 }}>Cheers</Text>
              </View>
              <View style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 10, backgroundColor: 'rgba(255,255,255,0.04)', alignItems: 'center' }}>
                <Text style={{ fontFamily: theme.fonts.display, fontSize: 26, letterSpacing: -1, color: '#FFFFFF' }}>0</Text>
                <Text style={{ fontFamily: theme.fonts.body, fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.55)', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 1 }}>Trophies</Text>
              </View>
            </View>

            {/* Displayed badges */}
            {displayBadges.length > 0 && (
              <View style={{
                flexDirection: 'row', gap: theme.spacing.md,
                marginTop: theme.spacing.sm, justifyContent: 'center',
                borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.15)',
                paddingTop: theme.spacing.sm, width: '100%',
              }}>
                {displayBadges.map(badge => {
                  const def = BADGE_DEFINITIONS.find(d => d.type === badge.badge_type)
                  if (!def) return null
                  return <BadgeIcon key={badge.badge_type} def={def} tier={badge.display_tier ?? badge.tier} size="sm" />
                })}
              </View>
            )}
          </View>

          {/* ── Trophy case ── */}
          <View style={{ marginTop: theme.spacing.lg }}>
            <Text style={{
              fontFamily: theme.fonts.display, fontWeight: '700',
              fontSize: 18, color: theme.colors.text, marginBottom: theme.spacing.sm,
            }}>Trophy case</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {([
                { place: '1', color: '#FFD54F', label: '1st place' },
                { place: '2', color: '#B0BEC5', label: '2nd place' },
                { place: '3', color: '#D7A86E', label: '3rd place' },
              ] as const).map(t => (
                <View key={t.place} style={{
                  flex: 1, backgroundColor: theme.colors.card,
                  borderRadius: 16, padding: 12,
                  borderWidth: 1, borderColor: theme.colors.border,
                  alignItems: 'center',
                }}>
                  <View style={{
                    width: 40, height: 40, borderRadius: 20,
                    backgroundColor: t.color,
                    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
                  }}>
                    <Text style={{ fontFamily: theme.fonts.display, fontWeight: '700', fontSize: 18, color: '#1A1A1A' }}>{t.place}</Text>
                  </View>
                  <Text style={{ fontFamily: theme.fonts.bodyBold, fontSize: 10.5, color: theme.colors.text, letterSpacing: 0.2 }}>{t.label}</Text>
                  <Text style={{ fontFamily: theme.fonts.body, fontSize: 9.5, color: theme.colors.subtext, marginTop: 1 }}>—</Text>
                </View>
              ))}
            </View>
          </View>

        </ScrollView>
      )}
    </View>
  )
}
