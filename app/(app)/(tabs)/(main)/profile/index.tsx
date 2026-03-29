import React, { useCallback, useRef, useState } from 'react'
import type { ComponentProps } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect, useRouter } from 'expo-router'
import { supabase } from '../../../../../lib/supabase'
import { Button } from '../../../../../components/Button'
import { Input } from '../../../../../components/Input'
import { shared, theme, AVATARS_BUCKET, AVATAR_MAX_FILE_BYTES } from '../../../../../constants'
import {
  normalizeVolleyballPositions,
  resolveProfileAvatarUriWithError,
  volleyballPositionsEqualUnordered,
} from '../../../../../utils'
import type { Profile, VolleyballPosition } from '../../../../../types'
import { useTabsContext } from '../../../../../contexts/tabs'

type Section = 'menu' | 'edit'

const VOLLEYBALL_POSITION_OPTIONS: { value: VolleyballPosition; label: string }[] = [
  { value: 'setter', label: 'Setter' },
  { value: 'libero', label: 'Libero' },
  { value: 'outside_hitter', label: 'Outside Hitter (OH)' },
  { value: 'defensive_specialist', label: 'Defensive Specialist (DS)' },
  { value: 'opposite_hitter', label: 'Opposite Hitter (OPP)' },
]

const AVATAR_SIZE = 88

function positionLabels(positions: VolleyballPosition[]): string {
  if (positions.length === 0) return 'No positions set'
  const labels = positions.map(
    p => VOLLEYBALL_POSITION_OPTIONS.find(o => o.value === p)?.label ?? p,
  )
  return labels.join(' · ')
}

