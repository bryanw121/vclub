import React, { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  Alert,
  Modal,
  Pressable,
  Platform,
  TextInput,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../../../lib/supabase'
import { shared, theme, CLUB_AVATARS_BUCKET, EVENT_CARD_LIST_SELECT } from '../../../constants'
import { EventCard } from '../../../components/EventCard'
import type { ClubWithDetails, EventWithDetails } from '../../../types'

async function resolveClubAvatarUri(avatarUrl: string | null): Promise<string | null> {
  if (!avatarUrl) return null
  if (avatarUrl.startsWith('http')) return avatarUrl
  const { data } = await supabase.storage
    .from(CLUB_AVATARS_BUCKET)
    .createSignedUrl(avatarUrl, 3600)
  return data?.signedUrl ?? null
}

function MemberRow({
  member,
}: {
  member: ClubWithDetails['club_members'][number]
}) {
  const profile = member.profiles
  const displayName = profile
    ? [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.username
    : 'Unknown'
  const initial = displayName.charAt(0).toUpperCase()

  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    }}>
      <View style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: theme.colors.primary + '22',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Text style={{ fontSize: theme.font.size.md, fontWeight: theme.font.weight.semibold, color: theme.colors.primary }}>
          {initial}
        </Text>
      </View>
      <Text style={[shared.body, { flex: 1 }]} numberOfLines={1}>{displayName}</Text>
      {member.role === 'owner' && (
        <View style={{
          paddingHorizontal: theme.spacing.xs,
          paddingVertical: 2,
          borderRadius: theme.radius.sm,
          backgroundColor: theme.colors.primary,
        }}>
          <Text style={{ fontSize: theme.font.size.xs, fontWeight: theme.font.weight.semibold, color: theme.colors.white }}>
            Owner
          </Text>
        </View>
      )}
    </View>
  )
}

