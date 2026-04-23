import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, ScrollView, Text, TextInput, View, TouchableOpacity, Switch, Modal, StyleSheet, Platform, RefreshControl } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { Sentry } from '../../lib/sentry'
import { Button } from '../../components/Button'
import { Input } from '../../components/Input'
import { DatePickerField } from '../../components/DatePickerField'
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
  date: roundToNearest5(),
  durationMinutes: DEFAULT_DURATION_MINUTES,
  maxAttendees: null,
  price: null,
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
  const [locationId, setLocationId] = useState('')
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

    const loc = LOCATIONS.find(l => l.label === data.location)
    setForm({
      title: data.title,
      description: data.description ?? '',
      location: data.location ?? '',
      date: new Date(data.event_date),
      durationMinutes: data.duration_minutes ?? DEFAULT_DURATION_MINUTES,
      maxAttendees: data.max_attendees,
      price: data.price ?? null,
    })
    if (loc) {
      setLocationId(loc.id)
    } else if (data.location) {
      setLocationId('other')
    }
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
    const loc = LOCATIONS.find(l => l.label === t.location)
    setForm(prev => ({
      ...prev,
      title: t.title,
      description: t.description ?? '',
      location: t.location ?? '',
      maxAttendees: t.max_attendees,
    }))
    if (loc) {
      setLocationId(loc.id)
    } else if (t.location) {
      setLocationId('other')
    } else {
      setLocationId('')
    }
    setView('form')
  }

  function setField<K extends keyof CreateEventForm>(key: K, value: CreateEventForm[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function selectLocation(id: string) {
    setLocationId(id)
    if (id !== 'other') {
      const loc = LOCATIONS.find(l => l.id === id)
      setField('location', loc?.label ?? '')
    } else {
      setField('location', '')
    }
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
            event_date: cleanDate(form.date),
            duration_minutes: form.durationMinutes,
            max_attendees: form.maxAttendees,
            club_id: selectedClubId,
            price: form.price,
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
          event_date: cleanDate(d),
          duration_minutes: form.durationMinutes,
          max_attendees: form.maxAttendees,
          created_by: user.id,
          club_id: selectedClubId,
          price: form.price,
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
        setLocationId('')
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
            <TouchableOpacity style={shared.modalButton} onPress={() => router.back()}>
              <Text style={shared.modalButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <ScrollView
        style={shared.screen}
        contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl }}
        scrollEnabled={true}
        refreshControl={
          <RefreshControl refreshing={hostPullRefreshing} onRefresh={() => void refreshHostContext()} tintColor={theme.colors.primary} />
        }
      >

        {/* Page title */}
        <Text style={{ fontFamily: theme.fonts.display, fontSize: 28, letterSpacing: -0.8, color: theme.colors.text, marginBottom: theme.spacing.lg }}>
          {isEdit ? 'Edit event.' : 'Host an event.'}
        </Text>

        {/* ── Event type toggle cards ── */}
        {(() => {
          // Tournament has its own dedicated creation flow — exclude it here
          const typeTags = availableTags.filter(t => t.category === 'event_type' && t.name !== 'Tournament')
          if (typeTags.length === 0) return null
          const TYPE_META: Record<string, { color: string; subtitle: string }> = {
            'Open Play':  { color: theme.colors.primary, subtitle: 'casual' },
            'Tournament': { color: theme.colors.warm,    subtitle: 'bracket' },
          }
          return (
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: theme.spacing.lg }}>
              {typeTags.map(tag => {
                const meta = TYPE_META[tag.name] ?? { color: theme.colors.primary }
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
                    style={{
                      flex: 1, padding: 14, borderRadius: 18,
                      backgroundColor: selected ? meta.color : theme.colors.card,
                      borderWidth: selected ? 0 : 1.5,
                      borderColor: theme.colors.border,
                    }}
                    activeOpacity={0.75}
                  >
                    <Text style={{
                      fontFamily: theme.fonts.display, fontWeight: '700', fontSize: 17, letterSpacing: -0.3,
                      color: selected ? '#fff' : theme.colors.text,
                    }}>{tag.name}</Text>
                    {meta.subtitle ? (
                      <Text style={{
                        fontFamily: theme.fonts.body, fontSize: 12,
                        color: selected ? 'rgba(255,255,255,0.75)' : theme.colors.subtext,
                        marginTop: 2,
                      }}>{meta.subtitle}</Text>
                    ) : null}
                  </TouchableOpacity>
                )
              })}
            </View>
          )
        })()}

        {/* ── Section: Basic Info ── */}
        <View style={hostStyles.sectionLabel}>
          <Ionicons name="create-outline" size={14} color={theme.colors.subtext} />
          <Text style={hostStyles.sectionLabelText}>Basic Info</Text>
        </View>
        <View style={[shared.card, { marginBottom: theme.spacing.lg, gap: 0 }]}>
          <Input label="Title" value={form.title} onChangeText={v => setField('title', v)} placeholder="Event name" containerStyle={{ marginBottom: 0 }} />
          <Input label="Description" value={form.description} onChangeText={v => setField('description', v)} placeholder="What's this event about?" multiline numberOfLines={4} containerStyle={{ marginBottom: 0, marginTop: theme.spacing.sm }} />
        </View>

        {/* ── Section: When & Where ── */}
        <View style={hostStyles.sectionLabel}>
          <Ionicons name="location-outline" size={14} color={theme.colors.subtext} />
          <Text style={hostStyles.sectionLabelText}>When & Where</Text>
        </View>
        <View style={[shared.card, { marginBottom: theme.spacing.lg, gap: theme.spacing.md }]}>

          <View>
            <Text style={shared.label}>Location</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
              {LOCATIONS.map(loc => {
                const active = locationId === loc.id
                return (
                  <TouchableOpacity
                    key={loc.id}
                    onPress={() => selectLocation(loc.id)}
                    style={[hostStyles.chip, active && hostStyles.chipActive]}
                  >
                    <Text style={[hostStyles.chipText, active && hostStyles.chipTextActive]}>{loc.label}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
            {locationId === 'other' && (
              <View style={{ marginTop: theme.spacing.sm }}>
                <Input label="" value={form.location} onChangeText={v => setField('location', v)} placeholder="Enter location" containerStyle={{ marginBottom: 0 }} />
              </View>
            )}
          </View>

          <View>
            <DatePickerField value={form.date} onChange={d => {
              setField('date', d)
              if (!recurrence.enabled) setRecurrence(prev => ({ ...prev, endDate: defaultEndDate(d) }))
            }} />
          </View>

          <View>
            <Text style={shared.label}>Duration</Text>
            <View style={{ alignItems: 'flex-start' }}>
            <TouchableOpacity
              onPress={() => setDurationModalOpen(true)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm + 2, backgroundColor: theme.colors.card }}
            >
              <Text style={{ fontSize: theme.font.size.md, color: theme.colors.text, fontWeight: theme.font.weight.medium }}>
                {DURATION_OPTIONS.find(o => o.minutes === form.durationMinutes)?.label ?? 'Select'}
              </Text>
              <Ionicons name="chevron-down" size={16} color={theme.colors.subtext} />
            </TouchableOpacity>
            </View>
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

          {/* Recurrence — hidden in edit mode */}
          {!isEdit && (
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={shared.label}>Repeat</Text>
                <Switch
                  value={recurrence.enabled}
                  onValueChange={v => setRecurrence(prev => ({ ...prev, enabled: v }))}
                  trackColor={{ false: theme.colors.border, true: theme.colors.primary + '80' }}
                  thumbColor={recurrence.enabled ? theme.colors.primary : theme.colors.subtext}
                />
              </View>
              {recurrence.enabled && (
                <View style={{ marginTop: theme.spacing.sm, gap: theme.spacing.md }}>
                  <View style={{ flexDirection: 'row', borderRadius: theme.radius.md, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.border, alignSelf: 'flex-start' }}>
                    {CADENCE_OPTIONS.map(opt => (
                      <TouchableOpacity
                        key={opt.value}
                        onPress={() => setRecurrence(prev => ({ ...prev, cadence: opt.value }))}
                        style={{ paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs, backgroundColor: recurrence.cadence === opt.value ? theme.colors.primary : 'transparent' }}
                      >
                        <Text style={{ fontSize: theme.font.size.sm, fontWeight: theme.font.weight.medium, color: recurrence.cadence === opt.value ? theme.colors.white : theme.colors.subtext }}>
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
                              <Text style={{ fontSize: theme.font.size.xs, fontWeight: theme.font.weight.semibold, color: active ? theme.colors.white : theme.colors.subtext }}>
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
                    <Text style={[shared.caption, { color: theme.colors.primary }]}>
                      {eventCount} event{eventCount !== 1 ? 's' : ''} will be created
                    </Text>
                  )}
                </View>
              )}
            </View>
          )}
        </View>

        {/* ── Section: Details ── */}
        <View style={hostStyles.sectionLabel}>
          <Ionicons name="options-outline" size={14} color={theme.colors.subtext} />
          <Text style={hostStyles.sectionLabelText}>Details</Text>
        </View>
        <View style={[shared.card, { marginBottom: theme.spacing.lg, gap: theme.spacing.md }]}>

          {/* Max attendees — styled snap slider */}
          {(() => {
            const STOPS: Array<{ label: string; value: number | null }> = [
              { label: '6',  value: 6    },
              { label: '16', value: 16   },
              { label: '24', value: 24   },
              { label: '∞',  value: null },
            ]
            const activeIdx = STOPS.findIndex(s => s.value === form.maxAttendees)
            const thumbPct = activeIdx < 0 ? 0 : activeIdx / (STOPS.length - 1)
            return (
              <View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                  <Text style={shared.label}>Max players</Text>
                  <Text style={{ fontFamily: theme.fonts.display, fontWeight: '700', fontSize: 20, color: theme.colors.text, letterSpacing: -0.4 }}>
                    {form.maxAttendees === null ? '∞' : form.maxAttendees}
                  </Text>
                </View>
                {/* Track + thumb */}
                <View style={{ height: 6, backgroundColor: theme.colors.border, borderRadius: 3, marginBottom: 10, position: 'relative' }}>
                  <View style={{ width: `${thumbPct * 100}%` as any, height: '100%', backgroundColor: theme.colors.primary, borderRadius: 3 }} />
                  {activeIdx >= 0 && (
                    <View style={{
                      position: 'absolute',
                      left: `${thumbPct * 100}%` as any,
                      top: '50%',
                      marginLeft: -9,
                      marginTop: -9,
                      width: 18, height: 18, borderRadius: 9,
                      backgroundColor: theme.colors.card,
                      borderWidth: 3, borderColor: theme.colors.primary,
                    }} />
                  )}
                </View>
                {/* Tap targets */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  {STOPS.map((stop, i) => (
                    <TouchableOpacity
                      key={stop.label}
                      onPress={() => setField('maxAttendees', stop.value)}
                      style={{ paddingVertical: 4, paddingHorizontal: 6, alignItems: 'center' }}
                      hitSlop={8}
                    >
                      <Text style={{
                        fontFamily: theme.fonts.bodySemiBold,
                        fontSize: 10,
                        color: i === activeIdx ? theme.colors.primary : theme.colors.subtext,
                        fontWeight: i === activeIdx ? '700' : '600',
                      }}>{stop.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )
          })()}

          {/* Price */}
          <View>
            <Text style={shared.label}>Price (optional)</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, overflow: 'hidden', backgroundColor: theme.colors.background }}>
              <View style={{ paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.sm + 2, borderRightWidth: 1, borderRightColor: theme.colors.border }}>
                <Text style={{ fontSize: theme.font.size.md, color: theme.colors.subtext, fontWeight: theme.font.weight.medium }}>$</Text>
              </View>
              <TextInput
                value={form.price != null ? String(form.price) : ''}
                onChangeText={v => {
                  const trimmed = v.replace(/[^0-9.]/g, '')
                  if (trimmed === '' || trimmed === '.') { setField('price', null); return }
                  const n = parseFloat(trimmed)
                  setField('price', isNaN(n) ? null : n)
                }}
                placeholder="0.00  (leave blank for free)"
                placeholderTextColor={theme.colors.subtext}
                keyboardType="decimal-pad"
                style={{
                  flex: 1,
                  paddingHorizontal: theme.spacing.sm,
                  paddingVertical: theme.spacing.sm + 2,
                  fontSize: theme.font.size.md,
                  color: theme.colors.text,
                  ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
                }}
              />
            </View>
          </View>

          {/* Tags */}
          {availableTags.length > 0 && (() => {
            const byCategory = availableTags.reduce<Record<string, Tag[]>>((acc, tag) => {
              if (tag.category === 'event_type') return acc
              ;(acc[tag.category] ??= []).push(tag)
              return acc
            }, {})
            return Object.entries(byCategory).map(([category, tags]) => (
              <View key={category}>
                <Text style={shared.label}>
                  {category.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
                  {tags.map(tag => {
                    const active = selectedTagIds.includes(tag.id)
                    return (
                      <TouchableOpacity
                        key={tag.id}
                        onPress={() => toggleTag(tag.id)}
                        style={[hostStyles.chip, active && hostStyles.chipActive]}
                      >
                        <Text style={[hostStyles.chipText, active && hostStyles.chipTextActive]}>{tag.name}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </View>
            ))
          })()}

          {/* Club */}
          {ownedClubs.length > 0 && (
            <View>
              <Text style={shared.label}>Club (optional)</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
                {ownedClubs.map(club => {
                  const active = selectedClubId === club.id
                  return (
                    <TouchableOpacity
                      key={club.id}
                      onPress={() => setSelectedClubId(active ? null : club.id)}
                      style={[hostStyles.chip, active && hostStyles.chipActive]}
                    >
                      <Text style={[hostStyles.chipText, active && hostStyles.chipTextActive]}>{club.name}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>
          )}

          {/* Save as template */}
          {!isEdit && (
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={shared.label}>Save as template</Text>
                <Switch
                  value={saveAsTemplate}
                  onValueChange={setSaveAsTemplate}
                  trackColor={{ false: theme.colors.border, true: theme.colors.primary + '80' }}
                  thumbColor={saveAsTemplate ? theme.colors.primary : theme.colors.subtext}
                />
              </View>
              {saveAsTemplate && (
                <View style={{ marginTop: theme.spacing.sm }}>
                  <Input
                    label=""
                    value={templateName}
                    onChangeText={setTemplateName}
                    placeholder={form.title || 'Template name'}
                    containerStyle={{ marginBottom: 0 }}
                  />
                </View>
              )}
            </View>
          )}
        </View>

        <Button
          label={isEdit ? 'Save changes' : (eventCount > 1 ? `Create ${eventCount} events` : 'Create event')}
          onPress={handleSubmit}
          loading={loading}
          disabled={!form.title || !userId}
        />
      </ScrollView>
    </>
  )
}

const hostStyles = StyleSheet.create({
  sectionLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  sectionLabelText: {
    fontFamily: theme.fonts.bodySemiBold,
    fontSize: theme.font.size.xs,
    color: theme.colors.subtext,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
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
