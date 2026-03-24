import { useState, useRef } from 'react'
import { ScrollView, Alert, Text, View, StyleSheet, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import DateTimePicker from '@react-native-community/datetimepicker'
import { supabase } from '../../../lib/supabase'
import { Button } from '../../../components/Button'
import { Input } from '../../../components/Input'
import { shared, theme } from '../../../constants'

function cleanDate(d: Date) {
  const clean = new Date(d)
  clean.setSeconds(0, 0)
  return clean.toISOString()
}

export default function CreateEvent() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [date, setDate] = useState<Date>(new Date())
  const [maxAttendees, setMaxAttendees] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function increment() {
    setMaxAttendees(prev => (prev === null ? 1 : prev + 1))
  }

  function decrement() {
    setMaxAttendees(prev => {
      if (prev === null || prev <= 1) return null
      return prev - 1
    })
  }

  function startHold(action: 'increment' | 'decrement') {
    action === 'increment' ? increment() : decrement()
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        action === 'increment' ? increment() : decrement()
      }, 80)
    }, 400)
  }

  function stopHold() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (intervalRef.current) clearInterval(intervalRef.current)
  }

  async function handleCreate() {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in')

      const { error } = await supabase.from('events').insert({
        title,
        description,
        location,
        event_date: cleanDate(date),
        max_attendees: maxAttendees,
        created_by: user.id,
      })

      if (error) throw error
      Alert.alert('Success', 'Event created!')
      router.replace('/(app)/(tabs)')
    } catch (e: any) {
      Alert.alert('Error', e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScrollView style={shared.screen} contentContainerStyle={shared.scrollContent}>
      <Input label="Title" value={title} onChangeText={setTitle} placeholder="Event name" />
      <Input
        label="Description"
        value={description}
        onChangeText={setDescription}
        placeholder="What's this event about?"
        multiline
        numberOfLines={4}
      />
      <Input label="Location" value={location} onChangeText={setLocation} placeholder="Where is it?" />

      <View style={shared.inputContainer}>
        <Text style={shared.label}>Date & Time</Text>
        <View style={styles.pickerBox}>
          <View style={styles.pickerRow}>
            <View style={styles.pickerItem}>
              <Text style={styles.pickerLabel}>Date</Text>
              <DateTimePicker
                value={date}
                mode="date"
                display="compact"
                minimumDate={new Date()}
                themeVariant="light"
                onChange={(event, selectedDate) => {
                  if (selectedDate) setDate(selectedDate)
                }}
              />
            </View>
            <View style={styles.pickerDivider} />
            <View style={styles.pickerItem}>
              <Text style={styles.pickerLabel}>Time</Text>
              <DateTimePicker
                value={date}
                mode="time"
                display="compact"
                themeVariant="light"
                onChange={(event, selectedDate) => {
                  if (selectedDate) setDate(selectedDate)
                }}
              />
            </View>
          </View>
        </View>
      </View>

      <View style={shared.inputContainer}>
        <Text style={shared.label}>Max Attendees (optional)</Text>
        <View style={styles.stepper}>
          <Pressable
            style={[styles.stepperBtn, maxAttendees === null && styles.stepperBtnDisabled]}
            onPressIn={() => startHold('decrement')}
            onPressOut={stopHold}
            disabled={maxAttendees === null}
          >
            <Text style={styles.stepperBtnText}>−</Text>
          </Pressable>
          <Text style={styles.stepperValue}>
            {maxAttendees === null ? 'Unlimited' : maxAttendees}
          </Text>
          <Pressable
            style={styles.stepperBtn}
            onPressIn={() => startHold('increment')}
            onPressOut={stopHold}
          >
            <Text style={styles.stepperBtnText}>+</Text>
          </Pressable>
        </View>
      </View>

      <Button label="Create event" onPress={handleCreate} loading={loading} disabled={!title} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  pickerBox: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pickerItem: {
    flex: 1,
    alignItems: 'flex-start',
    gap: theme.spacing.xs,
  },
  pickerLabel: {
    fontSize: theme.font.size.xs,
    fontWeight: theme.font.weight.medium,
    color: theme.colors.subtext,
  },
  pickerDivider: {
    width: 1,
    height: 40,
    backgroundColor: theme.colors.border,
    marginHorizontal: theme.spacing.md,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  stepperBtn: {
    width: 56,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
  },
  stepperBtnDisabled: {
    opacity: 0.3,
  },
  stepperBtnText: {
    fontSize: theme.font.size.xl,
    color: theme.colors.primary,
    fontWeight: theme.font.weight.medium,
  },
  stepperValue: {
    flex: 1,
    textAlign: 'center',
    fontSize: theme.font.size.md,
    fontWeight: theme.font.weight.medium,
    color: theme.colors.text,
  },
})
