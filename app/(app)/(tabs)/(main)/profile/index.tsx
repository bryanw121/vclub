import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { ComponentProps } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSpring,
  runOnJS,
  Easing,
} from 'react-native-reanimated'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../../../../lib/supabase'
import { Sentry } from '../../../../../lib/sentry'
import { Button } from '../../../../../components/Button'
import { Input } from '../../../../../components/Input'
import { Toast } from '../../../../../components/Toast'
import { BadgeIcon } from '../../../../../components/BadgeIcon'
import {
  shared,
  theme,
  AVATARS_BUCKET,
  AVATAR_MAX_FILE_BYTES,
  BADGE_DEFINITIONS,
  badgeTitle,
  badgeTierLabel,
} from '../../../../../constants'

import { PROFILE_BORDERS, isBorderUnlocked } from '../../../../../constants/badges'
import type { ProfileBorderDef, ProfileBorderType } from '../../../../../constants/badges'
import {
  normalizeVolleyballPositions,
  resolveProfileAvatarUriWithError,
  volleyballPositionsEqualUnordered,
} from '../../../../../utils'
import type { Profile, VolleyballPosition } from '../../../../../types'
import { useTabsContext } from '../../../../../contexts/tabs'
import { useBadges } from '../../../../../hooks/useBadges'

type Section = 'menu' | 'edit'

const VOLLEYBALL_POSITION_OPTIONS: { value: VolleyballPosition; label: string }[] = [
  { value: 'setter', label: 'Setter' },
  { value: 'libero', label: 'Libero' },
  { value: 'outside_hitter', label: 'Outside Hitter (OH)' },
  { value: 'middle_blocker', label: 'Middle Blocker (MB)' },
  { value: 'defensive_specialist', label: 'Defensive Specialist (DS)' },
  { value: 'opposite_hitter', label: 'Opposite Hitter (OPP)' },
]

const AVATAR_SIZE = 88

function positionLabels(positions: VolleyballPosition[]): string {
  if (positions.length === 0) return ''
  return positions
    .map(p => VOLLEYBALL_POSITION_OPTIONS.find(o => o.value === p)?.label ?? p)
    .join(' · ')
}

// ─── Avatar with animated/styled border ───────────────────────────────────────

/** Ring thickness in px. All border variants use the same outer container size. */
const RING = 3
const AVATAR_OUTER = AVATAR_SIZE + RING * 2  // 94 — consistent for all border types

type AvatarProps = {
  uri: string | null
  loading: boolean
  border: Profile['selected_border']
  onPress: () => void
  editMode: boolean
  onDelete: () => void
  hasAvatar: boolean
}

function AvatarInner({
  uri, loading, onPress, editMode,
}: Pick<AvatarProps, 'uri' | 'loading' | 'onPress' | 'editMode'>) {
  return (
    <Pressable
      onPress={editMode ? onPress : undefined}
      disabled={loading || !editMode}
      accessibilityRole="button"
      accessibilityLabel={editMode ? 'Change profile picture' : 'Profile picture'}
      style={{
        width: AVATAR_SIZE, height: AVATAR_SIZE,
        borderRadius: AVATAR_SIZE / 2,
        overflow: 'hidden',
        backgroundColor: theme.colors.border,
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      {loading ? (
        <ActivityIndicator color={theme.colors.primary} />
      ) : uri ? (
        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} accessibilityIgnoresInvertColors />
      ) : (
        <Ionicons name="person" size={40} color={theme.colors.subtext} />
      )}
    </Pressable>
  )
}

/** Shared inner hole — cuts out center of gradient ring, hosts the avatar content. */
function RingHole({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <View style={[{
      position: 'absolute',
      top: RING, left: RING, right: RING, bottom: RING,
      borderRadius: AVATAR_SIZE / 2,
      overflow: 'hidden',
      backgroundColor: theme.colors.card,
      alignItems: 'center', justifyContent: 'center',
    }, style]}>
      {children}
    </View>
  )
}

/** Bronze border — warm gradient ring, no animation. */
function BronzeBorder({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ width: AVATAR_OUTER, height: AVATAR_OUTER, borderRadius: AVATAR_OUTER / 2, overflow: 'hidden' }}>
      <LinearGradient
        colors={['#C4873A', '#CD7F32', '#7A3B0A'] as [string, string, string]}
        start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <RingHole>{children}</RingHole>
    </View>
  )
}

/** Gold border — rich gold gradient ring with a warm persistent glow. */
function GoldBorder({ children }: { children: React.ReactNode }) {
  return (
    <View style={[
      { width: AVATAR_OUTER, height: AVATAR_OUTER, borderRadius: AVATAR_OUTER / 2 },
      Platform.select({
        ios: { shadowColor: '#FFD700', shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.72 },
        android: { elevation: 8 },
        web: { filter: 'drop-shadow(0 0 8px #FFD700BB)' } as any,
      }),
    ]}>
      <View style={{ width: AVATAR_OUTER, height: AVATAR_OUTER, borderRadius: AVATAR_OUTER / 2, overflow: 'hidden' }}>
        <LinearGradient
          colors={['#FFE566', '#FFD700', '#C8860A'] as [string, string, string]}
          start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <RingHole>{children}</RingHole>
      </View>
    </View>
  )
}

