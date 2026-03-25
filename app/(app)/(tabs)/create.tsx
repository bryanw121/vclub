import { useState, useRef } from 'react'
import { ScrollView, Alert, Text, View, Pressable } from 'react-native'
import { useTabsContext } from '../../../contexts/tabs'
import { supabase } from '../../../lib/supabase'
import { Button } from '../../../components/Button'
import { Input } from '../../../components/Input'
import { DatePickerField } from '../../../components/DatePickerField'
import { shared } from '../../../constants'
import { cleanDate } from '../../../utils'
import { CreateEventForm } from '../../../types'

const EMPTY_FORM: CreateEventForm = {
  title: '',
  description: '',
  location: '',
  date: new Date(),
  maxAttendees: null,
}

export default function CreateEvent() {
  const { goToTab } = useTabsContext()
  const [form, setForm] = useState<CreateEventForm>({
    title: '',
    description: '',
    location: '',
    date: new Date(),
    maxAttendees: null,
  })
  const [loading, setLoading] = useState(false)
  // Tracks whether the stepper is being held — used to lock ScrollView scrolling
  // so the parent scroll gesture doesn't steal the touch and prevent onPressOut from firing
  const [holding, setHolding] = useState(false)

  // Refs used to implement hold-to-repeat on the stepper buttons
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function setField<K extends keyof CreateEventForm>(key: K, value: CreateEventForm[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
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
      goToTab(0)
    } catch (e: any) {
      Alert.alert('Error', e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScrollView style={shared.screen} contentContainerStyle={shared.scrollContent} scrollEnabled={!holding}>

      <Input label="Title" value={form.title} onChangeText={v => setField('title', v)} placeholder="Event name" />
      <Input label="Description" value={form.description} onChangeText={v => setField('description', v)} placeholder="What's this event about?" multiline numberOfLines={4} />
      <Input label="Location" value={form.location} onChangeText={v => setField('location', v)} placeholder="Where is it?" />

      <DatePickerField value={form.date} onChange={d => setField('date', d)} />

      {/* Max attendees stepper — hold to increment/decrement quickly */}
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

      <Button label="Create event" onPress={handleCreate} loading={loading} disabled={!form.title} />

    </ScrollView>
  )
}
