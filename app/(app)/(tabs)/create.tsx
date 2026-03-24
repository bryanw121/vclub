import { useState } from 'react'
import { ScrollView, Alert, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import DateTimePicker from '@react-native-community/datetimepicker'
import { supabase } from '../../../lib/supabase'
import { Button } from '../../../components/Button'
import { Input } from '../../../components/Input'
import { shared } from '../../../constants'

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
  const [maxAttendees, setMaxAttendees] = useState('')
  const [loading, setLoading] = useState(false)

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
        max_attendees: maxAttendees ? parseInt(maxAttendees) : null,
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
      <Input label="Description" value={description} onChangeText={setDescription} placeholder="What's this event about?" multiline numberOfLines={4} />
      <Input label="Location" value={location} onChangeText={setLocation} placeholder="Where is it?" />

      <View style={shared.inputContainer}>
        <Text style={shared.label}>Date</Text>
        <DateTimePicker
          value={date}
          mode="date"
          display="spinner"
          minimumDate={new Date()}
          onChange={(event, selectedDate) => {
            if (selectedDate) setDate(selectedDate)
          }}
        />
      </View>

      <View style={shared.inputContainer}>
        <Text style={shared.label}>Time</Text>
        <DateTimePicker
          value={date}
          mode="time"
          display="spinner"
          onChange={(event, selectedDate) => {
            if (selectedDate) setDate(selectedDate)
          }}
        />
      </View>

      <Input label="Max Attendees (optional)" value={maxAttendees} onChangeText={setMaxAttendees} placeholder="Leave blank for unlimited" />
      <Button label="Create event" onPress={handleCreate} loading={loading} disabled={!title} />
    </ScrollView>
  )
}