/**
 * Legend border — spinning aurora gradient ring with pulsing glow.
 * Outer container is exactly AVATAR_OUTER × AVATAR_OUTER (same as other borders).
 * The spinning is achieved by rotating the outer ring container; the inner content
 * counter-rotates so the avatar stays upright.
 */
function LegendBorder({ children }: { children: React.ReactNode }) {
  const rot = useSharedValue(0)
  const glowO = useSharedValue(0.45)

  useEffect(() => {
    rot.value = withRepeat(withTiming(360, { duration: 3200, easing: Easing.linear }), -1, false)
    glowO.value = withRepeat(withTiming(0.9, { duration: 2000, easing: Easing.inOut(Easing.sin) }), -1, true)
  }, [])

  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }))
  const counterStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `-${rot.value}deg` }] }))
  const glowStyle = useAnimatedStyle(() => ({ opacity: glowO.value }))

  return (
    <View style={{ width: AVATAR_OUTER, height: AVATAR_OUTER }}>
      {/* Pulsing glow halo — absolute, overflow is intentional visual-only bleed */}
      <Animated.View
        pointerEvents="none"
        style={[{
          position: 'absolute',
          top: -10, left: -10,
          width: AVATAR_OUTER + 20, height: AVATAR_OUTER + 20,
          borderRadius: (AVATAR_OUTER + 20) / 2,
          backgroundColor: '#A78BFA18',
          ...Platform.select({
            ios: { shadowColor: '#A78BFA', shadowRadius: 18, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1 },
            android: { elevation: 14 },
            web: { filter: 'blur(8px)' } as any,
          }),
        }, glowStyle]}
      />

      {/* Spinning gradient ring — overflow:hidden clips the gradient to a circle */}
      <Animated.View style={[{
        width: AVATAR_OUTER, height: AVATAR_OUTER,
        borderRadius: AVATAR_OUTER / 2,
        overflow: 'hidden',
      }, spinStyle]}>
        <LinearGradient
          colors={['#A78BFA', '#38BDF8', '#34D399', '#FBBF24', '#F43F5E', '#A78BFA'] as [string, string, ...string[]]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        {/* Counter-rotate so avatar stays upright while ring spins */}
        <Animated.View style={[{
          position: 'absolute',
          top: RING, left: RING, right: RING, bottom: RING,
          borderRadius: AVATAR_SIZE / 2,
          overflow: 'hidden',
          backgroundColor: theme.colors.card,
          alignItems: 'center', justifyContent: 'center',
        }, counterStyle]}>
          {children}
        </Animated.View>
      </Animated.View>
    </View>
  )
}

