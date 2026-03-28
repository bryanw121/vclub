import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { ComponentProps } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../../../lib/supabase'
import { Button } from '../../../../components/Button'
import { EventCard } from '../../../../components/EventCard'
import { Input } from '../../../../components/Input'
import { shared, theme, AVATARS_BUCKET, AVATAR_MAX_FILE_BYTES } from '../../../../constants'
import {
  normalizeVolleyballPositions,
  resolveProfileAvatarUriWithError,
  volleyballPositionsEqualUnordered,
} from '../../../../utils'
import type { EventWithDetails, FeedbackKind, FeedbackPriority, Profile, VolleyballPosition } from '../../../../types'
import { useTabsContext } from '../../../../contexts/tabs'

type Section = 'menu' | 'account' | 'edit' | 'feedback' | 'history' | 'kudos' | 'hosted'

const VOLLEYBALL_POSITION_OPTIONS: { value: VolleyballPosition; label: string }[] = [
  { value: 'setter', label: 'Setter' },
  { value: 'libero', label: 'Libero' },
  { value: 'outside_hitter', label: 'Outside Hitter (OH)' },
  { value: 'defensive_specialist', label: 'Defensive Specialist (DS)' },
  { value: 'opposite_hitter', label: 'Opposite Hitter (OPP)' },
]

const AVATAR_SIZE = 120

function positionLabels(positions: VolleyballPosition[]): string {
  if (positions.length === 0) return 'No positions set'
  const labels = positions.map(
    p => VOLLEYBALL_POSITION_OPTIONS.find(o => o.value === p)?.label ?? p,
  )
  return labels.join(' · ')
}

type HistoryFilter = 'hosted' | 'attended'
const HISTORY_LIMIT = 5

