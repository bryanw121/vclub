import React, { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, Text, TextInput, View, TouchableOpacity, Switch, Modal, StyleSheet, Platform, RefreshControl } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { Sentry } from '../../lib/sentry'
import { bumpVersion, eventKey } from '../../lib/dataVersion'
import { Button } from '../../components/Button'
import { Input } from '../../components/Input'
import { DatePickerField } from '../../components/DatePickerField'
import { LocationPickerField } from '../../components/LocationPickerField'
import type { LocationValue } from '../../components/LocationPickerField'
import { shared, theme, LOCATIONS, DAY_LABELS_SHORT, DURATION_OPTIONS, DEFAULT_DURATION_MINUTES } from '../../constants'
import type { RecurrenceCadence } from '../../constants'
import { cleanDate } from '../../utils'
import type { CreateEventForm, Tag, UserEventTemplate } from '../../types'

function roundToNearest5(): Date {
  const d = new Date()
  d.setSeconds(0, 0)
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5)
  return d
}

const EMPTY_FORM: CreateEventForm = {
  title: '',
  description: '',
  location: '',
  locationLatitude: null,
  locationLongitude: null,
  date: roundToNearest5(),
  durationMinutes: DEFAULT_DURATION_MINUTES,
  maxAttendees: null,
  price: null,
  venmoHandle: '',
  requiresApproval: false,
}

const CADENCE_OPTIONS: { value: RecurrenceCadence; label: string }[] = [
  { value: 'weekly',   label: 'Weekly'    },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'monthly',  label: 'Monthly'   },
]

function defaultEndDate(from: Date): Date {
  const d = new Date(from)
  d.setDate(d.getDate() + 28)
  return d
}

function generateEventDates(
  startDate: Date,
  enabled: boolean,
  days: number[],
  cadence: RecurrenceCadence,
  endDate: Date,
): Date[] {
  if (!enabled) return [startDate]

  const h = startDate.getHours()
  const m = startDate.getMinutes()
  const dates: Date[] = []

  if (cadence === 'monthly') {
    let d = new Date(startDate)
    while (d <= endDate) {
      dates.push(new Date(d))
      d = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate(), h, m)
    }
    return dates
  }

  const stepDays = cadence === 'biweekly' ? 14 : 7
  const selectedDays = days.length > 0 ? days : [startDate.getDay()]

  const weekSunday = new Date(startDate)
  weekSunday.setDate(weekSunday.getDate() - weekSunday.getDay())
  weekSunday.setHours(h, m, 0, 0)

  let cursor = new Date(weekSunday)
  while (cursor <= endDate) {
    for (const dayIdx of [...selectedDays].sort((a, b) => a - b)) {
      const d = new Date(cursor)
      d.setDate(d.getDate() + dayIdx)
      d.setHours(h, m, 0, 0)
      if (d >= startDate && d <= endDate) dates.push(new Date(d))
    }
    cursor.setDate(cursor.getDate() + stepDays)
  }

  return dates
}

