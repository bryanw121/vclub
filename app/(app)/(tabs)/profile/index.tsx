import React, { useEffect, useState } from 'react'
import type { ComponentProps } from 'react'
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../../../lib/supabase'
import { Button } from '../../../../components/Button'
import { EventCard } from '../../../../components/EventCard'
import { Input } from '../../../../components/Input'
import { shared, theme } from '../../../../constants'
import type { EventWithDetails, FeedbackKind, FeedbackPriority, Profile } from '../../../../types'

type Section = 'menu' | 'account' | 'feedback' | 'history' | 'kudos' | 'hosted'
type HistoryFilter = 'hosted' | 'attended'
const HISTORY_LIMIT = 5

export default function MyProfile() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [section, setSection] = useState<Section>('menu')
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('hosted')
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [pastHostedEvents, setPastHostedEvents] = useState<EventWithDetails[]>([])
  const [upcomingHostedEvents, setUpcomingHostedEvents] = useState<EventWithDetails[]>([])

  // Feedback form state (kept here so we don't have to add router screens yet).
  const [kind, setKind] = useState<FeedbackKind>('feature')
  const [priority, setPriority] = useState<FeedbackPriority>('medium')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)
  const [feedbackError, setFeedbackError] = useState<string | null>(null)

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

    if (!profileRes.error) setProfile(profileRes.data as Profile)
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

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut()
    if (error) Alert.alert('Error', error.message)
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
  const hostedVisible = pastHostedEvents.slice(0, HISTORY_LIMIT)
  const hostedOverflowCount = Math.max(0, pastHostedEvents.length - HISTORY_LIMIT)

  if (loading || !profile) return null

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

      <ScrollView contentContainerStyle={shared.scrollContent}>
        <View style={[shared.rowBetween, shared.mb_xs]}>
          <Text style={shared.heading}>{profile.username}</Text>
          {section !== 'menu' && (
            <Pressable
              onPress={() => setSection('menu')}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Back to profile menu"
            >
              <Ionicons name="close" size={22} color={theme.colors.subtext} />
            </Pressable>
          )}
        </View>

        <Text style={[shared.caption, shared.mb_lg]}>
          joined {new Date(profile.created_at).toLocaleDateString()}
        </Text>

        {/* 2-column card menu */}
        <View style={{ gap: theme.spacing.md }}>
          <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
            <MenuCard
              title="Account Settings"
              icon="settings-outline"
              active={section === 'account'}
              onPress={() => setSection('account')}
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
          <MenuCard
            title="Hosted Events"
            icon="calendar-outline"
            active={section === 'hosted'}
            onPress={() => setSection('hosted')}
            style={[activeCardStyle(section === 'hosted'), { flex: undefined }]}
          />
        </View>

        {/* Section content */}
        {section === 'account' && (
          <View style={[shared.card, { marginTop: theme.spacing.md }]}>
            <Text style={shared.subheading}>Account settings</Text>
            <View style={shared.mt_sm} />
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
