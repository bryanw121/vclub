import React, { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, ScrollView, Text, View, Pressable, TouchableOpacity, Switch, Modal, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { Button } from '../../components/Button'
import { Input } from '../../components/Input'
import { DatePickerField } from '../../components/DatePickerField'
import { shared, theme, LOCATIONS, DAY_LABELS_SHORT } from '../../constants'
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
  maxAttendees: null,
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
    maxAttendees: maxAttendeesParam ? parseInt(maxAttendeesParam, 10) : null,
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
  const [holding, setHolding] = useState(false)

  // Save as template
  const [saveAsTemplate, setSaveAsTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')

  // Template picker
  const [userTemplates, setUserTemplates] = useState<UserEventTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)

  // Tags
  const [availableTags, setAvailableTags] = useState<Tag[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])

  // Edit loading
  const [editLoading, setEditLoading] = useState(isEdit)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef  = useRef<ReturnType<typeof setTimeout>  | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id)
    })
    supabase
      .from('tags')
      .select('*')
      .order('display_order', { ascending: true })
      .then(({ data }) => setAvailableTags((data ?? []) as Tag[]))

    if (editId) loadEventForEdit(editId)
  }, [])

  async function loadEventForEdit(id: string) {
    try {
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
        maxAttendees: data.max_attendees,
      })
      if (loc) {
        setLocationId(loc.id)
      } else if (data.location) {
        setLocationId('other')
      }
      setSelectedTagIds((data.event_tags ?? []).map((et: any) => et.tag_id))
    } finally {
      setEditLoading(false)
    }
  }

  useEffect(() => {
    if (view === 'templates') fetchUserTemplates()
  }, [view])

  async function fetchUserTemplates() {
    setTemplatesLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setTemplatesLoading(false); return }
    const { data } = await supabase
      .from('user_event_templates')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    setUserTemplates((data ?? []) as UserEventTemplate[])
    setTemplatesLoading(false)
  }

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

  function incrementAttendees() {
    setForm(prev => ({ ...prev, maxAttendees: prev.maxAttendees === null ? 1 : prev.maxAttendees + 1 }))
  }
  function decrementAttendees() {
    setForm(prev => ({ ...prev, maxAttendees: prev.maxAttendees === null || prev.maxAttendees <= 1 ? null : prev.maxAttendees - 1 }))
  }
  function startHold(action: () => void) {
    setHolding(true)
    action()
    timeoutRef.current = setTimeout(() => { intervalRef.current = setInterval(action, 80) }, 400)
  }
  function stopHold() {
    setHolding(false)
    clearTimeout(timeoutRef.current as any)
    clearInterval(intervalRef.current as any)
    timeoutRef.current = null
    intervalRef.current = null
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
            max_attendees: form.maxAttendees,
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
          max_attendees: form.maxAttendees,
          created_by: user.id,
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
      }
    } catch (e: any) {
      setSuccessMessage(e.message)
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
      <ScrollView style={shared.screen} contentContainerStyle={shared.scrollContent}>
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
  if (editLoading) {
    return <View style={shared.centered}><ActivityIndicator color={theme.colors.primary} /></View>
  }

  return (
    <>
      <Stack.Screen options={{
        title: 'Host Event',
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
            <TouchableOpacity style={shared.modalButton} onPress={() => { setSuccessModal(false); router.back() }}>
              <Text style={shared.modalButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <ScrollView style={shared.screen} contentContainerStyle={shared.scrollContent} scrollEnabled={!holding}>
        <Text style={[shared.subheading, shared.mb_md]}>{isEdit ? 'Edit event' : 'Host an event'}</Text>

        <Input label="Title" value={form.title} onChangeText={v => setField('title', v)} placeholder="Event name" />
        <Input label="Description" value={form.description} onChangeText={v => setField('description', v)} placeholder="What's this event about?" multiline numberOfLines={4} />

        {/* ── Location chips ── */}
        <View style={shared.inputContainer}>
          <Text style={shared.label}>Location</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
            {LOCATIONS.map(loc => {
              const active = locationId === loc.id
              return (
                <TouchableOpacity
                  key={loc.id}
                  onPress={() => selectLocation(loc.id)}
                  style={{
                    paddingHorizontal: theme.spacing.md,
                    paddingVertical: theme.spacing.xs,
                    borderRadius: theme.radius.full,
                    borderWidth: 1.5,
                    borderColor: active ? theme.colors.primary : theme.colors.border,
                    backgroundColor: active ? theme.colors.primary + '18' : 'transparent',
                  }}
                >
                  <Text style={{ fontSize: theme.font.size.sm, fontWeight: theme.font.weight.medium, color: active ? theme.colors.primary : theme.colors.subtext }}>
                    {loc.label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
          {locationId === 'other' && (
            <View style={{ marginTop: theme.spacing.sm }}>
              <Input label="" value={form.location} onChangeText={v => setField('location', v)} placeholder="Enter location" />
            </View>
          )}
        </View>

        <DatePickerField value={form.date} onChange={d => {
          setField('date', d)
          if (!recurrence.enabled) setRecurrence(prev => ({ ...prev, endDate: defaultEndDate(d) }))
        }} />

        {/* ── Recurrence — hidden in edit mode ── */}
        {!isEdit && <>
        <View style={shared.inputContainer}>
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

        </>}

        {/* ── Max Attendees ── */}
        <View style={shared.inputContainer}>
          <Text style={shared.label}>Max Attendees (optional)</Text>
          <View style={shared.stepper}>
            <Pressable
              style={[shared.stepperBtn, form.maxAttendees === null && shared.stepperBtnDisabled]}
              onPressIn={() => startHold(decrementAttendees)}
              onPressOut={stopHold}
              disabled={form.maxAttendees === null}
            >
              <Text style={shared.stepperBtnText}>−</Text>
            </Pressable>
            <Text style={shared.stepperValue}>{form.maxAttendees === null ? 'Unlimited' : form.maxAttendees}</Text>
            <Pressable style={shared.stepperBtn} onPressIn={() => startHold(incrementAttendees)} onPressOut={stopHold}>
              <Text style={shared.stepperBtnText}>+</Text>
            </Pressable>
          </View>
        </View>

        {/* ── Tags ── */}
        {availableTags.length > 0 && (() => {
          const byCategory = availableTags.reduce<Record<string, Tag[]>>((acc, tag) => {
            ;(acc[tag.category] ??= []).push(tag)
            return acc
          }, {})
          return Object.entries(byCategory).map(([category, tags]) => (
            <View key={category} style={shared.inputContainer}>
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
                      style={{
                        paddingHorizontal: theme.spacing.md,
                        paddingVertical: theme.spacing.xs,
                        borderRadius: theme.radius.full,
                        borderWidth: 1.5,
                        borderColor: active ? theme.colors.primary : theme.colors.border,
                        backgroundColor: active ? theme.colors.primary + '18' : 'transparent',
                      }}
                    >
                      <Text style={{ fontSize: theme.font.size.sm, fontWeight: theme.font.weight.medium, color: active ? theme.colors.primary : theme.colors.subtext }}>
                        {tag.name}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>
          ))
        })()}

        {/* ── Save as Template — hidden in edit mode ── */}
        {!isEdit && (
          <View style={shared.inputContainer}>
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
                />
              </View>
            )}
          </View>
        )}

        <View style={shared.mb_md}>
          <Button
            label={isEdit ? 'Save changes' : (eventCount > 1 ? `Create ${eventCount} events` : 'Create event')}
            onPress={handleSubmit}
            loading={loading}
            disabled={!form.title || !userId}
          />
        </View>
      </ScrollView>
    </>
  )
}