export default function MyProfile() {
  const router = useRouter()
  const { setTabBarHidden, tabBarHeight } = useTabsContext()
  const lastScrollY = useRef(0)
  const handleScroll = useCallback((e: any) => {
    if (Platform.OS !== 'web') return
    const y: number = e.nativeEvent.contentOffset.y
    const diff = y - lastScrollY.current
    lastScrollY.current = y
    if (y <= 60) { setTabBarHidden(false); return }
    if (Math.abs(diff) > 5) setTabBarHidden(diff > 0)
  }, [setTabBarHidden])

  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [section, setSection] = useState<Section>('menu')

  const [positionDraft, setPositionDraft] = useState<VolleyballPosition[]>([])
  const [profileSaving, setProfileSaving] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarDisplayUri, setAvatarDisplayUri] = useState<string | null>(null)
  const [avatarUriResolving, setAvatarUriResolving] = useState(false)
  const [avatarUriError, setAvatarUriError] = useState<string | null>(null)
  const lastResolvedAvatarUrl = useRef<string | null>(null)

  useFocusEffect(
    useCallback(() => {
      void fetchProfile()
    }, []),
  )

  async function fetchProfile() {
    // Local session only — avoids a second round-trip to Auth (getUser hits the server).
    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id
    if (!userId) {
      setLoading(false)
      return
    }

    const profileRes = await supabase
      .from('profiles')
      .select('id, username, first_name, last_name, avatar_url, position, created_at')
      .eq('id', userId)
      .single()

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
      }
      setProfile(normalized)
      setPositionDraft(positions)
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
        // else: same path as last time — keep existing avatarDisplayUri, skip the network call
      } else {
        setAvatarDisplayUri(null)
        setAvatarUriError(null)
        lastResolvedAvatarUrl.current = null
      }
    }
    setLoading(false)
  }

  function openEditProfile() {
    if (!profile) return
    setPositionDraft([...profile.position])
    setSection('edit')
  }

  async function saveProfileEdits() {
    if (!profile) return
    try {
      setProfileSaving(true)
      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user?.id
      if (!userId) throw new Error('Not logged in')

      const { error } = await supabase
        .from('profiles')
        .update({ position: positionDraft })
        .eq('id', userId)
      if (error) throw error

      setProfile(prev =>
        prev
          ? { ...prev, position: [...positionDraft] }
          : prev,
      )
      Alert.alert('Saved', 'Your profile was updated.')
      setSection('menu')
    } catch (e: any) {
      Alert.alert('Error', e.message)
    } finally {
      setProfileSaving(false)
    }
  }

  async function pickAndUploadAvatar() {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!perm.granted) {
        Alert.alert(
          'Permission needed',
          'Allow photo library access to upload a profile picture.',
        )
        return
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      })
      if (result.canceled) return

      const asset = result.assets[0]
      if (asset.fileSize != null && asset.fileSize > AVATAR_MAX_FILE_BYTES) {
        Alert.alert(
          'File too large',
          'Profile photos must be 3 MB or smaller. Try another image or crop more.',
        )
        return
      }

      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user?.id
      if (!userId) throw new Error('Not logged in')

      setAvatarUploading(true)
      const ext = asset.mimeType?.includes('png') ? 'png' : 'jpg'
      const path = `${userId}/avatar.${ext}`
      const contentType = asset.mimeType ?? (ext === 'png' ? 'image/png' : 'image/jpeg')

      const response = await fetch(asset.uri)
      const arrayBuffer = await response.arrayBuffer()
      if (arrayBuffer.byteLength > AVATAR_MAX_FILE_BYTES) {
        Alert.alert(
          'File too large',
          'Profile photos must be 3 MB or smaller. Try another image or crop more.',
        )
        return
      }

      const { error: uploadError } = await supabase.storage
        .from(AVATARS_BUCKET)
        .upload(path, arrayBuffer, { contentType, upsert: true })
      if (uploadError) throw uploadError

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ avatar_url: path })
        .eq('id', userId)
      if (profileError) throw profileError

      setProfile(prev => (prev ? { ...prev, avatar_url: path } : prev))
      const { uri: signed, error: signError } = await resolveProfileAvatarUriWithError(path)
      setAvatarDisplayUri(signed)
      setAvatarUriError(signError)
      if (signError) {
        Alert.alert(
          'Photo uploaded',
          'The file is in Storage and your profile was updated, but the app could not create a signed URL to show it. In Supabase → Storage → Policies, add SELECT for authenticated users on objects in the avatars bucket (same path rule as upload).',
        )
      } else {
        Alert.alert('Saved', 'Profile picture updated.')
      }
    } catch (e: any) {
      Alert.alert('Error', e.message)
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
      Alert.alert('Error', e.message)
    } finally {
      setAvatarUploading(false)
    }
  }

  if (loading || !profile) return (
    <View style={[shared.screen, { alignItems: 'center', justifyContent: 'center' }]}>
      <ActivityIndicator color={theme.colors.primary} />
    </View>
  )

  const editDirty = !volleyballPositionsEqualUnordered(profile.position, positionDraft)

  return (
    <View style={shared.screen}>
      <ScrollView
        contentContainerStyle={[
          shared.scrollContent,
          { paddingBottom: tabBarHeight + 32 },
        ]}
        onScroll={handleScroll}
        scrollEventThrottle={100}
      >
        {section === 'edit' && (
          <View style={{ alignItems: 'flex-end', marginBottom: theme.spacing.sm }}>
            <Pressable
              onPress={() => setSection('menu')}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Back to profile menu"
            >
              <Ionicons name="close" size={22} color={theme.colors.subtext} />
            </Pressable>
          </View>
        )}

        <View style={shared.card}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md }}>
            <View style={{ position: 'relative', width: AVATAR_SIZE, height: AVATAR_SIZE, flexShrink: 0 }}>
              <Pressable
                onPress={pickAndUploadAvatar}
                disabled={avatarUploading}
                accessibilityRole="button"
                accessibilityLabel="Change profile picture"
                style={{
                  width: AVATAR_SIZE,
                  height: AVATAR_SIZE,
                  borderRadius: AVATAR_SIZE / 2,
                  overflow: 'hidden',
                  backgroundColor: theme.colors.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 2,
                  borderColor: theme.colors.border,
                }}
              >
                {avatarUploading || avatarUriResolving ? (
                  <ActivityIndicator color={theme.colors.primary} />
                ) : avatarDisplayUri ? (
                  <Image
                    source={{ uri: avatarDisplayUri }}
                    style={{ width: '100%', height: '100%' }}
                    accessibilityIgnoresInvertColors
                  />
                ) : (
                  <Ionicons name="person" size={40} color={theme.colors.subtext} />
                )}
              </Pressable>
              {section === 'edit' && profile.avatar_url && !avatarUploading && (
                <Pressable
                  onPress={deleteAvatar}
                  accessibilityRole="button"
                  accessibilityLabel="Remove profile picture"
                  style={{
                    position: 'absolute',
                    top: -2,
                    right: -2,
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: theme.colors.subtext,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 2,
                    borderColor: theme.colors.card,
                  }}
                >
                  <Ionicons name="close" size={12} color={theme.colors.white} />
                </Pressable>
              )}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={shared.heading}>
                {profile.first_name && profile.last_name
                  ? `${profile.first_name} ${profile.last_name}`
                  : profile.username}
              </Text>
              {profile.first_name && profile.last_name ? (
                <Text style={[shared.caption, shared.mt_xs, { color: theme.colors.subtext }]}>
                  @{profile.username}
                </Text>
              ) : null}
              <Text style={[shared.body, shared.mt_sm]}>
                {positionLabels(profile.position)}
              </Text>
              <Text style={[shared.caption, shared.mt_xs]}>
                joined {new Date(profile.created_at).toLocaleDateString()}
              </Text>
            </View>
          </View>
          <Text style={[shared.caption, shared.mt_sm]}>
            Max 3 MB per photo (private storage).{' '}
            {profile.avatar_url ? 'Tap photo to change.' : 'Tap to add a profile photo.'}
          </Text>
          {avatarUriError && profile.avatar_url ? (
            <Text style={[shared.errorText, shared.mt_xs]}>
              Could not load image (signed URL failed). Fix Storage SELECT policy for the avatars bucket, or see the alert after upload.
            </Text>
          ) : null}

          <View style={{ alignSelf: 'stretch', marginTop: theme.spacing.md }}>
            <Button label="Edit profile" onPress={openEditProfile} variant="primary" />
          </View>
        </View>

        {section === 'menu' && (
          <View style={{ gap: theme.spacing.md, marginTop: theme.spacing.md }}>
            <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
              <MenuCard
                title="Account Settings"
                icon="settings-outline"
                onPress={() => router.push('/settings/account')}
              />
              <MenuCard
                title="Submit Feedback"
                icon="chatbubble-ellipses-outline"
                onPress={() => router.push('/settings/feedback')}
              />
            </View>
            <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
              <MenuCard
                title="History"
                icon="time-outline"
                onPress={() => router.push('/settings/history')}
              />
              <MenuCard
                title="Kudos"
                icon="star-outline"
                onPress={() => router.push('/settings/kudos')}
              />
            </View>
            <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
              <MenuCard
                title="Hosted Events"
                icon="calendar-outline"
                onPress={() => router.push('/settings/hosted')}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        )}

        {section === 'edit' && (
          <View style={[shared.card, { marginTop: theme.spacing.md }]}>
            <Text style={shared.subheading}>Edit profile</Text>
            <View style={shared.mt_md} />

            <Text style={shared.label}>Preferred positions</Text>
            <Text style={[shared.caption, shared.mt_xs]}>
              Tap any that apply. You can choose more than one.
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
              <PositionOptionChip
                label="Clear all"
                active={positionDraft.length === 0}
                onPress={() => setPositionDraft([])}
              />
              {VOLLEYBALL_POSITION_OPTIONS.map(opt => (
                <PositionOptionChip
                  key={opt.value}
                  label={opt.label}
                  active={positionDraft.includes(opt.value)}
                  onPress={() => {
                    setPositionDraft(prev =>
                      prev.includes(opt.value)
                        ? prev.filter(p => p !== opt.value)
                        : [...prev, opt.value],
                    )
                  }}
                />
              ))}
            </View>

            <View style={shared.mt_md} />
            <Button
              label="Save profile"
              onPress={saveProfileEdits}
              loading={profileSaving}
              disabled={profileSaving || !editDirty}
            />
          </View>
        )}
      </ScrollView>
    </View>
  )
}

function MenuCard({
  title,
  icon,
  onPress,
  style,
}: {
  title: string
  icon: ComponentProps<typeof Ionicons>['name']
  onPress: () => void
  style?: object
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        shared.card,
        {
          flex: 1,
          margin: 0,
          alignItems: 'flex-start',
          opacity: pressed ? 0.88 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Ionicons name={icon} size={20} color={theme.colors.subtext} />
        <Text style={[shared.subheading, { marginTop: 0 }]}>{title}</Text>
      </View>
    </Pressable>
  )
}

function PositionOptionChip({
  label,
  active,
  onPress,
}: {
  label: string
  active: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={{
        borderRadius: theme.radius.full,
        borderWidth: 1,
        borderColor: active ? theme.colors.primary : theme.colors.border,
        backgroundColor: active ? theme.colors.primary + '14' : theme.colors.card,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
        maxWidth: '100%',
      }}
    >
      <Text
        style={{
          fontSize: theme.font.size.sm,
          lineHeight: theme.font.lineHeight.tight,
          fontWeight: active ? theme.font.weight.semibold : theme.font.weight.regular,
          color: active ? theme.colors.primary : theme.colors.text,
        }}
      >
        {label}
      </Text>
    </Pressable>
  )
}