export default function MyProfile() {
  const { setTabBarHidden } = useTabsContext()
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
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('hosted')
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [pastHostedEvents, setPastHostedEvents] = useState<EventWithDetails[]>([])
  const [upcomingHostedEvents, setUpcomingHostedEvents] = useState<EventWithDetails[]>([])

  const [kind, setKind] = useState<FeedbackKind>('feature')
  const [priority, setPriority] = useState<FeedbackPriority>('medium')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)
  const [feedbackError, setFeedbackError] = useState<string | null>(null)

  // Account settings — name editing
  const [editFirstName, setEditFirstName] = useState('')
  const [editLastName, setEditLastName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [nameSaved, setNameSaved] = useState(false)

  const [positionDraft, setPositionDraft] = useState<VolleyballPosition[]>([])
  const [profileSaving, setProfileSaving] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarDisplayUri, setAvatarDisplayUri] = useState<string | null>(null)
  const [avatarUriResolving, setAvatarUriResolving] = useState(false)
  const [avatarUriError, setAvatarUriError] = useState<string | null>(null)

  useEffect(() => {
    fetchProfile()
  }, [])

  async function fetchProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const now = new Date().toISOString()
    const [profileRes, hostedHistoryRes, upcomingHostedRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single(),
      supabase
        .from('events')
        .select(`*, profiles!events_created_by_fkey (id, username, avatar_url), event_attendees (event_id, user_id, joined_at)`)
        .eq('created_by', user.id)
        .lt('event_date', now)
        .order('event_date', { ascending: false })
        .limit(HISTORY_LIMIT + 1),
      supabase
        .from('events')
        .select(`*, profiles!events_created_by_fkey (id, username, avatar_url), event_attendees (event_id, user_id, joined_at)`)
        .eq('created_by', user.id)
        .gte('event_date', now)
        .order('event_date', { ascending: true }),
    ])

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
        setAvatarUriResolving(true)
        setAvatarUriError(null)
        const { uri, error } = await resolveProfileAvatarUriWithError(normalized.avatar_url)
        setAvatarDisplayUri(uri)
        setAvatarUriError(error)
        setAvatarUriResolving(false)
      } else {
        setAvatarDisplayUri(null)
        setAvatarUriError(null)
      }
    }
    if (hostedHistoryRes.error) {
      setHistoryError(hostedHistoryRes.error.message)
    } else {
      setPastHostedEvents((hostedHistoryRes.data ?? []) as EventWithDetails[])
    }
    if (!upcomingHostedRes.error) {
      setUpcomingHostedEvents((upcomingHostedRes.data ?? []) as EventWithDetails[])
    }
    setHistoryLoading(false)
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
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in')

      const { error } = await supabase
        .from('profiles')
        .update({ position: positionDraft })
        .eq('id', user.id)
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

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in')

      setAvatarUploading(true)
      const ext = asset.mimeType?.includes('png') ? 'png' : 'jpg'
      const path = `${user.id}/avatar.${ext}`
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
        .eq('id', user.id)
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

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut()
    if (error) Alert.alert('Error', error.message)
  }

  async function handleSaveName() {
    const first = editFirstName.trim()
    const last  = editLastName.trim()
    if (!first || !last) { setNameError('Both fields are required'); return }
    setNameError(null)
    setSavingName(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in')
      const { error } = await supabase.from('profiles')
        .update({ first_name: first, last_name: last })
        .eq('id', user.id)
      if (error) throw error
      setProfile(p => p ? { ...p, first_name: first, last_name: last } : p)
      setNameSaved(true)
    } catch (e: any) {
      setNameError(e.message)
    } finally {
      setSavingName(false)
    }
  }

  async function submitFeedback() {
    try {
      if (!title.trim()) return Alert.alert('Missing info', 'Please add a short title.')
      if (!description.trim()) return Alert.alert('Missing info', 'Please add a description.')

      setFeedbackLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in')

      const { error } = await supabase.from('feedback_submissions').insert({
        user_id: user.id,
        kind,
        priority,
        title: title.trim(),
        description: description.trim(),
      })
      if (error) throw error

      setKind('feature')
      setPriority('medium')
      setTitle('')
      setDescription('')
      setFeedbackError(null)
      setFeedbackSubmitted(true)
    } catch (e: any) {
      setFeedbackError(e.message)
    } finally {
      setFeedbackLoading(false)
    }
  }

  const activeCardStyle = (active: boolean) => (active
    ? { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + '10', borderWidth: 2 }
    : null)

  if (loading || !profile) return null

  const hostedVisible = pastHostedEvents.slice(0, HISTORY_LIMIT)
  const hostedOverflowCount = Math.max(0, pastHostedEvents.length - HISTORY_LIMIT)
  const editDirty = !volleyballPositionsEqualUnordered(profile.position, positionDraft)

  return (
    <View style={shared.screen}>
      <Modal visible={feedbackSubmitted} transparent animationType="none" onRequestClose={() => setFeedbackSubmitted(false)}>
        <TouchableOpacity style={shared.modalOverlay} onPress={() => setFeedbackSubmitted(false)}>
          <View style={shared.modalCard}>
            <Text style={shared.modalEmoji}>🏐</Text>
            <Text style={shared.modalTitle}>Thanks for making vclub better!</Text>
            <Text style={shared.modalBody}>Your feedback has been saved and the team will review it.</Text>
            <TouchableOpacity style={shared.modalButton} onPress={() => setFeedbackSubmitted(false)}>
              <Text style={shared.modalButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <ScrollView
        contentContainerStyle={shared.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={100}
      >
        {section !== 'menu' && (
          <View style={{ alignItems: 'flex-end', marginBottom: theme.spacing.sm }}>
            <Pressable
              onPress={() => {
                setSection('menu')
                setNameSaved(false)
                setNameError(null)
              }}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Back to profile menu"
            >
              <Ionicons name="close" size={22} color={theme.colors.subtext} />
            </Pressable>
          </View>
        )}

        <View style={[shared.card, { alignItems: 'center' }]}>
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
              <Ionicons name="person" size={48} color={theme.colors.subtext} />
            )}
          </Pressable>
          <Text style={[shared.caption, shared.mt_sm, { textAlign: 'center' }]}>
            Max 3 MB per photo (private storage).{' '}
            {profile.avatar_url ? 'Tap photo to change.' : 'Tap to add a profile photo.'}
          </Text>
          {avatarUriError && profile.avatar_url ? (
            <Text style={[shared.errorText, shared.mt_xs, { textAlign: 'center' }]}>
              Could not load image (signed URL failed). Fix Storage SELECT policy for the avatars bucket, or see the alert after upload.
            </Text>
          ) : null}

          <Text style={[shared.heading, shared.mt_md, { textAlign: 'center' }]}>
            {profile.first_name && profile.last_name
              ? `${profile.first_name} ${profile.last_name}`
              : profile.username}
          </Text>
          {profile.first_name && profile.last_name ? (
            <Text
              style={[shared.caption, shared.mt_xs, { textAlign: 'center', color: theme.colors.subtext }]}
            >
              @{profile.username}
            </Text>
          ) : null}
          <Text style={[shared.body, shared.mt_sm, { textAlign: 'center' }]}>
            {positionLabels(profile.position)}
          </Text>
          <Text style={[shared.caption, shared.mt_xs]}>
            joined {new Date(profile.created_at).toLocaleDateString()}
          </Text>

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
                active={section === 'account'}
                onPress={() => {
                  setSection('account')
                  setEditFirstName(profile?.first_name ?? '')
                  setEditLastName(profile?.last_name ?? '')
                  setNameSaved(false)
                  setNameError(null)
                }}
                style={activeCardStyle(section === 'account')}
              />
              <MenuCard
                title="Submit Feedback"
                icon="chatbubble-ellipses-outline"
                active={section === 'feedback'}
                onPress={() => setSection('feedback')}
                style={activeCardStyle(section === 'feedback')}
              />
            </View>
            <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
              <MenuCard
                title="History"
                icon="time-outline"
                active={section === 'history'}
                onPress={() => setSection('history')}
                style={activeCardStyle(section === 'history')}
              />
              <MenuCard
                title="Kudos"
                icon="star-outline"
                active={section === 'kudos'}
                onPress={() => setSection('kudos')}
                style={activeCardStyle(section === 'kudos')}
              />
            </View>
            <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
              <MenuCard
                title="Hosted Events"
                icon="calendar-outline"
                active={section === 'hosted'}
                onPress={() => setSection('hosted')}
                style={[activeCardStyle(section === 'hosted'), { flex: 1 }]}
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

        {section === 'account' && (
          <View style={[shared.card, { marginTop: theme.spacing.md }]}>
            <Text style={shared.subheading}>Account settings</Text>
            <View style={shared.mt_md} />

            <Input
              label="First Name"
              value={editFirstName}
              onChangeText={v => { setEditFirstName(v); setNameSaved(false) }}
              placeholder="Jane"
              autoCorrect={false}
            />
            <Input
              label="Last Name"
              value={editLastName}
              onChangeText={v => { setEditLastName(v); setNameSaved(false) }}
              placeholder="Smith"
              autoCorrect={false}
            />

            {nameError && <Text style={[shared.errorText, shared.mt_sm]}>{nameError}</Text>}
            {nameSaved && <Text style={[shared.caption, shared.mt_sm, { color: theme.colors.success }]}>Saved!</Text>}

            <View style={shared.mt_sm} />
            <Button label="Save name" onPress={handleSaveName} loading={savingName} />

            <View style={[shared.divider, shared.mt_md]} />
            <Button label="Sign out" onPress={handleSignOut} variant="danger" />
          </View>
        )}

        {section === 'feedback' && (
          <View style={[shared.card, { marginTop: theme.spacing.md }]}>
            <Text style={shared.subheading}>Submit feedback</Text>
            <View style={shared.mt_md} />

            <Text style={shared.label}>Type</Text>
            <ChoiceRow<FeedbackKind>
              value={kind}
              onChange={setKind}
              options={[
                { value: 'feature', label: 'Feature' },
                { value: 'bug', label: 'Bug' },
              ]}
            />

            <View style={shared.mt_md} />

            <Text style={shared.label}>Priority</Text>
            <ChoiceRow<FeedbackPriority>
              value={priority}
              onChange={setPriority}
              options={[
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
              ]}
            />

            <View style={shared.mt_md} />

            <Input
              label="Title"
              value={title}
              onChangeText={setTitle}
              placeholder="Short summary"
            />

            <Input
              label="Description"
              value={description}
              onChangeText={setDescription}
              placeholder="What should happen? What happened? Steps to reproduce?"
              multiline
              numberOfLines={6}
            />

            <View style={shared.mt_md} />

            <Button
              label="Submit"
              onPress={submitFeedback}
              loading={feedbackLoading}
              disabled={feedbackLoading}
            />

            {feedbackError && (
              <Text style={[shared.mt_sm, shared.errorText]}>{feedbackError}</Text>
            )}

            <View style={shared.mt_sm} />
            <Text style={shared.caption}>
              Your submission is saved to the club database so the team can triage it.
            </Text>
          </View>
        )}

        {section === 'history' && (
          <View style={[shared.card, { marginTop: theme.spacing.md }]}>
            <Text style={shared.subheading}>History</Text>
            <View style={shared.mt_md} />

            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <HistoryChip
                label="Hosted"
                active={historyFilter === 'hosted'}
                onPress={() => setHistoryFilter('hosted')}
              />
              <HistoryChip
                label="Attended"
                active={historyFilter === 'attended'}
                onPress={() => setHistoryFilter('attended')}
              />
            </View>

            <View style={shared.mt_md} />

            {historyFilter === 'hosted' ? (
              historyLoading ? (
                <ActivityIndicator />
              ) : historyError ? (
                <Text style={shared.errorText}>{historyError}</Text>
              ) : hostedVisible.length === 0 ? (
                <Text style={shared.caption}>No past hosted events found.</Text>
              ) : (
                <>
                  {hostedVisible.map(event => <EventCard key={event.id} event={event} />)}
                  {hostedOverflowCount > 0 && (
                    <Text style={shared.caption}>and {hostedOverflowCount} other events</Text>
                  )}
                </>
              )
            ) : (
              <Text style={shared.caption}>Attended history coming soon.</Text>
            )}
          </View>
        )}

        {section === 'kudos' && (
          <View style={[shared.card, { marginTop: theme.spacing.md }]}>
            <Text style={shared.caption}>coming soon</Text>
          </View>
        )}

        {section === 'hosted' && (
          <View style={[shared.card, { marginTop: theme.spacing.md }]}>
            <Text style={shared.subheading}>Hosted Events</Text>
            <View style={shared.mt_md} />
            {upcomingHostedEvents.length === 0 ? (
              <Text style={shared.caption}>No upcoming hosted events.</Text>
            ) : (
              upcomingHostedEvents.map(event => <EventCard key={event.id} event={event} />)
            )}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

function MenuCard({
  title,
  icon,
  active,
  onPress,
  style,
}: {
  title: string
  icon: ComponentProps<typeof Ionicons>['name']
  active: boolean
  onPress: () => void
  style?: any
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        shared.card,
        { flex: 1, margin: 0, alignItems: 'flex-start' },
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Ionicons name={icon} size={20} color={active ? theme.colors.primary : theme.colors.subtext} />
        <Text style={[shared.subheading, { marginTop: 0 }]}>{title}</Text>
      </View>
    </Pressable>
  )
}

function ChoiceRow<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {options.map(opt => {
        const active = opt.value === value
        return (
          <Button
            key={opt.value}
            label={opt.label}
            onPress={() => onChange(opt.value)}
            variant={active ? 'primary' : 'secondary'}
          />
        )
      })}
    </View>
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

function HistoryChip({
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
      accessibilityLabel={`Show ${label.toLowerCase()} history`}
      style={{
        borderRadius: theme.radius.full,
        borderWidth: 1,
        borderColor: active ? theme.colors.primary : theme.colors.border,
        backgroundColor: active ? theme.colors.primary + '14' : theme.colors.card,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
      }}
    >
      <Text
        style={{
          fontSize: theme.font.size.md,
          lineHeight: theme.font.lineHeight.normal,
          fontWeight: active ? theme.font.weight.semibold : theme.font.weight.regular,
          color: active ? theme.colors.primary : theme.colors.text,
        }}
      >
        {label}
      </Text>
    </Pressable>
  )
}
