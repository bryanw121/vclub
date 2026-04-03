import React, { useCallback, useState } from 'react'
import { ActivityIndicator, ScrollView, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../../../../lib/supabase'
import { useStackBackTitle } from '../../../../hooks/useStackBackTitle'
import { shared, theme, KUDO_TYPES } from '../../../../constants'
import { CheerRadarChart } from '../../../../components/CheerRadarChart'
import type { KudoType } from '../../../../types'

export default function ProfileCheersScreen() {
  useStackBackTitle('Cheers')

  const [loading, setLoading] = useState(true)
  const [totalReceived, setTotalReceived] = useState(0)
  const [counts, setCounts] = useState<Partial<Record<KudoType, number>>>({})
  const [totalGiven, setTotalGiven] = useState(0)

  useFocusEffect(
    useCallback(() => {
      void fetchCheers()
    }, []),
  )

  async function fetchCheers() {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id
    if (!userId) { setLoading(false); return }

    const [receivedRes, givenRes] = await Promise.all([
      supabase.from('cheers').select('cheer_type').eq('receiver_id', userId),
      supabase.from('cheers').select('id', { count: 'exact', head: true }).eq('giver_id', userId),
    ])

    const rows = (receivedRes.data ?? []) as { cheer_type: KudoType }[]
    const c: Partial<Record<KudoType, number>> = {}
    for (const row of rows) c[row.cheer_type] = (c[row.cheer_type] ?? 0) + 1

    setTotalReceived(rows.length)
    setCounts(c)
    setTotalGiven(givenRes.count ?? 0)
    setLoading(false)
  }

  if (loading) {
    return (
      <View style={[shared.screen, shared.centered]}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    )
  }

  return (
    <View style={shared.screen}>
      <ScrollView contentContainerStyle={shared.scrollContentSubpage}>

        {/* Summary cards */}
        <View style={{ flexDirection: 'row', gap: theme.spacing.md, marginBottom: theme.spacing.md }}>
          <View style={[shared.card, { flex: 1, alignItems: 'center', gap: theme.spacing.xs }]}>
            <Text style={{ fontSize: theme.font.size.xxl, fontWeight: theme.font.weight.bold, color: theme.colors.primary }}>
              {totalReceived}
            </Text>
            <Text style={[shared.caption, { textAlign: 'center' }]}>cheers received</Text>
          </View>
          <View style={[shared.card, { flex: 1, alignItems: 'center', gap: theme.spacing.xs }]}>
            <Text style={{ fontSize: theme.font.size.xxl, fontWeight: theme.font.weight.bold, color: theme.colors.text }}>
              {totalGiven}
            </Text>
            <Text style={[shared.caption, { textAlign: 'center' }]}>cheers given</Text>
          </View>
        </View>

        {totalReceived === 0 ? (
          <View style={[shared.card, { alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.xl }]}>
            <Ionicons name="star-outline" size={36} color={theme.colors.subtext} />
            <Text style={[shared.caption, { textAlign: 'center' }]}>
              No cheers received yet.{'\n'}Attend events and play great to earn some.
            </Text>
          </View>
        ) : (
          <View style={shared.card}>
            <Text style={[shared.subheading, { marginBottom: theme.spacing.sm }]}>Breakdown</Text>
            <CheerRadarChart counts={counts} />
          </View>
        )}

      </ScrollView>
    </View>
  )
}
