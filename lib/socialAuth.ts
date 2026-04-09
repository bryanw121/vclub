import { Platform } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import * as AuthSession from 'expo-auth-session'
import { supabase } from './supabase'

// Required to complete the auth session on Android / web
WebBrowser.maybeCompleteAuthSession()

// ─── OAuth callback parser ─────────────────────────────────────────────────

async function handleOAuthCallback(url: string) {
  const hashIdx = url.indexOf('#')
  const queryIdx = url.indexOf('?')
  const raw =
    hashIdx !== -1 ? url.slice(hashIdx + 1) :
    queryIdx !== -1 ? url.slice(queryIdx + 1) : ''
  const params = new URLSearchParams(raw)

  const code = params.get('code')
  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) throw error
  } else if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
    if (error) throw error
  } else {
    throw new Error('Authentication callback missing tokens')
  }
}

// ─── Generic OAuth provider (Google / Apple web+Android) ──────────────────

async function signInWithOAuthProvider(provider: 'google' | 'apple') {
  if (Platform.OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    })
    if (error) throw error
    return
  }

  const redirectTo = AuthSession.makeRedirectUri()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  })
  if (error || !data.url) throw error ?? new Error('Failed to get auth URL')

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)
  if (result.type === 'success') {
    await handleOAuthCallback(result.url)
  }
  // 'cancel' type means user dismissed — do nothing
}

// ─── Public helpers ────────────────────────────────────────────────────────

export async function signInWithGoogle() {
  await signInWithOAuthProvider('google')
}

export async function signInWithApple() {
  if (Platform.OS === 'ios') {
    // Lazy require keeps expo-apple-authentication out of web/Android bundles
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AppleAuth = require('expo-apple-authentication') as typeof import('expo-apple-authentication')
    const credential = await AppleAuth.signInAsync({
      requestedScopes: [
        AppleAuth.AppleAuthenticationScope.FULL_NAME,
        AppleAuth.AppleAuthenticationScope.EMAIL,
      ],
    })
    if (!credential.identityToken) throw new Error('No identity token from Apple')
    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    })
    if (error) throw error
  } else {
    await signInWithOAuthProvider('apple')
  }
}

export async function sendEmailOtp(email: string, shouldCreateUser = false) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser },
  })
  if (error) throw error
}

export async function verifyEmailOtp(email: string, token: string) {
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
  if (error) throw error
}
