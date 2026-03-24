import { useEffect, useState } from 'react'
import { View, Text, Alert } from 'react-native'
import { supabase } from '../../../../lib/supabase'
import { Button } from '../../../../components/Button'
import { shared } from '../../../../constants'
import { Profile } from '../../../../types'

export default function MyProfile() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchProfile()
  }, [])

  async function fetchProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (!error) setProfile(data as Profile)
    setLoading(false)
  }

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut()
    if (error) Alert.alert('Error', error.message)
  }

  if (loading || !profile) return null

  return (
    <View style={shared.screenPadded}>
      <Text style={[shared.heading, shared.mb_xs]}>{profile.username}</Text>
      <Text style={[shared.caption, shared.mb_xl]}>
        joined {new Date(profile.created_at).toLocaleDateString()}
      </Text>
      <Button label="Sign out" onPress={handleSignOut} variant="secondary" />
    </View>
  )
}