export default function ClubDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()

  const [club, setClub] = useState<ClubWithDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [avatarUri, setAvatarUri] = useState<string | null>(null)
  const [upcomingEvents, setUpcomingEvents] = useState<EventWithDetails[]>([])
  const [pastCount, setPastCount] = useState(0)
  const [userId, setUserId] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)

  // Edit mode
  const [editMode, setEditMode] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)

  function goBack() {
    if (router.canGoBack()) router.back()
    else router.replace('/(app)/(tabs)' as any)
  }

  async function fetchAll() {
    setLoading(true)

    const { data: { session } } = await supabase.auth.getSession()
    setUserId(session?.user.id ?? null)

    const [clubRes, eventsRes, pastRes] = await Promise.all([
      supabase
        .from('clubs')
        .select('*, club_members (club_id, user_id, role, joined_at, profiles (id, username, first_name, last_name, avatar_url))')
        .eq('id', id)
        .single(),
      supabase
        .from('events')
        .select(EVENT_CARD_LIST_SELECT)
        .eq('club_id', id)
        .gte('event_date', new Date().toISOString())
        .order('event_date', { ascending: true }),
      supabase
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('club_id', id)
        .lt('event_date', new Date().toISOString()),
    ])

    if (clubRes.data) {
      const clubData = clubRes.data as ClubWithDetails
      setClub(clubData)
      setEditName(clubData.name)
      setEditDescription(clubData.description ?? '')
      const uri = await resolveClubAvatarUri(clubData.avatar_url)
      setAvatarUri(uri)
    }

    setUpcomingEvents((eventsRes.data ?? []) as unknown as EventWithDetails[])
    setPastCount(pastRes.count ?? 0)
    setLoading(false)
  }

  useEffect(() => {
    fetchAll()
  }, [id])

  const currentUserIsOwner = useCallback(() => {
    if (!club || !userId) return false
    return club.club_members.some(m => m.user_id === userId && m.role === 'owner')
  }, [club, userId])

  const currentUserIsMember = useCallback(() => {
    if (!club || !userId) return false
    return club.club_members.some(m => m.user_id === userId)
  }, [club, userId])

  async function handleJoin() {
    if (!userId || !club) return
    setJoining(true)
    const { error } = await supabase
      .from('club_members')
      .insert({ club_id: club.id, user_id: userId, role: 'member' })
    if (error) {
      Alert.alert('Error', error.message)
    } else {
      await fetchAll()
    }
    setJoining(false)
  }

  async function handleLeave() {
    if (!userId || !club) return
    if (Platform.OS === 'web') {
      if (!window.confirm(`Leave ${club.name}?`)) return
      setJoining(true)
      const { error } = await supabase.from('club_members').delete().eq('club_id', club.id).eq('user_id', userId)
      if (error) Alert.alert('Error', error.message)
      else await fetchAll()
      setJoining(false)
      return
    }
    Alert.alert('Leave club', `Leave ${club.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          setJoining(true)
          const { error } = await supabase.from('club_members').delete().eq('club_id', club.id).eq('user_id', userId)
          if (error) Alert.alert('Error', error.message)
          else await fetchAll()
          setJoining(false)
        },
      },
    ])
  }

  async function confirmDeleteClub() {
    if (!club) return
    setDeleting(true)
    const { error } = await supabase.from('clubs').delete().eq('id', club.id)
    setDeleting(false)
    if (error) {
      Alert.alert('Error', error.message)
    } else {
      setShowDeleteModal(false)
      goBack()
    }
  }

  async function handleSaveEdit() {
    if (!club) return
    if (!editName.trim()) {
      Alert.alert('Name required', 'Please enter a club name.')
      return
    }
    setSaving(true)
    const { error } = await supabase
      .from('clubs')
      .update({ name: editName.trim(), description: editDescription.trim() || null })
      .eq('id', club.id)
    if (error) {
      Alert.alert('Error', error.message)
    } else {
      setEditMode(false)
      await fetchAll()
    }
    setSaving(false)
  }

  async function handlePickAvatar() {
    if (!club) return
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert('Permission required', 'Please allow access to your photo library.')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })

    if (result.canceled || !result.assets[0]) return

    setUploadingAvatar(true)
    const asset = result.assets[0]
    const ext = asset.uri.split('.').pop() ?? 'jpg'
    const path = `${club.id}/avatar.${ext}`

    const response = await fetch(asset.uri)
    const blob = await response.blob()

    const { error: uploadError } = await supabase.storage
      .from(CLUB_AVATARS_BUCKET)
      .upload(path, blob, { upsert: true, contentType: `image/${ext}` })

    if (uploadError) {
      Alert.alert('Upload failed', uploadError.message)
      setUploadingAvatar(false)
      return
    }

    const { error: updateError } = await supabase
      .from('clubs')
      .update({ avatar_url: path })
      .eq('id', club.id)

    if (updateError) {
      Alert.alert('Error', updateError.message)
    } else {
      await fetchAll()
    }
    setUploadingAvatar(false)
  }

  async function handleRemoveAvatar() {
    if (!club) return
    Alert.alert('Remove avatar', 'Remove the club avatar?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setUploadingAvatar(true)
          const { error } = await supabase
            .from('clubs')
            .update({ avatar_url: null })
            .eq('id', club.id)
          if (error) {
            Alert.alert('Error', error.message)
          } else {
            setAvatarUri(null)
            await fetchAll()
          }
          setUploadingAvatar(false)
        },
      },
    ])
  }

  const initial = club ? club.name.charAt(0).toUpperCase() : ''
  const foundedDate = club
    ? new Date(club.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : ''
  const memberCount = club?.club_members.length ?? 0
  const isOwner = currentUserIsOwner()
  const isMember = currentUserIsMember()

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
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
          {club?.name ?? 'Club'}
        </Text>
        {isOwner && !editMode && (
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <TouchableOpacity
              onPress={() => setEditMode(true)}
              style={{ padding: theme.spacing.xs }}
            >
              <Ionicons name="pencil-outline" size={20} color={theme.colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowDeleteModal(true)}
              style={{ padding: theme.spacing.xs }}
            >
              <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
            </TouchableOpacity>
          </View>
        )}
        {editMode && (
          <TouchableOpacity
            onPress={() => setEditMode(false)}
            style={{ padding: theme.spacing.xs }}
          >
            <Ionicons name="close-outline" size={22} color={theme.colors.subtext} />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={shared.centered}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : !club ? (
        <View style={shared.centered}>
          <Text style={shared.errorText}>Club not found</Text>
        </View>
      ) : (
        <ScrollView style={shared.screen} contentContainerStyle={shared.scrollContent}>

          {/* Avatar + Name */}
          <View style={{ alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.lg }}>
            <TouchableOpacity
              onPress={isOwner ? handlePickAvatar : undefined}
              activeOpacity={isOwner ? 0.7 : 1}
              style={{ position: 'relative' }}
            >
              <View style={{
                width: 88,
                height: 88,
                borderRadius: 44,
                backgroundColor: theme.colors.primary + '22',
                borderWidth: 2,
                borderColor: theme.colors.primary + '44',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}>
                {uploadingAvatar ? (
                  <ActivityIndicator color={theme.colors.primary} />
                ) : avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={{ width: 88, height: 88, borderRadius: 44 }} />
                ) : (
                  <Text style={{ fontSize: 36, fontWeight: theme.font.weight.bold, color: theme.colors.primary }}>
                    {initial}
                  </Text>
                )}
              </View>
              {isOwner && (
                <View style={{
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  backgroundColor: theme.colors.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 2,
                  borderColor: theme.colors.background,
                }}>
                  <Ionicons name="camera-outline" size={13} color={theme.colors.white} />
                </View>
              )}
            </TouchableOpacity>
            {isOwner && avatarUri && (
              <TouchableOpacity onPress={handleRemoveAvatar}>
                <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.error }}>Remove photo</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Edit mode form */}
          {editMode ? (
            <View style={[shared.card, { gap: theme.spacing.md, marginBottom: theme.spacing.md }]}>
              <Text style={shared.subheading}>Edit Club</Text>
              <View>
                <Text style={shared.label}>Name</Text>
                <TextInput
                  value={editName}
                  onChangeText={setEditName}
                  style={shared.input}
                  placeholder="Club name"
                  placeholderTextColor={theme.colors.subtext}
                />
              </View>
              <View>
                <Text style={shared.label}>Description</Text>
                <TextInput
                  value={editDescription}
                  onChangeText={setEditDescription}
                  style={[shared.input, shared.inputMultiline]}
                  placeholder="What is this club about?"
                  placeholderTextColor={theme.colors.subtext}
                  multiline
                  numberOfLines={4}
                />
              </View>
              <TouchableOpacity
                onPress={handleSaveEdit}
                disabled={saving}
                style={[shared.buttonBase, shared.buttonPrimary, saving && shared.buttonDisabled]}
              >
                {saving ? (
                  <ActivityIndicator color={theme.colors.white} />
                ) : (
                  <Text style={shared.buttonLabelPrimary}>Save changes</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* Description */}
              {club.description && (
                <Text style={[shared.body, shared.mb_md, { textAlign: 'center', color: theme.colors.subtext }]}>
                  {club.description}
                </Text>
              )}
            </>
          )}

          {/* Stats row */}
          <View style={[shared.card, { flexDirection: 'row', justifyContent: 'space-around', marginBottom: theme.spacing.md }]}>
            <View style={{ alignItems: 'center', gap: 3 }}>
              <Text style={{ fontSize: theme.font.size.xl, fontWeight: theme.font.weight.bold, color: theme.colors.text }}>
                {memberCount}
              </Text>
              <Text style={shared.caption}>{memberCount === 1 ? 'Member' : 'Members'}</Text>
            </View>
            <View style={{ width: 1, backgroundColor: theme.colors.border }} />
            <View style={{ alignItems: 'center', gap: 3 }}>
              <Text style={{ fontSize: theme.font.size.xl, fontWeight: theme.font.weight.bold, color: theme.colors.text }}>
                {upcomingEvents.length}
              </Text>
              <Text style={shared.caption}>Upcoming</Text>
            </View>
            <View style={{ width: 1, backgroundColor: theme.colors.border }} />
            <View style={{ alignItems: 'center', gap: 3 }}>
              <Text style={{ fontSize: theme.font.size.xl, fontWeight: theme.font.weight.bold, color: theme.colors.text }}>
                {pastCount}
              </Text>
              <Text style={shared.caption}>Past events</Text>
            </View>
          </View>

          {/* Founded */}
          <Text style={[shared.caption, { textAlign: 'center', marginBottom: theme.spacing.md }]}>
            Founded {foundedDate}
          </Text>

          {/* Membership badge */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: theme.spacing.lg }}>
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: theme.spacing.sm,
              paddingVertical: theme.spacing.xs,
              borderRadius: theme.radius.full,
              backgroundColor: club.membership_type === 'open'
                ? theme.colors.success + '18'
                : theme.colors.subtext + '18',
              borderWidth: 1,
              borderColor: club.membership_type === 'open'
                ? theme.colors.success + '44'
                : theme.colors.border,
            }}>
              <Ionicons
                name={club.membership_type === 'open' ? 'globe-outline' : 'lock-closed-outline'}
                size={13}
                color={club.membership_type === 'open' ? theme.colors.success : theme.colors.subtext}
              />
              <Text style={{
                fontSize: theme.font.size.sm,
                fontWeight: theme.font.weight.medium,
                color: club.membership_type === 'open' ? theme.colors.success : theme.colors.subtext,
              }}>
                {club.membership_type === 'open' ? 'Open membership' : 'Invite only'}
              </Text>
            </View>
          </View>

          {/* Join / Leave button */}
          {userId && !isOwner && (
            <View style={[shared.mb_lg]}>
              {isMember ? (
                <TouchableOpacity
                  onPress={handleLeave}
                  disabled={joining}
                  style={[shared.buttonBase, shared.buttonSecondary, joining && shared.buttonDisabled]}
                >
                  {joining ? (
                    <ActivityIndicator color={theme.colors.primary} />
                  ) : (
                    <Text style={shared.buttonLabelSecondary}>Leave club</Text>
                  )}
                </TouchableOpacity>
              ) : club.membership_type === 'open' ? (
                <TouchableOpacity
                  onPress={handleJoin}
                  disabled={joining}
                  style={[shared.buttonBase, shared.buttonPrimary, joining && shared.buttonDisabled]}
                >
                  {joining ? (
                    <ActivityIndicator color={theme.colors.white} />
                  ) : (
                    <Text style={shared.buttonLabelPrimary}>Join club</Text>
                  )}
                </TouchableOpacity>
              ) : (
                <View style={[shared.buttonBase, { backgroundColor: theme.colors.border }]}>
                  <Text style={{ color: theme.colors.subtext, fontSize: theme.font.size.md, fontWeight: theme.font.weight.medium }}>
                    Invite only
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Upcoming Events */}
          <View style={shared.divider} />
          <Text style={[shared.subheading, shared.mb_sm, { marginTop: theme.spacing.md }]}>
            Upcoming Events
          </Text>
          {upcomingEvents.length === 0 ? (
            <View style={[shared.card, { alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.md }]}>
              <Ionicons name="calendar-outline" size={32} color={theme.colors.subtext} />
              <Text style={[shared.caption, { textAlign: 'center' }]}>
                No upcoming events
              </Text>
            </View>
          ) : (
            upcomingEvents.map(event => (
              <EventCard key={event.id} event={event} />
            ))
          )}

          {/* Members */}
          <View style={shared.divider} />
          <Text style={[shared.subheading, shared.mb_sm, { marginTop: theme.spacing.md }]}>
            Members ({memberCount})
          </Text>
          <View style={[shared.card, { paddingVertical: 0, paddingHorizontal: theme.spacing.md, marginBottom: theme.spacing.xl }]}>
            {club.club_members.length === 0 ? (
              <View style={{ paddingVertical: theme.spacing.md, alignItems: 'center' }}>
                <Text style={shared.caption}>No members yet</Text>
              </View>
            ) : (
              club.club_members.map(member => (
                <MemberRow key={member.user_id} member={member} />
              ))
            )}
          </View>

        </ScrollView>
      )}

      {/* Delete confirmation modal */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: theme.spacing.lg }}
          onPress={() => !deleting && setShowDeleteModal(false)}
        >
          <Pressable
            style={{
              backgroundColor: theme.colors.card,
              borderRadius: theme.radius.lg,
              padding: theme.spacing.lg,
              width: '100%',
              maxWidth: 360,
              gap: theme.spacing.md,
            }}
            onPress={() => {}}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              <Ionicons name="trash-outline" size={22} color={theme.colors.error} />
              <Text style={{ fontSize: theme.font.size.lg, fontWeight: theme.font.weight.semibold, color: theme.colors.text }}>
                Delete club
              </Text>
            </View>
            <Text style={[shared.body, { color: theme.colors.subtext }]}>
              Are you sure you want to delete{' '}
              <Text style={{ fontWeight: theme.font.weight.semibold, color: theme.colors.text }}>{club?.name}</Text>?
              {' '}This cannot be undone — all members will be removed and club events will lose their club association.
            </Text>
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.xs }}>
              <TouchableOpacity
                onPress={() => setShowDeleteModal(false)}
                disabled={deleting}
                style={[shared.buttonBase, shared.buttonSecondary, { flex: 1 }, deleting && shared.buttonDisabled]}
              >
                <Text style={shared.buttonLabelSecondary}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmDeleteClub}
                disabled={deleting}
                style={[shared.buttonBase, { flex: 1, backgroundColor: theme.colors.error, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center', paddingVertical: theme.spacing.sm }, deleting && shared.buttonDisabled]}
              >
                {deleting ? (
                  <ActivityIndicator color={theme.colors.white} />
                ) : (
                  <Text style={{ color: theme.colors.white, fontSize: theme.font.size.md, fontWeight: theme.font.weight.semibold }}>Delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}