function ProfileAvatar(props: AvatarProps) {
  const { border, editMode, onDelete, hasAvatar, loading } = props
  const inner = <AvatarInner uri={props.uri} loading={props.loading} onPress={props.onPress} editMode={props.editMode} />

  let bordered: React.ReactNode
  if (!border) {
    bordered = (
      <View style={{ width: AVATAR_OUTER, height: AVATAR_OUTER, alignItems: 'center', justifyContent: 'center' }}>
        {inner}
      </View>
    )
  } else if (border === 'gradient') {
    bordered = <LegendBorder>{inner}</LegendBorder>
  } else if (border === 'gold') {
    bordered = <GoldBorder>{inner}</GoldBorder>
  } else {
    bordered = <BronzeBorder>{inner}</BronzeBorder>
  }

  return (
    <View style={{ width: AVATAR_OUTER, height: AVATAR_OUTER, flexShrink: 0 }}>
      {bordered}
      {/* Delete button rendered here — outside all ring clipping contexts */}
      {editMode && hasAvatar && !loading && (
        <Pressable
          onPress={onDelete}
          accessibilityRole="button"
          accessibilityLabel="Remove profile picture"
          style={{
            position: 'absolute', top: 0, right: 0,
            width: 22, height: 22, borderRadius: 11,
            backgroundColor: theme.colors.subtext,
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 2, borderColor: theme.colors.card,
          }}
        >
          <Ionicons name="close" size={12} color={theme.colors.white} />
        </Pressable>
      )}
    </View>
  )
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function MyProfile() {
  const router = useRouter()
  const { setTabBarHidden, tabBarHeight } = useTabsContext()
  const lastScrollY = useRef(0)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  // Incremented on every local save so stale in-flight fetches don't overwrite newer state.
  const profileGenRef = useRef(0)
  const [refreshing, setRefreshing] = useState(false)
  const [section, setSection] = useState<Section>('menu')
  const handleScroll = useCallback((e: any) => {
    if (Platform.OS !== 'web') return
    if (section === 'edit') return
    const y: number = e.nativeEvent.contentOffset.y
    const diff = y - lastScrollY.current
    lastScrollY.current = y
    if (y <= 60) { setTabBarHidden(false); return }
    if (Math.abs(diff) > 5) setTabBarHidden(diff > 0)
  }, [section, setTabBarHidden])
  const [positionDraft, setPositionDraft] = useState<VolleyballPosition[]>([])
  const [firstNameDraft, setFirstNameDraft] = useState('')
  const [lastNameDraft, setLastNameDraft] = useState('')
  const [bioDraft, setBioDraft] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [borderDraft, setBorderDraft] = useState<ProfileBorderType | null>(null)
  const [borderSaving, setBorderSaving] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarDisplayUri, setAvatarDisplayUri] = useState<string | null>(null)
  const [avatarUriResolving, setAvatarUriResolving] = useState(false)
  const [avatarUriError, setAvatarUriError] = useState<string | null>(null)
  const lastResolvedAvatarUrl = useRef<string | null>(null)
  const [pendingAsset, setPendingAsset] = useState<ImagePicker.ImagePickerAsset | null>(null)
  const [toast, setToast] = useState<{ message: string; variant: 'error' | 'success' | 'info' } | null>(null)
  const [pickingSlot, setPickingSlot] = useState<number | null>(null)
  const [sheetMounted, setSheetMounted] = useState(false)
  const [badgeGridWidth, setBadgeGridWidth] = useState(0)
  const sheetProgress = useSharedValue(0)
  const insets = useSafeAreaInsets()

  const sheetTranslateStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - sheetProgress.value) * 400 }],
  }))
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: sheetProgress.value,
  }))

  // Hide tab bar while in edit mode
  useEffect(() => {
    setTabBarHidden(section === 'edit')
    return () => { if (section === 'edit') setTabBarHidden(false) }
  }, [section, setTabBarHidden])

  function openSheet(slot: number) {
    setPickingSlot(slot)
    setSheetMounted(true)
    sheetProgress.value = 0
    sheetProgress.value = withTiming(1, { duration: 280 })
  }

  function closeSheet() {
    sheetProgress.value = withTiming(0, { duration: 220 }, (finished) => {
      'worklet'
      if (finished) {
        runOnJS(setSheetMounted)(false)
        runOnJS(setPickingSlot)(null)
      }
    })
  }

  function showToast(message: string, variant: 'error' | 'success' | 'info' = 'error') {
    setToast({ message, variant })
  }

  const { badges, checkBadges, fetchBadges, setDisplaySlot } = useBadges()

  async function handleProfileRefresh() {
    setRefreshing(true)
    lastResolvedAvatarUrl.current = null // force fresh signed URL on refresh
    await Promise.all([fetchProfile(), fetchBadges(true)])
    setRefreshing(false)
  }

  useFocusEffect(
    useCallback(() => {
      void fetchProfile()
      void fetchBadges(true)
    }, [fetchBadges]),
  )

  async function fetchProfile() {
    const gen = profileGenRef.current
    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id
    if (!userId) { setLoading(false); return }

    const profileRes = await supabase
      .from('profiles')
      .select('id, username, first_name, last_name, avatar_url, position, created_at, selected_border, selected_card_bg, bio')
      .eq('id', userId)
      .single()

    // A local save happened while this fetch was in-flight — discard stale result.
    if (profileGenRef.current !== gen) return

    if (!profileRes.error) {
      const row = profileRes.data as Partial<Profile>
      const positions = normalizeVolleyballPositions(row.position)
      const normalized: Profile = {
        id: row.id as string,
        username: row.username as string,
        first_name: row.first_name ?? null,
        last_name: row.last_name ?? null,
        avatar_url: row.avatar_url ?? null,
        position: positions,
        created_at: row.created_at as string,
        selected_border: (row as any).selected_border ?? null,
        selected_card_bg: (row as any).selected_card_bg ?? null,
        bio: (row as any).bio ?? null,
      }
      setProfile(normalized)
      setPositionDraft(positions)
      setBioDraft((row as any).bio ?? '')
      if (normalized.avatar_url) {
        if (normalized.avatar_url !== lastResolvedAvatarUrl.current) {
          setAvatarUriResolving(true)
          setAvatarUriError(null)
          const { uri, error } = await resolveProfileAvatarUriWithError(normalized.avatar_url)
          setAvatarDisplayUri(uri)
          setAvatarUriError(error)
          setAvatarUriResolving(false)
          lastResolvedAvatarUrl.current = normalized.avatar_url
        }
      } else {
        setAvatarDisplayUri(null)
        setAvatarUriError(null)
        lastResolvedAvatarUrl.current = null
      }
      void checkBadges(normalized)
    }
    setLoading(false)
  }

  function openEditProfile() {
    if (!profile) return
    setFirstNameDraft(profile.first_name ?? '')
    setLastNameDraft(profile.last_name ?? '')
    setPositionDraft([...profile.position])
    setBioDraft(profile.bio ?? '')
    setBorderDraft(profile.selected_border ?? null)
    setSection('edit')
  }

  async function saveBorder(border: ProfileBorderType | null) {
    if (borderSaving) return
    const previous = borderDraft
    setBorderDraft(border)
    setProfile(prev => prev ? { ...prev, selected_border: border } : prev)
    try {
      setBorderSaving(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user?.id) return
      const { error } = await supabase.from('profiles').update({ selected_border: border }).eq('id', session.user.id)
      if (error) {
        setBorderDraft(previous)
        setProfile(prev => prev ? { ...prev, selected_border: previous } : prev)
      }
    } finally {
      setBorderSaving(false)
    }
  }

  async function saveProfileEdits() {
    if (!profile) return
    try {
      setProfileSaving(true)
      profileGenRef.current += 1
      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user?.id
      if (!userId) throw new Error('Not logged in')
      const trimmedBio = bioDraft.trim()
      const trimmedFirst = firstNameDraft.trim()
      const trimmedLast = lastNameDraft.trim()
      const { error } = await supabase.from('profiles').update({
        position: positionDraft,
        bio: trimmedBio || null,
        first_name: trimmedFirst || null,
        last_name: trimmedLast || null,
      }).eq('id', userId)
      if (error) throw error
      const updated = {
        ...profile,
        position: [...positionDraft],
        bio: trimmedBio || null,
        first_name: trimmedFirst || null,
        last_name: trimmedLast || null,
      }
      setProfile(updated)
      void checkBadges(updated)
      Alert.alert('Saved', 'Your profile was updated.')
      setSection('menu')
    } catch (e: any) {
      Sentry.captureException(e)
      Alert.alert('Error', 'Could not save profile. Please try again.')
    } finally {
      setProfileSaving(false)
    }
  }

  async function pickAndUploadAvatar() {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Allow photo library access to upload a profile picture.')
        return
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true, aspect: [1, 1], quality: 0.6,
      })
      if (result.canceled) return
      const asset = result.assets[0]
      if (asset.fileSize != null && asset.fileSize > AVATAR_MAX_FILE_BYTES) {
        showToast('Photo must be smaller than 3 MB. Please try again.')
        return
      }
      setPendingAsset(asset)
    } catch (e: any) {
      Sentry.captureException(e)
      Alert.alert('Error', 'Could not select photo. Please try again.')
    }
  }

  async function uploadPendingAsset() {
    if (!pendingAsset) return
    const asset = pendingAsset
    setPendingAsset(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user?.id
      if (!userId) throw new Error('Not logged in')
      setAvatarUploading(true)
      const ext = asset.mimeType?.includes('png') ? 'png' : 'jpg'
      const path = `${userId}/avatar_${Date.now()}.${ext}`
      const contentType = asset.mimeType ?? (ext === 'png' ? 'image/png' : 'image/jpeg')
      const response = await fetch(asset.uri)
      const arrayBuffer = await response.arrayBuffer()
      if (arrayBuffer.byteLength > AVATAR_MAX_FILE_BYTES) {
        showToast('Photo must be smaller than 3 MB. Please try again.')
        return
      }
      if (profile?.avatar_url && !/^https?:\/\//i.test(profile.avatar_url)) {
        await supabase.storage.from(AVATARS_BUCKET).remove([profile.avatar_url])
      }
      const { error: uploadError } = await supabase.storage.from(AVATARS_BUCKET).upload(path, arrayBuffer, { contentType })
      if (uploadError) throw uploadError
      const { error: profileError } = await supabase.from('profiles').update({ avatar_url: path }).eq('id', userId)
      if (profileError) throw profileError
      const updatedProfile = profile ? { ...profile, avatar_url: path } : null
      setProfile(updatedProfile)
      lastResolvedAvatarUrl.current = null
      const { uri, error: resolveError } = await resolveProfileAvatarUriWithError(path)
      setAvatarDisplayUri(uri)
      setAvatarUriError(resolveError)
      if (!resolveError && updatedProfile) void checkBadges(updatedProfile)
    } catch (e: any) {
      Sentry.captureException(e)
      Alert.alert('Error', 'Could not upload photo. Please try again.')
    } finally {
      setAvatarUploading(false)
    }
  }

  async function deleteAvatar() {
    if (!profile?.avatar_url) return
    try {
      setAvatarUploading(true)
      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user?.id
      if (!userId) throw new Error('Not logged in')
      if (!/^https?:\/\//i.test(profile.avatar_url)) {
        await supabase.storage.from(AVATARS_BUCKET).remove([profile.avatar_url])
      }
      const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', userId)
      if (error) throw error
      setProfile(prev => prev ? { ...prev, avatar_url: null } : prev)
      setAvatarDisplayUri(null)
      setAvatarUriError(null)
      lastResolvedAvatarUrl.current = null
    } catch (e: any) {
      Sentry.captureException(e)
      Alert.alert('Error', 'Could not remove photo. Please try again.')
    } finally {
      setAvatarUploading(false)
    }
  }

  if (loading || !profile) return (
    <View style={[shared.screen, { alignItems: 'center', justifyContent: 'center' }]}>
      <ActivityIndicator color={theme.colors.primary} />
    </View>
  )

  const editDirty = !volleyballPositionsEqualUnordered(profile.position, positionDraft) || bioDraft !== (profile.bio ?? '')
  const displayedBadges = [1, 2, 3]
    .map(s => badges.find(b => b.display_order === s) ?? null)
    .filter(Boolean) as NonNullable<typeof badges[0]>[]

  return (
    <View style={[shared.screen, { position: 'relative' }]}>
      <ScrollView
        contentContainerStyle={[shared.scrollContent, { paddingBottom: tabBarHeight + 32 }]}
        onScroll={handleScroll}
        scrollEventThrottle={100}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          section !== 'edit'
            ? <RefreshControl refreshing={refreshing} onRefresh={handleProfileRefresh} tintColor={theme.colors.primary} />
            : undefined
        }
      >
        {section === 'edit' && (
          <View style={{ alignItems: 'flex-start', marginBottom: theme.spacing.sm }}>
            <Pressable onPress={() => setSection('menu')} hitSlop={10} accessibilityRole="button">
              <Ionicons name="close" size={22} color={theme.colors.subtext} />
            </Pressable>
          </View>
        )}

        {/* ── Profile hero ── */}
        <View style={profileStyles.heroCard}>
          {/* Avatar centered */}
          <View style={{ alignItems: 'center', gap: theme.spacing.xs }}>
            <ProfileAvatar
              uri={avatarUploading || avatarUriResolving ? null : avatarDisplayUri}
              loading={avatarUploading || avatarUriResolving}
              border={profile.selected_border}
              onPress={pickAndUploadAvatar}
              editMode={section === 'edit'}
              onDelete={deleteAvatar}
              hasAvatar={!!profile.avatar_url}
            />
            {section === 'edit' && (
              <Text style={[shared.caption, { textAlign: 'center' }]}>
                Tap to {profile.avatar_url ? 'change' : 'add'} a photo.
              </Text>
            )}
          </View>

          {/* Name + handle */}
          <Text style={profileStyles.heroName}>
            {profile.first_name && profile.last_name
              ? `${profile.first_name} ${profile.last_name}`
              : profile.username}
          </Text>
          {profile.first_name && profile.last_name && (
            <Text style={profileStyles.heroHandle}>@{profile.username}</Text>
          )}

          {/* Positions */}
          {positionLabels(profile.position) ? (
            <Text style={profileStyles.heroPosition}>{positionLabels(profile.position)}</Text>
          ) : null}

          {/* Bio */}
          {profile.bio ? (
            <Text style={profileStyles.heroBio}>{profile.bio}</Text>
          ) : null}

          {/* Joined */}
          <Text style={profileStyles.heroJoined}>
            Member since {new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </Text>

          {section === 'edit' && avatarUriError && profile.avatar_url ? (
            <Text style={[shared.errorText, shared.mt_xs, { textAlign: 'center' }]}>
              Could not load image. Fix Storage SELECT policy for the avatars bucket.
            </Text>
          ) : null}

          {/* Displayed badges row */}
          {displayedBadges.length > 0 && (
            <View style={profileStyles.badgeRow}>
              {displayedBadges.map(badge => {
                const def = BADGE_DEFINITIONS.find(d => d.type === badge.badge_type)
                if (!def) return null
                return <BadgeIcon key={badge.badge_type} def={def} tier={badge.display_tier ?? badge.tier} size="sm" />
              })}
            </View>
          )}

          {section === 'menu' && (
            <View style={{ alignSelf: 'stretch', marginTop: theme.spacing.md }}>
              <Button label="Edit profile" onPress={openEditProfile} variant="primary" />
            </View>
          )}
        </View>

        {/* ── Menu ── */}
        {section === 'menu' && (
          <View style={[shared.card, { gap: 0, marginTop: theme.spacing.md, padding: 0, overflow: 'hidden' }]}>
            {([
              { title: 'Account Settings', icon: 'settings-outline', route: '/settings/account' },
              { title: 'Notifications',    icon: 'notifications-outline', route: '/settings/notifications' },
              { title: 'History',          icon: 'time-outline', route: '/settings/history' },
              { title: 'Cheers',           icon: 'star-outline', route: '/settings/cheers' },
              { title: 'Badges',           icon: 'ribbon-outline', route: '/settings/badges' },
              { title: 'Submit Feedback',  icon: 'chatbubble-ellipses-outline', route: '/settings/feedback' },
            ] as const).map((item, idx, arr) => (
              <MenuRow
                key={item.route}
                title={item.title}
                icon={item.icon as any}
                onPress={() => router.push(item.route as any)}
                last={idx === arr.length - 1}
              />
            ))}
          </View>
        )}

        {/* ── Edit sections ── */}
        {section === 'edit' && (
          <>
            {/* Name */}
            <View style={[shared.card, { marginTop: theme.spacing.md }]}>
              <Text style={shared.subheading}>Name</Text>
              <View style={shared.mt_sm} />
              <Input
                label="First Name"
                value={firstNameDraft}
                onChangeText={setFirstNameDraft}
                placeholder="Jane"
                autoCorrect={false}
                autoCapitalize="words"
              />
              <Input
                label="Last Name"
                value={lastNameDraft}
                onChangeText={setLastNameDraft}
                placeholder="Smith"
                autoCorrect={false}
                autoCapitalize="words"
              />
            </View>

            {/* Bio */}
            <View style={[shared.card, { marginTop: theme.spacing.md }]}>
              <Text style={shared.subheading}>Bio</Text>
              <View style={shared.mt_sm} />
              <Input
                value={bioDraft}
                onChangeText={t => setBioDraft(t.slice(0, 140))}
                placeholder="Tell the club a little about yourself…"
                multiline
                numberOfLines={3}
                maxLength={140}
                autoCorrect={false}
                containerStyle={{ marginBottom: 0 }}
                inputStyle={{ padding: theme.spacing.md, paddingTop: theme.spacing.md }}
              />
              <Text style={[shared.caption, { textAlign: 'right', marginTop: theme.spacing.xs, color: bioDraft.length >= 130 ? theme.colors.error : theme.colors.subtext }]}>
                {bioDraft.length}/140
              </Text>
            </View>

            {/* Positions */}
            <View style={[shared.card, { marginTop: theme.spacing.md }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={shared.subheading}>Preferred Positions</Text>
                {positionDraft.length > 0 && (
                  <Pressable onPress={() => setPositionDraft([])} hitSlop={8}>
                    <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.primary, fontWeight: theme.font.weight.medium }}>Clear</Text>
                  </Pressable>
                )}
              </View>
              <Text style={[shared.caption, shared.mt_xs]}>Rank up to 3 positions. Tap to add in order, tap again to remove.</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
                {VOLLEYBALL_POSITION_OPTIONS.map(opt => {
                  const rankIdx = positionDraft.indexOf(opt.value)
                  const rank = rankIdx !== -1 ? rankIdx + 1 : undefined
                  const atMax = positionDraft.length >= 3
                  return (
                    <PositionOptionChip
                      key={opt.value}
                      label={opt.label}
                      rank={rank}
                      onPress={() => setPositionDraft(prev =>
                        prev.includes(opt.value)
                          ? prev.filter(p => p !== opt.value)
                          : atMax ? prev : [...prev, opt.value]
                      )}
                    />
                  )
                })}
              </View>
            </View>

            {/* Display Badges */}
            <View style={[shared.card, { marginTop: theme.spacing.md }]}>
              <Text style={shared.subheading}>Display Badges</Text>
              <Text style={[shared.caption, shared.mt_xs]}>Up to 3 badges shown on your profile. Tap a slot to pick.</Text>
              <View style={{ flexDirection: 'row', gap: theme.spacing.lg, marginTop: theme.spacing.md, justifyContent: 'center' }}>
                {[1, 2, 3].map(slot => {
                  const badge = badges.find(b => b.display_order === slot)
                  const def = badge ? BADGE_DEFINITIONS.find(d => d.type === badge.badge_type) : null
                  return (
                    <View key={slot} style={{ alignItems: 'center', gap: 4 }}>
                      <View style={{ position: 'relative' }}>
                        {def && badge ? (
                          <>
                            <BadgeIcon def={def} tier={badge.display_tier ?? badge.tier} size="sm" />
                            <Pressable
                              onPress={() => void setDisplaySlot(badge.badge_type, null)}
                              hitSlop={8}
                              style={{
                                position: 'absolute', top: -4, right: -4,
                                width: 18, height: 18, borderRadius: 9,
                                backgroundColor: theme.colors.subtext,
                                alignItems: 'center', justifyContent: 'center',
                                borderWidth: 1.5, borderColor: theme.colors.card,
                              }}
                            >
                              <Ionicons name="close" size={10} color="#fff" />
                            </Pressable>
                          </>
                        ) : (
                          <Pressable
                            onPress={() => openSheet(slot)}
                            style={({ pressed }) => ({
                              width: 58, height: 58, borderRadius: 29,
                              borderWidth: 2, borderColor: pressed ? theme.colors.primary : theme.colors.border,
                              borderStyle: 'dashed',
                              alignItems: 'center', justifyContent: 'center',
                              backgroundColor: pressed ? theme.colors.primary + '0A' : 'transparent',
                            })}
                          >
                            <Ionicons name="add" size={22} color={theme.colors.subtext} />
                          </Pressable>
                        )}
                      </View>
                      <Text style={[shared.caption, { color: theme.colors.subtext }]} numberOfLines={1}>
                        {def && badge
                          ? (def.tiers.length > 1
                              ? badgeTierLabel(def, badge.display_tier ?? badge.tier)
                              : badgeTitle(def.type))
                          : `Slot ${slot}`}
                      </Text>
                    </View>
                  )
                })}
              </View>
            </View>

            {/* Profile Border */}
            <View style={[shared.card, { marginTop: theme.spacing.md }]}>
              <Text style={shared.subheading}>Profile Border</Text>
              <Text style={[shared.caption, shared.mt_xs]}>Select a border for your avatar.</Text>
              <View style={{ flexDirection: 'row', gap: theme.spacing.lg, marginTop: theme.spacing.md, flexWrap: 'wrap' }}>
                <BorderSwatch
                  label="None"
                  selected={borderDraft === null}
                  unlocked
                  onPress={() => void saveBorder(null)}
                />
                {PROFILE_BORDERS.map(border => {
                  const unlocked = isBorderUnlocked(border, badges.map(b => ({ badge_type: b.badge_type, tier: b.tier })))
                  return (
                    <BorderSwatch
                      key={border.type}
                      label={border.label}
                      borderDef={border}
                      selected={borderDraft === border.type}
                      unlocked={unlocked}
                      onPress={() => { if (unlocked) void saveBorder(border.type) }}
                    />
                  )
                })}
              </View>
            </View>

            <View style={{ marginTop: theme.spacing.md }}>
              <Button label="Save profile" onPress={saveProfileEdits} loading={profileSaving} disabled={profileSaving} />
            </View>
          </>
        )}
      </ScrollView>
      <Toast
        message={toast?.message ?? ''}
        variant={toast?.variant ?? 'error'}
        visible={!!toast}
        onHide={() => setToast(null)}
      />

      {/* Avatar preview modal */}
      {pendingAsset && (
        <Modal transparent animationType="fade" onRequestClose={() => setPendingAsset(null)}>
          <View style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.75)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: theme.spacing.xl,
          }}>
            <View style={{
              backgroundColor: theme.colors.card,
              borderRadius: theme.radius.xl,
              padding: theme.spacing.xl,
              alignItems: 'center',
              gap: theme.spacing.lg,
              width: '100%',
              maxWidth: 320,
            }}>
              <Text style={{ fontSize: theme.font.size.lg, fontWeight: theme.font.weight.semibold, color: theme.colors.text }}>
                Preview
              </Text>
              <View style={{
                width: AVATAR_OUTER + 8, height: AVATAR_OUTER + 8,
                borderRadius: (AVATAR_OUTER + 8) / 2,
                overflow: 'hidden',
                backgroundColor: theme.colors.border,
              }}>
                <Image
                  source={{ uri: pendingAsset.uri }}
                  style={{ width: AVATAR_OUTER + 8, height: AVATAR_OUTER + 8 }}
                  resizeMode="cover"
                />
              </View>
              <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.subtext, textAlign: 'center' }}>
                This is how your profile picture will appear.
              </Text>
              <View style={{ flexDirection: 'row', gap: theme.spacing.md, width: '100%' }}>
                <Pressable
                  onPress={() => setPendingAsset(null)}
                  style={({ pressed }) => ({
                    flex: 1, paddingVertical: theme.spacing.sm + 2,
                    borderRadius: theme.radius.md,
                    borderWidth: 1, borderColor: theme.colors.border,
                    alignItems: 'center',
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text style={{ fontSize: theme.font.size.md, color: theme.colors.subtext, fontWeight: theme.font.weight.medium }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={uploadPendingAsset}
                  style={({ pressed }) => ({
                    flex: 1, paddingVertical: theme.spacing.sm + 2,
                    borderRadius: theme.radius.md,
                    backgroundColor: theme.colors.primary,
                    alignItems: 'center',
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <Text style={{ fontSize: theme.font.size.md, color: '#fff', fontWeight: theme.font.weight.semibold }}>Use Photo</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Badge picker bottom sheet */}
      {sheetMounted && (
        <>
          <Animated.View
            style={[{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.4)',
            }, backdropStyle]}
          >
            <Pressable style={{ flex: 1 }} onPress={closeSheet} />
          </Animated.View>

          <Animated.View style={[{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            backgroundColor: theme.colors.card,
            borderTopLeftRadius: theme.radius.xl,
            borderTopRightRadius: theme.radius.xl,
            paddingTop: theme.spacing.sm,
            paddingHorizontal: theme.spacing.md,
            maxHeight: '70%',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -3 },
            shadowOpacity: 0.12,
            shadowRadius: 12,
            elevation: 16,
            overflow: 'hidden',
          }, sheetTranslateStyle]}>
            {/* Fixed header */}
            <View style={{ alignItems: 'center', marginBottom: theme.spacing.md }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: theme.colors.border }} />
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.spacing.md }}>
              <Text style={shared.subheading}>Choose a badge for slot {pickingSlot}</Text>
              <Pressable onPress={closeSheet} hitSlop={10}>
                <Ionicons name="close-circle" size={24} color={theme.colors.subtext} />
              </Pressable>
            </View>

            {(() => {
              // Expand multi-tier badges into one item per earned tier so users
              // can pick which tier to display (e.g. show Bronze spike instead of Gold).
              const pickerItems: { badge: typeof badges[0]; def: typeof BADGE_DEFINITIONS[0]; displayTier: number }[] = []
              badges
                .filter(b => b.tier > 0 && b.display_order !== pickingSlot)
                .forEach(badge => {
                  const def = BADGE_DEFINITIONS.find(d => d.type === badge.badge_type)
                  if (!def) return
                  if (def.tiers.length > 1) {
                    // One item per earned tier
                    for (let t = 1; t <= badge.tier; t++) {
                      pickerItems.push({ badge, def, displayTier: t })
                    }
                  } else {
                    pickerItems.push({ badge, def, displayTier: 1 })
                  }
                })

              if (pickerItems.length === 0) return (
                <Text style={[shared.caption, { textAlign: 'center', paddingVertical: theme.spacing.xl, paddingBottom: insets.bottom + theme.spacing.xl }]}>
                  No earned badges available to add.
                </Text>
              )

              return (
                <ScrollView
                  onLayout={e => setBadgeGridWidth(e.nativeEvent.layout.width)}
                  style={{ flex: 1 }}
                  contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md, paddingBottom: insets.bottom + theme.spacing.md, justifyContent: 'center' }}
                >
                  {pickerItems.map(({ badge, def, displayTier }) => (
                    <Pressable
                      key={`${badge.badge_type}-${displayTier}`}
                      onPress={() => {
                        closeSheet()
                        void setDisplaySlot(badge.badge_type, pickingSlot!, displayTier)
                      }}
                      style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
                    >
                      <BadgeIcon def={def} tier={displayTier} size="sm" showLabel />
                    </Pressable>
                  ))}
                  {/* Spacers force last row to start from left while full rows stay centered */}
                  {badgeGridWidth > 0 && (() => {
                    const itemsPerRow = Math.floor((badgeGridWidth + theme.spacing.md) / (58 + theme.spacing.md))
                    return Array.from({ length: Math.max(0, itemsPerRow - 1) }).map((_, i) => (
                      <View key={`sp-${i}`} style={{ width: 58 }} />
                    ))
                  })()}
                </ScrollView>
              )
            })()}
          </Animated.View>
        </>
      )}
    </View>
  )
}

