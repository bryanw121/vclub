import { useState } from 'react'
import { View, Text, TouchableOpacity, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { Button } from '../../components/Button'
import { Input } from '../../components/Input'
import { shared } from '../../constants'

export default function Register() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleRegister() {
    try {
      setLoading(true)
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { username }
        }
      })
      if (error) throw error
      Alert.alert('Success', 'Account created!')
      router.replace('/(auth)/login')
    } catch (e: any) {
      Alert.alert('Error', e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={shared.authContainer}>
      <Text style={shared.authTitle}>vclub</Text>
      <Text style={shared.authSubtitle}>create your account</Text>
      <Input label="Username" value={username} onChangeText={setUsername} placeholder="yourname" />
      <Input label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" />
      <Input label="Password" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry />
      <Button label="Create account" onPress={handleRegister} loading={loading} disabled={!username || !email || !password} />
      <TouchableOpacity style={shared.authLink} onPress={() => router.push('/(auth)/login')}>
        <Text style={shared.authLinkText}>already have an account? sign in</Text>
      </TouchableOpacity>
    </View>
  )
}
