import { useState, useRef } from 'react'
import { View, Text, TouchableOpacity, TextInput, Animated, Modal } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import * as Linking from 'expo-linking'
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

  // ── Minigame ──────────────────────────────────────────────────────────────
  const [score, setScore] = useState(0)
  const [easterEgg, setEasterEgg] = useState(false)
  const [balls, setBalls] = useState([
    { id: 0, top: 8,  left:  10, right: undefined as number | undefined },
    { id: 1, top: 15, left: undefined as number | undefined, right: 8  },
    { id: 2, top: 55, left:  5,  right: undefined as number | undefined },
    { id: 3, top: 70, left: undefined as number | undefined, right: 6  },
    { id: 4, top: 88, left:  30, right: undefined as number | undefined },
  ])
  const scales = useRef(Array.from({ length: 5 }, () => new Animated.Value(1))).current

  function tapBall(i: number) {
    const newScore = score + 1
    setScore(newScore)
    if (newScore === 10) setEasterEgg(true)
    Animated.timing(scales[i], { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setBalls(prev => prev.map((b, idx) => {
        if (idx !== i) return b
        const edge = Math.floor(Math.random() * 4)
        if (edge === 0) return { ...b, top: 2  + Math.random() * 12, left: 5 + Math.random() * 80, right: undefined } // top
        if (edge === 1) return { ...b, top: 82 + Math.random() * 12, left: 5 + Math.random() * 80, right: undefined } // bottom
        if (edge === 2) return { ...b, top: 15 + Math.random() * 65, left: 2,                       right: undefined } // left
                        return { ...b, top: 15 + Math.random() * 65, left: undefined,               right: 2         } // right
      }))
      Animated.timing(scales[i], { toValue: 1, duration: 150, useNativeDriver: true }).start()
    })
  }

  async function handleForgotPassword() {
    const email = resetEmail.toLowerCase().trim()
    if (!email) {
      setResetError('Please enter your email address')
      return
    }
    setResetError('')
    setResetLoading(true)
    try {
      const redirectTo = Linking.createURL('/(auth)/reset-password')
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
      if (error) {
        setResetError(error.message)
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
      {/* Minigame balls — behind the card */}
      {balls.map((ball, i) => (
        <TouchableOpacity
          key={ball.id}
          onPress={() => tapBall(i)}
          style={{
            position: 'absolute',
            top: `${ball.top}%`,
            ...(ball.right !== undefined ? { right: `${ball.right}%` } : { left: `${ball.left}%` }),
          }}
        >
          <Animated.Text style={{ fontSize: 64, opacity: 0.55, transform: [{ scale: scales[i] }] }}>
            🏐
          </Animated.Text>
        </TouchableOpacity>
      ))}

      {/* Easter egg modal */}
      <Modal visible={easterEgg} transparent animationType="none" onRequestClose={() => setEasterEgg(false)}>
        <TouchableOpacity
          onPress={() => setEasterEgg(false)}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <View style={{ backgroundColor: 'white', borderRadius: 24, padding: 32, alignItems: 'center', gap: 12, maxWidth: 300 }}>
            <Text style={{ fontSize: 48 }}>🏐🏆🏐</Text>
            <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#7C4DFF', textAlign: 'center' }}>You're a natural!</Text>
            <Text style={{ fontSize: 15, color: '#666', textAlign: 'center' }}>10 spikes. The team needs you. Now go sign in.</Text>
            <Text style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>tap to dismiss</Text>
          </View>
        </TouchableOpacity>
      </Modal>

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