// ─── MenuRow ──────────────────────────────────────────────────────────────────

function MenuRow({ title, icon, onPress, last }: {
  title: string
  icon: ComponentProps<typeof Ionicons>['name']
  onPress: () => void
  last?: boolean
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [
        profileStyles.menuRow,
        !last && profileStyles.menuRowBorder,
        pressed && { backgroundColor: theme.colors.background },
      ]}
    >
      <View style={profileStyles.menuRowIcon}>
        <Ionicons name={icon} size={18} color={theme.colors.primary} />
      </View>
      <Text style={profileStyles.menuRowTitle}>{title}</Text>
      <Ionicons name="chevron-forward" size={16} color={theme.colors.subtext} />
    </Pressable>
  )
}

// ─── PositionOptionChip ───────────────────────────────────────────────────────

function PositionOptionChip({ label, rank, onPress }: { label: string; rank?: number; onPress: () => void }) {
  const active = rank !== undefined
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 5,
        borderRadius: theme.radius.full, borderWidth: 1,
        borderColor: active ? theme.colors.primary : theme.colors.border,
        backgroundColor: active ? theme.colors.primary + '14' : theme.colors.card,
        paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm,
        maxWidth: '100%',
      }}
    >
      {active && (
        <View style={{
          width: 16, height: 16, borderRadius: 8,
          backgroundColor: theme.colors.primary,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ fontSize: 9, fontWeight: theme.font.weight.bold, color: '#fff', lineHeight: 12 }}>
            {rank}
          </Text>
        </View>
      )}
      <Text style={{
        fontSize: theme.font.size.sm, lineHeight: theme.font.lineHeight.tight,
        fontWeight: active ? theme.font.weight.semibold : theme.font.weight.regular,
        color: active ? theme.colors.primary : theme.colors.text,
      }}>
        {label}
      </Text>
    </Pressable>
  )
}

