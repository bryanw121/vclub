import React, { useEffect, useState } from 'react'
import { Alert, ScrollView, Text, View } from 'react-native'
import { useStackBackTitle } from '../../../hooks/useStackBackTitle'
import { supabase } from '../../../lib/supabase'
import { Button } from '../../../components/Button'
import { Input } from '../../../components/Input'
import { shared } from '../../../constants'
import { theme } from '../../../constants/theme'
import { normalizeVolleyballPositions } from '../../../utils'
import type { Profile } from '../../../types'

export default function AccountSettingsScreen() {
  useStackBackTitle()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [editFirstName, setEditFirstName] = useState('')
  const [editLastName, setEditLastName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [nameSaved, setNameSaved] = useState(false)

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }
    const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (!error && data) {
      const row = data as Partial<Profile>
      const positions = normalizeVolleyballPositions(row.position)
      const p: Profile = {
        id: row.id as string,
        username: row.username as string,
        first_name: row.first_name ?? null,
        last_name: row.last_name ?? null,
        avatar_url: row.avatar_url ?? null,
        position: positions,
        created_at: row.created_at as string,
      }
      setProfile(p)
      setEditFirstName(p.first_name ?? '')
      setEditLastName(p.last_name ?? '')
    }
    setLoading(false)
  }

  async function handleSaveName() {
    const first = editFirstName.trim()
    const last = editLastName.trim()
    if (!first || !last) {
      setNameError('Both fields are required')
      return
    }
    setNameError(null)
    setSavingName(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in')
      const { error } = await supabase.from('profiles')
        .update({ first_name: first, last_name: last })
        .eq('id', user.id)
      if (error) throw error
      setProfile(p => (p ? { ...p, first_name: first, last_name: last } : p))
      setNameSaved(true)
    } catch (e: any) {
      setNameError(e.message)
    } finally {
      setSavingName(false)
    }
  }

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut()
    if (error) Alert.alert('Error', error.message)
  }

  if (loading || !profile) return null

  return (
    <View style={shared.screen}>
      <ScrollView contentContainerStyle={shared.scrollContentSubpage}>
        <View style={shared.card}>
          <Text style={shared.subheading}>Account settings</Text>
          <View style={shared.mt_md} />

          <Input
            label="First Name"
            value={editFirstName}
            onChangeText={v => { setEditFirstName(v); setNameSaved(false) }}
            placeholder="Jane"
            autoCorrect={false}
          />
          <Input
            label="Last Name"
            value={editLastName}
            onChangeText={v => { setEditLastName(v); setNameSaved(false) }}
            placeholder="Smith"
            autoCorrect={false}
          />

          {nameError ? <Text style={[shared.errorText, shared.mt_sm]}>{nameError}</Text> : null}
          {nameSaved ? (
            <Text style={[shared.caption, shared.mt_sm, { color: theme.colors.success }]}>Saved!</Text>
          ) : null}

          <View style={shared.mt_sm} />
          <Button label="Save name" onPress={handleSaveName} loading={savingName} />

          <View style={[shared.divider, shared.mt_md]} />
          <Button label="Sign out" onPress={handleSignOut} variant="danger" />
        </View>
      </ScrollView>
    </View>
  )
}
