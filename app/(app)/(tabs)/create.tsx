import React, { useEffect, useRef, useState } from 'react'
import { ScrollView, Alert, Text, View, Pressable, ActivityIndicator, TouchableOpacity, Switch } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../../lib/supabase'
import { Button } from '../../../components/Button'
import { Input } from '../../../components/Input'
import { DatePickerField } from '../../../components/DatePickerField'
import { EventCard } from '../../../components/EventCard'
import { shared, theme, LOCATIONS, EVENT_TEMPLATES, DAY_LABELS_SHORT } from '../../../constants'
import type { RecurrenceCadence } from '../../../constants'
import { cleanDate } from '../../../utils'
import { CreateEventForm, EventWithDetails } from '../../../types'

const EMPTY_FORM: CreateEventForm = {
  title: '',
  description: '',
  location: '',
  date: new Date(),
  maxAttendees: null,
}

const CADENCE_OPTIONS: { value: RecurrenceCadence; label: string }[] = [
  { value: 'weekly',   label: 'Weekly'    },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'monthly',  label: 'Monthly'   },
]

const HOSTED_EVENTS_LIMIT = 5
type CreateTabView = 'upcoming' | 'past' | 'form'

function defaultEndDate(from: Date): Date {
  const d = new Date(from)
  d.setDate(d.getDate() + 28) // 4 weeks out
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

  // Align to the Sunday of the start-date's week
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

export default function CreateEvent() {
  const [view, setView] = useState<CreateTabView>('upcoming')
  const [form, setForm] = useState<CreateEventForm>(EMPTY_FORM)
  const [locationId, setLocationId] = useState('')
  const [recurrence, setRecurrence] = useState({
    enabled: false,
    days: [] as number[],
    cadence: 'weekly' as RecurrenceCadence,
    endDate: defaultEndDate(new Date()),
  })

  const [loading, setLoading] = useState(false)
  const [eventsLoading, setEventsLoading] = useState(true)
  const [eventsError, setEventsError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [upcomingHostedEvents, setUpcomingHostedEvents] = useState<EventWithDetails[]>([])
  const [pastHostedEvents, setPastHostedEvents] = useState<EventWithDetails[]>([])
  // Tracks whether the stepper is being held — used to lock ScrollView scrolling
  // so the parent scroll gesture doesn't steal the touch and prevent onPressOut from firing
  const [holding, setHolding] = useState(false)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef  = useRef<ReturnType<typeof setTimeout>  | null>(null)

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

  function applyTemplate(templateId: string) {
    const t = EVENT_TEMPLATES.find(t => t.id === templateId)
    if (!t) return
    setForm(prev => ({
      ...prev,
      title: t.title,
      description: t.description,
      maxAttendees: t.maxAttendees,
    }))
    selectLocation(t.locationId || '')
  }

  function toggleRecurrenceDay(dayIdx: number) {
    setRecurrence(prev => {
      const already = prev.days.includes(dayIdx)
      return { ...prev, days: already ? prev.days.filter(d => d !== dayIdx) : [...prev.days, dayIdx] }
    })
  }

  useEffect(() => { fetchHostedEvents() }, [])

  async function fetchHostedEvents() {
    try {
      setEventsLoading(true)
      setEventsError(null)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in')
      setUserId(user.id)

      const now = new Date().toISOString()
      const [upcomingRes, pastRes] = await Promise.all([
        supabase
          .from('events')
          .select(`*, profiles!events_created_by_fkey (id, username, avatar_url), event_attendees (event_id, user_id, joined_at)`)
          .eq('created_by', user.id)
          .gte('event_date', now)
          .order('event_date', { ascending: true })
          .limit(HOSTED_EVENTS_LIMIT + 1),
        supabase
          .from('events')
          .select(`*, profiles!events_created_by_fkey (id, username, avatar_url), event_attendees (event_id, user_id, joined_at)`)
          .eq('created_by', user.id)
          .lt('event_date', now)
          .order('event_date', { ascending: false })
          .limit(HOSTED_EVENTS_LIMIT + 1),
      ])
      if (upcomingRes.error) throw upcomingRes.error
      if (pastRes.error) throw pastRes.error
      setUpcomingHostedEvents((upcomingRes.data ?? []) as EventWithDetails[])
      setPastHostedEvents((pastRes.data ?? []) as EventWithDetails[])
    } catch (e: any) {
      setEventsError(e.message)
    } finally {
      setEventsLoading(false)
    }
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

  async function handleCreate() {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in')

      const dates = generateEventDates(
        form.date,
        recurrence.enabled,
        recurrence.days,
        recurrence.cadence,
        recurrence.endDate,
      )

      if (dates.length === 0) {
        Alert.alert('No dates', 'The recurrence settings produced no valid dates. Check the end date.')
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

      const { error } = await supabase.from('events').insert(rows)
      if (error) throw error

      setForm(EMPTY_FORM)
      setLocationId('')
      setRecurrence({ enabled: false, days: [], cadence: 'weekly', endDate: defaultEndDate(new Date()) })

      Alert.alert('Success', dates.length > 1 ? `${dates.length} events created!` : 'Event created!')
      await fetchHostedEvents()
      setView('upcoming')
    } catch (e: any) {
      Alert.alert('Error', e.message)
    } finally {
      setLoading(false)
    }
  }

  const upcomingVisible       = upcomingHostedEvents.slice(0, HOSTED_EVENTS_LIMIT)
  const pastVisible           = pastHostedEvents.slice(0, HOSTED_EVENTS_LIMIT)
  const upcomingOverflowCount = Math.max(0, upcomingHostedEvents.length - HOSTED_EVENTS_LIMIT)
  const pastOverflowCount     = Math.max(0, pastHostedEvents.length - HOSTED_EVENTS_LIMIT)

  const eventCount = recurrence.enabled
    ? generateEventDates(form.date, true, recurrence.days, recurrence.cadence, recurrence.endDate).length
    : 1

  function renderHostedEventsList(events: EventWithDetails[], overflowCount: number, emptyText: string) {
    if (events.length === 0) return <Text style={shared.caption}>{emptyText}</Text>
    return (
      <>
        {events.map(event => <EventCard key={event.id} event={event} />)}
        {overflowCount > 0 && <Text style={shared.caption}>and {overflowCount} other events</Text>}
      </>
    )
  }

  function renderUpcomingView() {
    return (
      <View style={shared.screen}>
        <ScrollView contentContainerStyle={shared.scrollContentWithFloatingButton}>
          <Text style={[shared.subheading, shared.mb_md]}>Your upcoming hosted events</Text>
          {eventsLoading ? (
            <ActivityIndicator />
          ) : eventsError ? (
            <Text style={shared.errorText}>{eventsError}</Text>
          ) : (
            renderHostedEventsList(upcomingVisible, upcomingOverflowCount, 'No upcoming events created yet.')
          )}
          <TouchableOpacity onPress={() => setView('past')} style={{ marginTop: theme.spacing.lg }}>
            <Text style={shared.primaryText}>View past hosted events</Text>
          </TouchableOpacity>
        </ScrollView>
        <View style={shared.floatingButtonWrap}>
          <Button label="Create Event" onPress={() => setView('form')} />
        </View>
      </View>
    )
  }

  function renderPastView() {
    return (
      <View style={shared.screen}>
        <ScrollView contentContainerStyle={shared.scrollContent}>
          <TouchableOpacity onPress={() => setView('upcoming')} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.md }}>
            <Ionicons name="chevron-back" size={20} color={theme.colors.primary} />
            <Text style={shared.primaryText}>Back</Text>
          </TouchableOpacity>
          <Text style={[shared.subheading, shared.mb_md]}>Your past hosted events</Text>
          {eventsLoading ? (
            <ActivityIndicator />
          ) : eventsError ? (
            <Text style={shared.errorText}>{eventsError}</Text>
          ) : (
            renderHostedEventsList(pastVisible, pastOverflowCount, 'No past events found.')
          )}
        </ScrollView>
      </View>
    )
  }

  function renderCreateFormView() {
    const showDayPicker = recurrence.enabled && recurrence.cadence !== 'monthly'

    return (
      <ScrollView style={shared.screen} contentContainerStyle={shared.scrollContent} scrollEnabled={!holding}>
        <TouchableOpacity onPress={() => setView('upcoming')} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.md }}>
          <Ionicons name="chevron-back" size={20} color={theme.colors.primary} />
          <Text style={shared.primaryText}>Back</Text>
        </TouchableOpacity>
        <Text style={[shared.subheading, shared.mb_md]}>Create event</Text>

        {/* ── Templates ── */}
        <View style={shared.inputContainer}>
          <Text style={shared.label}>Quick template</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -theme.spacing.xs }}>
            <View style={{ flexDirection: 'row', gap: theme.spacing.xs, paddingHorizontal: theme.spacing.xs }}>
              {EVENT_TEMPLATES.map(t => {
                const active = form.title === t.title && locationId === t.locationId
                return (
                  <TouchableOpacity
                    key={t.id}
                    onPress={() => applyTemplate(t.id)}
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
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </ScrollView>
        </View>

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
              <Input
                label=""
                value={form.location}
                onChangeText={v => setField('location', v)}
                placeholder="Enter location"
              />
            </View>
          )}
        </View>

        <DatePickerField value={form.date} onChange={d => {
          setField('date', d)
          if (!recurrence.enabled) setRecurrence(prev => ({ ...prev, endDate: defaultEndDate(d) }))
        }} />

        {/* ── Recurrence ── */}
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

              {/* Cadence */}
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

              {/* Days of week (not shown for monthly) */}
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
                            width: 36,
                            height: 36,
                            borderRadius: 18,
                            borderWidth: 1.5,
                            borderColor: active ? theme.colors.primary : theme.colors.border,
                            backgroundColor: active ? theme.colors.primary : 'transparent',
                            alignItems: 'center',
                            justifyContent: 'center',
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

              {/* End date */}
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

        <View style={shared.mb_md}>
          <Button
            label={eventCount > 1 ? `Create ${eventCount} events` : 'Create event'}
            onPress={handleCreate}
            loading={loading}
            disabled={!form.title || !userId}
          />
        </View>
      </ScrollView>
    )
  }

  if (view === 'form') return renderCreateFormView()
  if (view === 'past') return renderPastView()
  return renderUpcomingView()
}
