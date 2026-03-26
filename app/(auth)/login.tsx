import { useState, useRef } from 'react'
import { View, Text, TouchableOpacity, TextInput } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { Button } from '../../components/Button'
import { Input } from '../../components/Input'
import { shared } from '../../constants'

function obfuscateEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return email
  const visible = local.slice(0, 3)
  return `${visible}****@${domain}`
}

export default function Login() {
  const router = useRouter()
  const passwordRef = useRef<TextInput>(null)

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<{ identifier?: string; password?: string }>({})
  const [forgotMode, setForgotMode] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetSent, setResetSent] = useState<string | null>(null)
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError, setResetError] = useState('')

  async function handleForgotPassword() {
    const email = resetEmail.toLowerCase().trim()
    if (!email) {
      setResetError('Please enter your email address')
      return
    }
    setResetError('')
    setResetLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email)
      if (error) {
        setResetError('Could not send reset email. Check your address and try again.')
      } else {
        setResetSent(obfuscateEmail(email))
      }
    } finally {
      setResetLoading(false)
    }
  }

  async function handleLogin() {
    setErrors({})
    setLoading(true)

    try {
      const normalized = identifier.toLowerCase().trim()
      const isEmail = normalized.includes('@')
      let email = normalized

      if (!isEmail) {
        const { data } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', normalized)
          .single()

        if (!data) {
          setErrors({ identifier: 'Username not found' })
          return
        }

        const { data: userData } = await supabase
          .rpc('get_email_by_user_id', { user_id: data.id })

        if (!userData) {
          setErrors({ identifier: 'Account not found' })
          return
        }
        email = userData
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setErrors({ password: 'Incorrect password' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <LinearGradient colors={['#4FC3F7', '#7C4DFF', '#E040FB']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={shared.authBackground}>
      <View style={shared.authCard}>
        <Text style={shared.authTitle}>vclub</Text>

        {forgotMode ? (
          <>
            <Text style={shared.authSubtitle}>
              {resetSent ? `reset link sent to ${resetSent}` : 'enter your email to reset your password'}
            </Text>

            {!resetSent && (
              <>
                <Input
                  label="Email"
                  value={resetEmail}
                  onChangeText={setResetEmail}
                  placeholder="you@example.com"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  returnKeyType="go"
                  onSubmitEditing={handleForgotPassword}
                  error={resetError}
                />
                <Button label="Send reset link" onPress={handleForgotPassword} loading={resetLoading} disabled={!resetEmail} />
              </>
            )}

            <TouchableOpacity style={shared.authLink} onPress={() => { setForgotMode(false); setResetSent(null); setResetEmail(''); setResetError('') }}>
              <Text style={shared.authLinkText}>Back to sign in</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={shared.authSubtitle}>sign in to continue</Text>

            <Input
              label="Email or username"
              value={identifier}
              onChangeText={setIdentifier}
              placeholder="you@example.com or yourname"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => passwordRef.current?.focus()}
              error={errors.identifier}
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
              onSubmitEditing={handleLogin}
              error={errors.password}
            />

            <Button label="Sign in" onPress={handleLogin} loading={loading} disabled={!identifier || !password} />

            <TouchableOpacity style={shared.authLink} onPress={() => { setForgotMode(true); setResetEmail(identifier.includes('@') ? identifier : '') }}>
              <Text style={shared.authLinkText}>Forgot password?</Text>
            </TouchableOpacity>
            <TouchableOpacity style={shared.authLink} onPress={() => router.push('/(auth)/register')}>
              <Text style={shared.authLinkText}>Don't have an account? Sign up</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </LinearGradient>
  )
}
