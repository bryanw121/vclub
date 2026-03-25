import React, { useEffect, useRef, useState } from 'react'
import { ScrollView, Alert, Text, View, Pressable, ActivityIndicator } from 'react-native'
import { supabase } from '../../../lib/supabase'
import { Button } from '../../../components/Button'
import { Input } from '../../../components/Input'
import { DatePickerField } from '../../../components/DatePickerField'
import { EventCard } from '../../../components/EventCard'
import { shared } from '../../../constants'
import { cleanDate } from '../../../utils'
import { CreateEventForm, EventWithDetails } from '../../../types'

const EMPTY_FORM: CreateEventForm = {
  title: '',
  description: '',
  location: '',
  date: new Date(),
  maxAttendees: null,
}

const HOSTED_EVENTS_LIMIT = 5
type CreateTabView = 'upcoming' | 'past' | 'form'

export default function CreateEvent() {
  const [view, setView] = useState<CreateTabView>('upcoming')
  const [form, setForm] = useState<CreateEventForm>(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const [eventsLoading, setEventsLoading] = useState(true)
  const [eventsError, setEventsError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [upcomingHostedEvents, setUpcomingHostedEvents] = useState<EventWithDetails[]>([])
  const [pastHostedEvents, setPastHostedEvents] = useState<EventWithDetails[]>([])
  // Tracks whether the stepper is being held — used to lock ScrollView scrolling
  // so the parent scroll gesture doesn't steal the touch and prevent onPressOut from firing
  const [holding, setHolding] = useState(false)

  // Refs used to implement hold-to-repeat on the stepper buttons
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function setField<K extends keyof CreateEventForm>(key: K, value: CreateEventForm[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  useEffect(() => {
    fetchHostedEvents()
  }, [])

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

  // Fires once immediately, then repeats after a short delay (like a keyboard hold)
  function startHold(action: () => void) {
    setHolding(true)
    action()
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(action, 80)
    }, 400)
  }

  // Always clears both timers unconditionally — clearTimeout/clearInterval are
  // safe to call with any value, so no need to check first
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

      const { error } = await supabase.from('events').insert({
        title: form.title,
        description: form.description,
        location: form.location,
        event_date: cleanDate(form.date),
        max_attendees: form.maxAttendees,
        created_by: user.id,
      })
      if (error) throw error

      setForm(EMPTY_FORM)
      Alert.alert('Success', 'Event created!')
      await fetchHostedEvents()
      setView('upcoming')
    } catch (e: any) {
      Alert.alert('Error', e.message)
    } finally {
      setLoading(false)
    }
  }

  const upcomingVisible = upcomingHostedEvents.slice(0, HOSTED_EVENTS_LIMIT)
  const pastVisible = pastHostedEvents.slice(0, HOSTED_EVENTS_LIMIT)
  const upcomingOverflowCount = Math.max(0, upcomingHostedEvents.length - HOSTED_EVENTS_LIMIT)
  const pastOverflowCount = Math.max(0, pastHostedEvents.length - HOSTED_EVENTS_LIMIT)

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
          <Pressable style={shared.mb_md} onPress={() => setView('past')}>
            <Text style={shared.primaryText}>View past hosted events</Text>
          </Pressable>
          {eventsLoading ? (
            <ActivityIndicator />
          ) : eventsError ? (
            <Text style={shared.errorText}>{eventsError}</Text>
          ) : (
            renderHostedEventsList(upcomingVisible, upcomingOverflowCount, 'No upcoming events created yet.')
          )}
        </ScrollView>
        <View style={shared.floatingButtonWrap}>
          <Button label="Create Event" onPress={() => setView('form')} />
        </View>
      </View>
    )
  }

  function renderPastView() {
    return (
      <ScrollView style={shared.screen} contentContainerStyle={shared.scrollContent}>
        <Text style={[shared.subheading, shared.mb_md]}>Your past hosted events</Text>
        {eventsLoading ? (
          <ActivityIndicator />
        ) : eventsError ? (
          <Text style={shared.errorText}>{eventsError}</Text>
        ) : (
          renderHostedEventsList(pastVisible, pastOverflowCount, 'No past events found.')
        )}
        <View style={shared.mt_lg}>
          <Button label="Back to upcoming hosted events" onPress={() => setView('upcoming')} variant="secondary" />
        </View>
      </ScrollView>
    )
  }

  function renderCreateFormView() {
    return (
      <ScrollView style={shared.screen} contentContainerStyle={shared.scrollContent} scrollEnabled={!holding}>
        <Text style={[shared.subheading, shared.mb_md]}>Create event</Text>

        <Input label="Title" value={form.title} onChangeText={v => setField('title', v)} placeholder="Event name" />
        <Input label="Description" value={form.description} onChangeText={v => setField('description', v)} placeholder="What's this event about?" multiline numberOfLines={4} />
        <Input label="Location" value={form.location} onChangeText={v => setField('location', v)} placeholder="Where is it?" />

        <DatePickerField value={form.date} onChange={d => setField('date', d)} />

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
          <Button label="Create event" onPress={handleCreate} loading={loading} disabled={!form.title || !userId} />
        </View>
        <Button label="Back to upcoming hosted events" onPress={() => setView('upcoming')} variant="secondary" />
      </ScrollView>
    )
  }

  if (view === 'form') return renderCreateFormView()
  if (view === 'past') return renderPastView()
  return renderUpcomingView()
}
