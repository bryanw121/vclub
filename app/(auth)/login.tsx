import { useState } from 'react'
import { View, Text, TouchableOpacity, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { Button } from '../../components/Button'
import { Input } from '../../components/Input'
import { shared } from '../../constants'

export default function Login() {
  const router = useRouter()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    try {
      setLoading(true)

      const normalized = identifier.toLowerCase().trim()
      const isEmail = normalized.includes('@')
      let email = normalized

      if (!isEmail) {
        const { data, error } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', normalized)
          .single()

        if (error || !data) throw new Error('Username not found')

        const { data: userData, error: userError } = await supabase
          .rpc('get_email_by_user_id', { user_id: data.id })

        if (userError || !userData) throw new Error('Could not find account')
        email = userData
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
    } catch (e: any) {
      Alert.alert('Error', e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={shared.authContainer}>
      <Text style={shared.authTitle}>vclub</Text>
      <Text style={shared.authSubtitle}>sign in to continue</Text>
      <Input
        label="Email or username"
        value={identifier}
        onChangeText={setIdentifier}
        placeholder="you@example.com or yourname"
      />
      <Input
        label="Password"
        value={password}
        onChangeText={setPassword}
        placeholder="••••••••"
        secureTextEntry
      />
      <Button label="Sign in" onPress={handleLogin} loading={loading} disabled={!identifier || !password} />
      <TouchableOpacity style={shared.authLink} onPress={() => router.push('/(auth)/register')}>
        <Text style={shared.authLinkText}>don't have an account? sign up</Text>
      </TouchableOpacity>
    </View>
  )
}
