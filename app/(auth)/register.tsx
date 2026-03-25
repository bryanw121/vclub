import { useState, useRef } from 'react'
import { View, Text, TouchableOpacity, Alert, TextInput } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { Button } from '../../components/Button'
import { Input } from '../../components/Input'
import { shared } from '../../constants'

export default function Register() {
  const router = useRouter()
  const emailRef = useRef<TextInput>(null)
  const passwordRef = useRef<TextInput>(null)

  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<{ username?: string; email?: string; password?: string }>({})

  async function handleRegister() {
    setErrors({})
    setLoading(true)

    try {
      const normalizedUsername = username.toLowerCase().trim()
      const normalizedEmail = email.toLowerCase().trim()

      // Check username availability first (highest priority error)
      const { data: existingUsername } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', normalizedUsername)
        .single()

      if (existingUsername) {
        setErrors({ username: 'Username already taken' })
        return
      }

      const { error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: { data: { username: normalizedUsername } },
      })

      if (error) {
        if (error.message.toLowerCase().includes('already')) {
          setErrors({ email: 'Email already in use' })
        } else {
          setErrors({ password: error.message })
        }
        return
      }

      Alert.alert('Success', 'Account created!')
      router.replace('/(auth)/login')
    } finally {
      setLoading(false)
    }
  }

  return (
    <LinearGradient colors={['#4FC3F7', '#7C4DFF', '#E040FB']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={shared.authBackground}>
      <View style={shared.authCard}>
        <Text style={shared.authTitle}>vclub</Text>
        <Text style={shared.authSubtitle}>create your account</Text>

        <Input
          label="Username"
          value={username}
          onChangeText={setUsername}
          placeholder="yourname"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
          blurOnSubmit={false}
          onSubmitEditing={() => emailRef.current?.focus()}
          error={errors.username}
        />
        <Input
          ref={emailRef}
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          returnKeyType="next"
          blurOnSubmit={false}
          onSubmitEditing={() => passwordRef.current?.focus()}
          error={errors.email}
        />
        <Input
          ref={passwordRef}
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          secureTextEntry
          autoCapitalize="none"
          returnKeyType="go"
          onSubmitEditing={handleRegister}
          error={errors.password}
        />

        <Button label="Create account" onPress={handleRegister} loading={loading} disabled={!username || !email || !password} />
        <TouchableOpacity style={shared.authLink} onPress={() => router.push('/(auth)/login')}>
          <Text style={shared.authLinkText}>already have an account? sign in</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  )
}