// ─── BorderSwatch ─────────────────────────────────────────────────────────────

function BorderSwatch({ label, borderDef, selected, unlocked, onPress }: {
  label: string
  borderDef?: ProfileBorderDef
  selected: boolean
  unlocked: boolean
  onPress: () => void
}) {
  const SIZE = 52
  const RING = 3

  function renderRing() {
    if (!borderDef) {
      return (
        <View style={{
          width: SIZE, height: SIZE, borderRadius: SIZE / 2,
          borderWidth: 2, borderColor: theme.colors.border,
          backgroundColor: theme.colors.background,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Ionicons name="close" size={18} color={theme.colors.subtext} />
        </View>
      )
    }
    const outerSize = SIZE + RING * 2
    const colors: [string, string, ...string[]] = borderDef.gradientColors
      ? borderDef.gradientColors as [string, string, ...string[]]
      : borderDef.type === 'gold'
        ? ['#FFE066', borderDef.color, '#CC8800']
        : [borderDef.color, borderDef.color]

    return (
      <View style={{ width: outerSize, height: outerSize, borderRadius: outerSize / 2, overflow: 'hidden', opacity: unlocked ? 1 : 0.3 }}>
        <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', inset: 0 }} />
        <View style={{
          position: 'absolute', top: RING, left: RING, right: RING, bottom: RING,
          borderRadius: SIZE / 2, backgroundColor: theme.colors.card,
          alignItems: 'center', justifyContent: 'center',
        }}>
          {!unlocked && <Ionicons name="lock-closed" size={14} color={theme.colors.subtext} />}
        </View>
      </View>
    )
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={!unlocked}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: !unlocked }}
      style={({ pressed }) => ({ alignItems: 'center', gap: theme.spacing.xs, opacity: pressed && unlocked ? 0.7 : 1 })}
    >
      <View style={{ position: 'relative' }}>
        {renderRing()}
        {selected && unlocked && (
          <View style={{
            position: 'absolute', bottom: -2, right: -2,
            width: 18, height: 18, borderRadius: 9,
            backgroundColor: theme.colors.primary,
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 2, borderColor: theme.colors.card,
          }}>
            <Ionicons name="checkmark" size={10} color="#fff" />
          </View>
        )}
      </View>
      <Text style={{
        fontSize: theme.font.size.xs,
        fontWeight: selected ? theme.font.weight.semibold : theme.font.weight.regular,
        color: unlocked ? theme.colors.text : theme.colors.subtext,
        opacity: unlocked ? 1 : 0.5,
      }}>
        {label}
      </Text>
    </Pressable>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const profileStyles = StyleSheet.create({
  heroCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    alignItems: 'center',
    gap: theme.spacing.xs,
    ...theme.shadow.sm,
  },
  heroName: {
    fontSize: 20,
    fontWeight: theme.font.weight.bold,
    color: theme.colors.text,
    marginTop: theme.spacing.xs,
    textAlign: 'center',
  },
  heroHandle: {
    fontSize: theme.font.size.sm,
    color: theme.colors.subtext,
    textAlign: 'center',
  },
  heroPosition: {
    fontSize: theme.font.size.sm,
    fontWeight: theme.font.weight.medium,
    color: theme.colors.primary,
    textAlign: 'center',
    marginTop: 2,
  },
  heroBio: {
    fontSize: theme.font.size.md,
    color: theme.colors.text,
    textAlign: 'center',
    lineHeight: theme.font.lineHeight.normal,
    marginTop: theme.spacing.xs,
  },
  heroJoined: {
    fontSize: theme.font.size.xs,
    color: theme.colors.subtext,
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.md,
    backgroundColor: theme.colors.card,
  },
  menuRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  menuRowIcon: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.primary + '14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuRowTitle: {
    flex: 1,
    fontSize: theme.font.size.md,
    fontWeight: theme.font.weight.medium,
    color: theme.colors.text,
  },
})
