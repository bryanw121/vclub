import { useEffect, useState } from 'react'
import { View, Text } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { supabase } from '../../../../lib/supabase'
import { shared } from '../../../../constants'
import { Profile } from '../../../../types'

export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (!error) setProfile(data as Profile)
        setLoading(false)
      })
  }, [id])

  if (loading || !profile) return null

  return (
    <View style={shared.screenPadded}>
      <Text style={[shared.heading, shared.mb_xs]}>{profile.username}</Text>
      <Text style={[shared.caption, shared.mb_xl]}>
        joined {new Date(profile.created_at).toLocaleDateString()}
      </Text>
    </View>
  )
}