export default function HostEventScreen() {
  const router = useRouter()

  function goBack() {
    if (router.canGoBack()) router.back()
    else router.replace('/(app)')
  }
  const { mode: modeParam, edit: editId, maxAttendees: maxAttendeesParam } = useLocalSearchParams<{ mode?: string; edit?: string; maxAttendees?: string }>()
  const isEdit = !!editId

  const [view, setView] = useState<'form' | 'templates'>(modeParam === 'templates' ? 'templates' : 'form')
  const [form, setForm] = useState<CreateEventForm>({
    ...EMPTY_FORM,
    maxAttendees: (() => { const n = parseInt(maxAttendeesParam ?? '', 10); return Number.isFinite(n) && n > 0 ? n : null })(),
  })
  const [recentVenues, setRecentVenues] = useState<LocationValue[]>([])
  const [recurrence, setRecurrence] = useState({
    enabled: false,
    days: [] as number[],
    cadence: 'weekly' as RecurrenceCadence,
    endDate: defaultEndDate(new Date()),
  })
  const [loading, setLoading] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [successModal, setSuccessModal] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  // Save as template
  const [saveAsTemplate, setSaveAsTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')

  // Template picker
  const [userTemplates, setUserTemplates] = useState<UserEventTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)

  // Tags
  const [availableTags, setAvailableTags] = useState<Tag[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])

  // Club
  const [ownedClubs, setOwnedClubs] = useState<{ id: string; name: string }[]>([])
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null)

  const [initialLoading, setInitialLoading] = useState(true)
  const [durationModalOpen, setDurationModalOpen] = useState(false)
  const [hostPullRefreshing, setHostPullRefreshing] = useState(false)

  useEffect(() => { void loadInitialData() }, [])

  async function loadInitialData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) setUserId(user.id)

    const [tagsRes, clubsRes] = await Promise.all([
      supabase.from('tags').select('id, name, category, display_order').order('display_order', { ascending: true }),
      user
        ? supabase.from('club_members').select('club_id, clubs (id, name)').eq('user_id', user.id).eq('role', 'owner')
        : Promise.resolve({ data: null, error: null }),
    ])

    setAvailableTags((tagsRes.data ?? []) as Tag[])
    setOwnedClubs(((clubsRes.data ?? []) as any[]).map((m: any) => m.clubs).filter(Boolean))

    // Load recent venues from past hosted events
    if (user) {
      const { data: venueRows } = await supabase
        .from('events')
        .select('location, latitude, longitude')
        .eq('created_by', user.id)
        .not('location', 'is', null)
        .order('event_date', { ascending: false })
        .limit(20)
      if (venueRows) {
        const seen = new Set<string>()
        const unique: LocationValue[] = []
        for (const e of venueRows) {
          if (e.location && !seen.has(e.location)) {
            seen.add(e.location)
            unique.push({ display: e.location, latitude: e.latitude ?? null, longitude: e.longitude ?? null })
          }
        }
        setRecentVenues(unique.slice(0, 5))
      }
    }

    if (editId && user) await loadEventForEdit(editId)

    setInitialLoading(false)
  }

  async function loadEventForEdit(id: string) {
    const { data, error } = await supabase
      .from('events')
      .select('*, event_tags (tag_id)')
      .eq('id', id)
      .single()
    if (error || !data) return

    setForm({
      title: data.title,
      description: data.description ?? '',
      location: data.location ?? '',
      locationLatitude: data.latitude ?? null,
      locationLongitude: data.longitude ?? null,
      date: new Date(data.event_date),
      durationMinutes: data.duration_minutes ?? DEFAULT_DURATION_MINUTES,
      maxAttendees: data.max_attendees,
      price: data.price ?? null,
      venmoHandle: data.venmo_handle ?? '',
      requiresApproval: data.requires_approval ?? false,
    })
    setSelectedTagIds((data.event_tags ?? []).map((et: any) => et.tag_id))
    setSelectedClubId(data.club_id ?? null)
  }

  useEffect(() => {
    if (view === 'templates') fetchUserTemplates()
  }, [view])

  async function fetchUserTemplates(opts?: { quiet?: boolean }) {
    if (!opts?.quiet) setTemplatesLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { if (!opts?.quiet) setTemplatesLoading(false); return }
    const { data } = await supabase
      .from('user_event_templates')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    setUserTemplates((data ?? []) as UserEventTemplate[])
    if (!opts?.quiet) setTemplatesLoading(false)
  }

  const refreshHostContext = useCallback(async () => {
    setHostPullRefreshing(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setUserId(user.id)
      const [tagsRes, clubsRes] = await Promise.all([
        supabase.from('tags').select('id, name, category, display_order').order('display_order', { ascending: true }),
        user
          ? supabase.from('club_members').select('club_id, clubs (id, name)').eq('user_id', user.id).eq('role', 'owner')
          : Promise.resolve({ data: null, error: null }),
      ])
      setAvailableTags((tagsRes.data ?? []) as Tag[])
      setOwnedClubs(((clubsRes.data ?? []) as any[]).map((m: any) => m.clubs).filter(Boolean))
      if (editId && user) await loadEventForEdit(editId)
      if (view === 'templates') await fetchUserTemplates({ quiet: true })
    } finally {
      setHostPullRefreshing(false)
    }
  }, [view, editId])

  function applyUserTemplate(t: UserEventTemplate) {
    setForm(prev => ({
      ...prev,
      title: t.title,
      description: t.description ?? '',
      location: t.location ?? '',
      locationLatitude: null,
      locationLongitude: null,
      maxAttendees: t.max_attendees,
    }))
    setView('form')
  }

  function setField<K extends keyof CreateEventForm>(key: K, value: CreateEventForm[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function toggleTag(id: string) {
    setSelectedTagIds(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id])
  }

  function toggleRecurrenceDay(dayIdx: number) {
    setRecurrence(prev => {
      const already = prev.days.includes(dayIdx)
      return { ...prev, days: already ? prev.days.filter(d => d !== dayIdx) : [...prev.days, dayIdx] }
    })
  }

  async function handleSubmit() {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in')

      if (isEdit && editId) {
        // ── Update existing event ──────────────────────────────
        const { error } = await supabase
          .from('events')
          .update({
            title: form.title,
            description: form.description || null,
            location: form.location || null,
            latitude: form.locationLatitude,
            longitude: form.locationLongitude,
            event_date: cleanDate(form.date),
            duration_minutes: form.durationMinutes,
            max_attendees: form.maxAttendees,
            club_id: selectedClubId,
            price: form.price,
            venmo_handle: form.price && form.price > 0 ? (form.venmoHandle.trim() || null) : null,
            requires_approval: form.requiresApproval,
          })
          .eq('id', editId)
        if (error) throw error

        await supabase.from('event_tags').delete().eq('event_id', editId)
        if (selectedTagIds.length > 0) {
          const { error: tagError } = await supabase.from('event_tags').insert(
            selectedTagIds.map(tagId => ({ event_id: editId, tag_id: tagId }))
          )
          if (tagError) throw tagError
        }

        // Auto-promote waitlisted users when capacity is expanded
        if (form.maxAttendees === null) {
          // Unlimited capacity — promote everyone on the waitlist
          await supabase
            .from('event_attendees')
            .update({ status: 'attending' })
            .eq('event_id', editId)
            .eq('status', 'waitlisted')
        } else {
          const { data: attendingData } = await supabase
            .from('event_attendees')
            .select('user_id')
            .eq('event_id', editId)
            .eq('status', 'attending')
          const newSpots = form.maxAttendees - (attendingData?.length ?? 0)
          if (newSpots > 0) {
            const { data: waitlisted } = await supabase
              .from('event_attendees')
              .select('user_id')
              .eq('event_id', editId)
              .eq('status', 'waitlisted')
              .order('joined_at', { ascending: true })
              .limit(newSpots)
            if (waitlisted && waitlisted.length > 0) {
              await supabase
                .from('event_attendees')
                .update({ status: 'attending' })
                .eq('event_id', editId)
                .in('user_id', waitlisted.map(w => w.user_id))
            }
          }
        }

        // Tell the event detail screen its cached copy is out of date. Without
        // this it keeps showing the pre-edit row: its focus refetch only fires
        // after 30s of staleness, and an edit round-trip is much faster.
        // Bump after the tag rewrite and waitlist promotion so the refetch sees
        // every part of this save, not just the events row.
        bumpVersion(eventKey(editId))

        setSuccessMessage('Event updated!')
        setSuccessModal(true)
      } else {
        // ── Create new event(s) ────────────────────────────────
        const dates = generateEventDates(
          form.date, recurrence.enabled, recurrence.days, recurrence.cadence, recurrence.endDate,
        )
        if (dates.length === 0) {
          setSuccessMessage('The recurrence settings produced no valid dates. Check the end date.')
          return
        }

        const rows = dates.map(d => ({
          title: form.title,
          description: form.description || null,
          location: form.location || null,
          latitude: form.locationLatitude,
          longitude: form.locationLongitude,
          event_date: cleanDate(d),
          duration_minutes: form.durationMinutes,
          max_attendees: form.maxAttendees,
          created_by: user.id,
          club_id: selectedClubId,
          price: form.price,
          venmo_handle: form.price && form.price > 0 ? (form.venmoHandle.trim() || null) : null,
          requires_approval: form.requiresApproval,
        }))

        const { data: insertedEvents, error } = await supabase.from('events').insert(rows).select('id')
        if (error) throw error

        if (selectedTagIds.length > 0 && insertedEvents) {
          const tagRows = insertedEvents.flatMap(e =>
            selectedTagIds.map(tagId => ({ event_id: e.id, tag_id: tagId }))
          )
          const { error: tagError } = await supabase.from('event_tags').insert(tagRows)
          if (tagError) throw tagError
        }

        if (saveAsTemplate && (templateName.trim() || form.title)) {
          await supabase.from('user_event_templates').insert({
            user_id: user.id,
            name: templateName.trim() || form.title,
            title: form.title,
            description: form.description || null,
            location: form.location || null,
            max_attendees: form.maxAttendees,
          })
        }

        setSuccessMessage(dates.length > 1 ? `${dates.length} events created!` : 'Event created!')
        setSuccessModal(true)
        setForm(EMPTY_FORM)
        setRecurrence({ enabled: false, days: [], cadence: 'weekly', endDate: defaultEndDate(new Date()) })
        setSaveAsTemplate(false)
        setTemplateName('')
        setSelectedTagIds([])
        setSelectedClubId(null)
      }
    } catch (e: any) {
      Sentry.captureException(e)
      setSuccessMessage('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const eventCount = recurrence.enabled
    ? generateEventDates(form.date, true, recurrence.days, recurrence.cadence, recurrence.endDate).length
    : 1

  const showDayPicker = recurrence.enabled && recurrence.cadence !== 'monthly'

  // ── Templates view ────────────────────────────────────────────────────────
  if (view === 'templates') {
    return (
      <ScrollView
        style={shared.screen}
        contentContainerStyle={shared.scrollContent}
        refreshControl={
          <RefreshControl refreshing={hostPullRefreshing} onRefresh={() => void refreshHostContext()} tintColor={theme.colors.primary} />
        }
      >
        <Text style={[shared.subheading, shared.mb_md]}>My Templates</Text>

        {templatesLoading ? (
          <ActivityIndicator color={theme.colors.primary} />
        ) : userTemplates.length === 0 ? (
          <View style={[shared.card, { alignItems: 'center', gap: theme.spacing.sm }]}>
            <Ionicons name="document-outline" size={32} color={theme.colors.subtext} />
            <Text style={[shared.caption, { textAlign: 'center' }]}>
              No templates yet. Create an event and check "Save as template" to save it here.
            </Text>
          </View>
        ) : (
          userTemplates.map(t => (
            <TouchableOpacity
              key={t.id}
              onPress={() => applyUserTemplate(t)}
              style={[shared.card, { gap: theme.spacing.xs }]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={shared.subheading}>{t.name}</Text>
                <Ionicons name="chevron-forward" size={16} color={theme.colors.subtext} />
              </View>
              <Text style={shared.caption}>{t.title}{t.location ? ` · ${t.location}` : ''}{t.max_attendees ? ` · ${t.max_attendees} max` : ''}</Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    )
  }

  // ── Form view ─────────────────────────────────────────────────────────────
  if (initialLoading) {
    return (
      <>
        <Stack.Screen options={{ title: '' }} />
        <View style={[shared.screen, shared.centered]}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </>
    )
  }

  return (
    <>
      <Stack.Screen options={{
        title: '',
        headerLeft: () => (
          <TouchableOpacity onPress={goBack} style={{ paddingRight: 8 }}>
            <Ionicons name="chevron-back" size={24} color={theme.colors.primary} />
          </TouchableOpacity>
        ),
      }} />
      <Modal visible={successModal} transparent animationType="none" onRequestClose={() => setSuccessModal(false)}>
        <TouchableOpacity style={shared.modalOverlay} onPress={() => setSuccessModal(false)}>
          <View style={shared.modalCard}>
            <Text style={shared.modalEmoji}>🏐</Text>
            <Text style={shared.modalTitle}>{successMessage}</Text>
            <Text style={shared.modalBody}>{isEdit ? 'Your changes have been saved.' : 'Your event is now live for members to join.'}</Text>
            <TouchableOpacity style={shared.modalButton} onPress={goBack}>
              <Text style={shared.modalButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <ScrollView
        style={shared.screen}
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={hostPullRefreshing} onRefresh={() => void refreshHostContext()} tintColor={theme.colors.primary} />
        }
      >
        {/* Header */}
        <View style={{ marginBottom: 20 }}>
          <Text style={{ fontFamily: theme.fonts.display, fontWeight: '700', fontSize: 32, letterSpacing: -1.1, color: theme.colors.text }}>
            {isEdit ? 'Edit event.' : 'New event.'}
          </Text>
          <Text style={{ fontFamily: theme.fonts.body, fontSize: 13, color: theme.colors.subtext, marginTop: 3 }}>
            Fill in the basics — you can edit later.
          </Text>
        </View>

        {/* ── Event type toggle ── */}
        {(() => {
          const typeTags = availableTags.filter(t => t.category === 'event_type' && t.name !== 'Tournament')
          if (typeTags.length === 0) return null
          const TYPE_META: Record<string, { color: string; subtitle: string }> = {
            'Open Play': { color: theme.colors.primary, subtitle: 'casual' },
          }
          return (
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
              {typeTags.map(tag => {
                const meta = TYPE_META[tag.name] ?? { color: theme.colors.primary, subtitle: '' }
                const selected = selectedTagIds.includes(tag.id)
                return (
                  <TouchableOpacity
                    key={tag.id}
                    onPress={() => {
                      setSelectedTagIds(prev => {
                        const otherTypeIds = typeTags.filter(t => t.id !== tag.id).map(t => t.id)
                        const withoutTypes = prev.filter(id => !otherTypeIds.includes(id))
                        return withoutTypes.includes(tag.id)
                          ? withoutTypes.filter(id => id !== tag.id)
                          : [...withoutTypes, tag.id]
                      })
                    }}
                    activeOpacity={0.75}
                    style={{
                      flex: 1, padding: 14, borderRadius: 18,
                      backgroundColor: selected ? meta.color : theme.colors.card,
                      borderWidth: selected ? 0 : 1.5,
                      borderColor: theme.colors.border,
                    }}
                  >
                    <Text style={{ fontFamily: theme.fonts.display, fontWeight: '700', fontSize: 17, letterSpacing: -0.3, color: selected ? '#fff' : theme.colors.text }}>
                      {tag.name}
                    </Text>
                    {meta.subtitle ? (
                      <Text style={{ fontFamily: theme.fonts.body, fontSize: 11, color: selected ? 'rgba(255,255,255,0.75)' : theme.colors.subtext, marginTop: 2 }}>
                        {meta.subtitle}
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                )
              })}
            </View>
          )
        })()}

        {/* ── Title ── */}
        <View style={hostStyles.fieldCard}>
          <Text style={hostStyles.fieldLabel}>Title</Text>
          <TextInput
            value={form.title}
            onChangeText={v => setField('title', v)}
            placeholder="Friday Night Round Robin"
            placeholderTextColor={theme.colors.subtext}
            style={hostStyles.fieldInput}
          />
        </View>

        {/* ── Location ── */}
        <View style={hostStyles.fieldCard}>
          <Text style={hostStyles.fieldLabel}>Location</Text>
          <LocationPickerField
            value={form.location ? { display: form.location, latitude: form.locationLatitude, longitude: form.locationLongitude } : null}
            onChange={loc => {
              setField('location', loc.display)
              setField('locationLatitude', loc.latitude)
              setField('locationLongitude', loc.longitude)
            }}
            userId={userId}
            recentVenues={recentVenues}
          />
        </View>

        {/* ── Date + Time (DatePickerField handles both) ── */}
        <View style={hostStyles.fieldCard}>
          <Text style={hostStyles.fieldLabel}>Date & Time</Text>
          <DatePickerField
            value={form.date}
            onChange={d => {
              setField('date', d)
              if (!recurrence.enabled) setRecurrence(prev => ({ ...prev, endDate: defaultEndDate(d) }))
            }}
          />
        </View>

        {/* ── Duration ── */}
        <View style={hostStyles.fieldCard}>
          <Text style={hostStyles.fieldLabel}>Duration</Text>
          <TouchableOpacity
            onPress={() => setDurationModalOpen(true)}
            activeOpacity={0.7}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}
          >
            <Text style={{ fontFamily: theme.fonts.body, fontSize: 15, color: theme.colors.text, fontWeight: '500' }}>
              {DURATION_OPTIONS.find(o => o.minutes === form.durationMinutes)?.label ?? 'Select'}
            </Text>
            <Ionicons name="chevron-down" size={16} color={theme.colors.subtext} />
          </TouchableOpacity>
          <Modal visible={durationModalOpen} transparent animationType="fade" onRequestClose={() => setDurationModalOpen(false)}>
            <TouchableOpacity style={shared.modalOverlay} activeOpacity={1} onPress={() => setDurationModalOpen(false)}>
              <View style={[shared.modalCard, { paddingVertical: 0, paddingHorizontal: 0, overflow: 'hidden', minWidth: 200 }]}>
                {DURATION_OPTIONS.map((opt, i) => {
                  const active = form.durationMinutes === opt.minutes
                  return (
                    <TouchableOpacity
                      key={opt.minutes}
                      onPress={() => { setField('durationMinutes', opt.minutes); setDurationModalOpen(false) }}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: theme.colors.border }}
                    >
                      <Text style={{ fontSize: theme.font.size.md, color: active ? theme.colors.primary : theme.colors.text, fontWeight: active ? theme.font.weight.semibold : theme.font.weight.regular }}>
                        {opt.label}
                      </Text>
                      {active && <Ionicons name="checkmark" size={16} color={theme.colors.primary} />}
                    </TouchableOpacity>
                  )
                })}
              </View>
            </TouchableOpacity>
          </Modal>
        </View>

        {/* ── Max players ── */}
        <View style={hostStyles.fieldCard}>
          <Text style={hostStyles.fieldLabel}>Max players</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 }}>
            <TextInput
              value={form.maxAttendees != null ? String(form.maxAttendees) : ''}
              onChangeText={v => {
                const digits = v.replace(/[^0-9]/g, '')
                if (digits === '') { setField('maxAttendees', null); return }
                const n = parseInt(digits, 10)
                if (Number.isFinite(n) && n > 0) setField('maxAttendees', n)
              }}
              placeholder="e.g. 18"
              placeholderTextColor={theme.colors.subtext}
              keyboardType="number-pad"
              style={[hostStyles.fieldInput, { flex: 1 }]}
            />
            <TouchableOpacity
              onPress={() => setField('maxAttendees', form.maxAttendees === null ? 18 : null)}
              style={[hostStyles.chip, form.maxAttendees === null && hostStyles.chipActive]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityState={{ selected: form.maxAttendees === null }}
              accessibilityLabel="Unlimited players"
            >
              <Text style={[hostStyles.chipText, form.maxAttendees === null && hostStyles.chipTextActive]}>
                Unlimited
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Skill level tags ── */}
        {(() => {
          const byCategory = availableTags.reduce<Record<string, Tag[]>>((acc, tag) => {
            if (tag.category === 'event_type') return acc
            ;(acc[tag.category] ??= []).push(tag)
            return acc
          }, {})
          const entries = Object.entries(byCategory)
          if (entries.length === 0) return null
          return entries.map(([category, tags]) => (
            <View key={category} style={hostStyles.fieldCard}>
              <Text style={hostStyles.fieldLabel}>
                {category.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {tags.map(tag => {
                  const active = selectedTagIds.includes(tag.id)
                  return (
                    <TouchableOpacity
                      key={tag.id}
                      onPress={() => toggleTag(tag.id)}
                      style={{
                        paddingHorizontal: 13, paddingVertical: 6, borderRadius: 999,
                        backgroundColor: active ? theme.colors.text : theme.colors.border,
                      }}
                    >
                      <Text style={{
                        fontFamily: theme.fonts.display, fontWeight: '700', fontSize: 12.5,
                        color: active ? theme.colors.background : theme.colors.text,
                      }}>{tag.name}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>
          ))
        })()}

        {/* ── Description ── */}
        <View style={hostStyles.fieldCard}>
          <Text style={hostStyles.fieldLabel}>Description (optional)</Text>
          <TextInput
            value={form.description}
            onChangeText={v => setField('description', v)}
            placeholder="What's this event about?"
            placeholderTextColor={theme.colors.subtext}
            multiline
            numberOfLines={3}
            style={[hostStyles.fieldInput, { minHeight: 64, textAlignVertical: 'top' }]}
          />
        </View>

        {/* ── Price + Venmo ── */}
        <View style={hostStyles.fieldCard}>
          <Text style={hostStyles.fieldLabel}>Price (optional)</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: 15, color: theme.colors.subtext }}>$</Text>
            <TextInput
              value={form.price != null ? String(form.price) : ''}
              onChangeText={v => {
                const trimmed = v.replace(/[^0-9.]/g, '')
                if (trimmed === '' || trimmed === '.') { setField('price', null); return }
                const n = parseFloat(trimmed)
                setField('price', isNaN(n) ? null : n)
              }}
              placeholder="0.00 — leave blank for free"
              placeholderTextColor={theme.colors.subtext}
              keyboardType="decimal-pad"
              style={[hostStyles.fieldInput, { flex: 1 }]}
            />
          </View>
          {!!form.price && form.price > 0 && (
            <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 12 }}>
              <Text style={hostStyles.fieldLabel}>Venmo handle (optional)</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: 15, color: theme.colors.subtext }}>@</Text>
                <TextInput
                  value={form.venmoHandle}
                  onChangeText={v => setField('venmoHandle', v.replace(/^@/, ''))}
                  placeholder="your-venmo-username"
                  placeholderTextColor={theme.colors.subtext}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[hostStyles.fieldInput, { flex: 1 }]}
                />
              </View>
            </View>
          )}
        </View>

        {/* ── Approval ──
            Deliberately its own card, right after Price, because approval used
            to be inferred from `price > 0`. Hosts need to see that the two are
            now independent: a free event can be screened, a paid one can be open. */}
        <View style={hostStyles.fieldCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.md }}>
            <View style={{ flex: 1 }}>
              <Text style={hostStyles.fieldLabel}>Require approval to join</Text>
              <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.subtext, marginTop: 2 }}>
                {form.requiresApproval
                  ? 'Players request a spot and you approve each one.'
                  : 'Anyone can join instantly until the event is full.'}
              </Text>
            </View>
            <Switch
              value={form.requiresApproval}
              onValueChange={v => setField('requiresApproval', v)}
              accessibilityLabel="Require approval to join this event"
              trackColor={{ false: theme.colors.border, true: theme.colors.primary + '80' }}
              thumbColor={form.requiresApproval ? theme.colors.primary : theme.colors.subtext}
            />
          </View>
        </View>

        {/* ── Recurrence (create only) ── */}
        {!isEdit && (
          <View style={hostStyles.fieldCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={hostStyles.fieldLabel}>Repeat</Text>
              <Switch
                value={recurrence.enabled}
                onValueChange={v => setRecurrence(prev => ({ ...prev, enabled: v }))}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary + '80' }}
                thumbColor={recurrence.enabled ? theme.colors.primary : theme.colors.subtext}
              />
            </View>
            {recurrence.enabled && (
              <View style={{ marginTop: 14, gap: 12 }}>
                <View style={{ flexDirection: 'row', borderRadius: theme.radius.md, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.border, alignSelf: 'flex-start' }}>
                  {CADENCE_OPTIONS.map(opt => (
                    <TouchableOpacity
                      key={opt.value}
                      onPress={() => setRecurrence(prev => ({ ...prev, cadence: opt.value }))}
                      style={{ paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs, backgroundColor: recurrence.cadence === opt.value ? theme.colors.primary : 'transparent' }}
                    >
                      <Text style={{ fontSize: theme.font.size.sm, fontWeight: theme.font.weight.medium, color: recurrence.cadence === opt.value ? '#fff' : theme.colors.subtext }}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {showDayPicker && (
                  <View>
                    <Text style={[shared.caption, { marginBottom: theme.spacing.xs }]}>On these days</Text>
                    <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
                      {DAY_LABELS_SHORT.map((label, i) => {
                        const active = recurrence.days.includes(i)
                        return (
                          <TouchableOpacity
                            key={i}
                            onPress={() => toggleRecurrenceDay(i)}
                            style={{
                              width: 36, height: 36, borderRadius: 18,
                              borderWidth: 1.5,
                              borderColor: active ? theme.colors.primary : theme.colors.border,
                              backgroundColor: active ? theme.colors.primary : 'transparent',
                              alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            <Text style={{ fontSize: theme.font.size.xs, fontWeight: theme.font.weight.semibold, color: active ? '#fff' : theme.colors.subtext }}>
                              {label}
                            </Text>
                          </TouchableOpacity>
                        )
                      })}
                    </View>
                  </View>
                )}
                <View>
                  <Text style={[shared.caption, { marginBottom: theme.spacing.xs }]}>Until</Text>
                  <DatePickerField value={recurrence.endDate} onChange={d => setRecurrence(prev => ({ ...prev, endDate: d }))} />
                </View>
                {eventCount > 0 && (
                  <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: theme.colors.primary }}>
                    {eventCount} event{eventCount !== 1 ? 's' : ''} will be created
                  </Text>
                )}
              </View>
            )}
          </View>
        )}

        {/* ── Club ── */}
        {ownedClubs.length > 0 && (
          <View style={hostStyles.fieldCard}>
            <Text style={hostStyles.fieldLabel}>Club (optional)</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {ownedClubs.map(club => {
                const active = selectedClubId === club.id
                return (
                  <TouchableOpacity
                    key={club.id}
                    onPress={() => setSelectedClubId(active ? null : club.id)}
                    style={{
                      paddingHorizontal: 13, paddingVertical: 6, borderRadius: 999,
                      backgroundColor: active ? theme.colors.primary : theme.colors.border,
                    }}
                  >
                    <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: 13, color: active ? '#fff' : theme.colors.text }}>
                      {club.name}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>
        )}

        {/* ── Save as template ── */}
        {!isEdit && (
          <View style={hostStyles.fieldCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={hostStyles.fieldLabel}>Save as template</Text>
              <Switch
                value={saveAsTemplate}
                onValueChange={setSaveAsTemplate}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary + '80' }}
                thumbColor={saveAsTemplate ? theme.colors.primary : theme.colors.subtext}
              />
            </View>
            {saveAsTemplate && (
              <TextInput
                value={templateName}
                onChangeText={setTemplateName}
                placeholder={form.title || 'Template name'}
                placeholderTextColor={theme.colors.subtext}
                style={[hostStyles.fieldInput, { marginTop: 10 }]}
              />
            )}
          </View>
        )}

        {/* ── Submit ── */}
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={!form.title || !userId || loading}
          activeOpacity={0.85}
          style={{
            marginTop: 8,
            padding: 15, borderRadius: 14,
            backgroundColor: (!form.title || !userId) ? theme.colors.border : theme.colors.text,
            alignItems: 'center',
          }}
        >
          {loading
            ? <ActivityIndicator color={theme.colors.background} />
            : <Text style={{ fontFamily: theme.fonts.display, fontWeight: '700', fontSize: 15, letterSpacing: 0.2, color: theme.colors.background }}>
                {isEdit ? 'Save changes' : (eventCount > 1 ? `Publish ${eventCount} events` : 'Publish event')}
              </Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </>
  )
}

const hostStyles = StyleSheet.create({
  fieldCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 10,
  },
  fieldLabel: {
    fontFamily: theme.fonts.bodySemiBold,
    fontSize: 10.5,
    fontWeight: '700',
    color: theme.colors.subtext,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  fieldInput: {
    fontFamily: theme.fonts.body,
    fontSize: 15,
    color: theme.colors.text,
    fontWeight: '500',
    paddingVertical: 2,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
  },
  chip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs + 2,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
  },
  chipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  chipText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.font.size.sm,
    color: theme.colors.subtext,
  },
  chipTextActive: {
    fontFamily: theme.fonts.bodySemiBold,
    color: theme.colors.white,
  },
})
