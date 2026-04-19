import React, { useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import { Input } from '../../../components/Input'
import { Button } from '../../../components/Button'
import { MajorCityAutocomplete } from '../../../components/MajorCityAutocomplete'
import { shared, theme } from '../../../constants'
import type { MajorCity, MembershipType } from '../../../types'

export default function CreateClubScreen() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [majorCity, setMajorCity] = useState<MajorCity | null>(null)
  const [membershipType, setMembershipType] = useState<MembershipType>('open')
  const [submitting, setSubmitting] = useState(false)

  async function handleCreate() {
    const trimmedName = name.trim()
    if (!trimmedName) {
      Alert.alert('Name required', 'Please enter a club name.')
      return
    }
    if (!majorCity) {
      Alert.alert('Metro area required', 'Choose a city from the list so players can find your club.')
      return
    }

    setSubmitting(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) {
      setSubmitting(false)
      Alert.alert('Sign in required', 'You need an account to create a club.')
      return
    }

    const { data, error } = await supabase
      .from('clubs')
      .insert({
        name: trimmedName,
        description: description.trim() || null,
        membership_type: membershipType,
        created_by: session.user.id,
        major_city_id: majorCity.id,
      })
      .select('id')
      .single()

    setSubmitting(false)

    if (error) {
      Alert.alert('Could not create club', error.message)
      return
    }

    if (data?.id) {
      router.replace(`/club/${data.id}` as any)
    }
  }

  return (
    <View style={[shared.screen, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        style={shared.screen}
        contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.xl * 2 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[shared.body, { color: theme.colors.subtext, marginBottom: theme.spacing.md }]}>
          Anyone can browse clubs. Open clubs let players join with one tap; invite-only clubs are visible but joining is by invitation from an owner.
        </Text>

        <Input label="Club name" value={name} onChangeText={setName} placeholder="e.g. Eastside Volleyball" autoCapitalize="words" />

        <MajorCityAutocomplete
          label="Metro area"
          value={majorCity}
          onChange={setMajorCity}
        />

        <Input
          label="Description (optional)"
          value={description}
          onChangeText={setDescription}
          placeholder="What makes this club different?"
          multiline
          numberOfLines={4}
        />

        <Text style={[shared.label, { marginBottom: theme.spacing.xs }]}>Who can join?</Text>
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm, marginBottom: theme.spacing.lg }}>
          {([
            { value: 'open' as const, title: 'Open', subtitle: 'Anyone can join' },
            { value: 'invite' as const, title: 'Invite only', subtitle: 'Owner adds members' },
          ]).map(opt => {
            const active = membershipType === opt.value
            return (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setMembershipType(opt.value)}
                style={{
                  flex: 1,
                  padding: theme.spacing.md,
                  borderRadius: theme.radius.md,
                  borderWidth: 1,
                  borderColor: active ? theme.colors.primary : theme.colors.border,
                  backgroundColor: active ? theme.colors.primary + '14' : theme.colors.card,
                }}
                activeOpacity={0.85}
              >
                <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.md, color: theme.colors.text }}>
                  {opt.title}
                </Text>
                <Text style={{ fontSize: theme.font.size.xs, color: theme.colors.subtext, marginTop: 4 }}>{opt.subtitle}</Text>
              </TouchableOpacity>
            )
          })}
        </View>

        <Button label="Create club" onPress={() => void handleCreate()} loading={submitting} />
      </ScrollView>
    </View>
  )
}
