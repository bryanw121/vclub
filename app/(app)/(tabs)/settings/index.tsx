import React from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useStackBackTitle } from '../../../../hooks/useStackBackTitle'
import { Ionicons } from '@expo/vector-icons'
import { shared, theme } from '../../../../constants'

export default function SettingsIndexScreen() {
  useStackBackTitle()
  const router = useRouter()

  return (
    <View style={shared.screen}>
      <ScrollView contentContainerStyle={shared.scrollContentSubpage}>
        <View style={shared.card}>
          <Row label="Account settings" onPress={() => router.push('/settings/account')} />
          <View style={shared.divider} />
          <Row label="Submit a feature request or bug" onPress={() => router.push('/settings/feedback')} />
        </View>
      </ScrollView>
    </View>
  )
}

function Row({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[shared.rowBetween, { paddingVertical: theme.spacing.sm }]}
      accessibilityRole="button"
    >
      <Text style={shared.body}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.subtext} />
    </Pressable>
  )
}

