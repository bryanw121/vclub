import React, { useCallback, useState } from 'react'
import { ActivityIndicator, ScrollView, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../../../../lib/supabase'
import { useStackBackTitle } from '../../../../hooks/useStackBackTitle'
import { shared, theme, KUDO_TYPES, KUDOS_MAX_PER_EVENT } from '../../../../constants'
import type { KudoType } from '../../../../types'

type KudoSummary = {
  kudo_type: KudoType
  count: number
}

export default function ProfileKudosScreen() {
  useStackBackTitle('Kudos')

  const [loading, setLoading] = useState(true)
  const [totalReceived, setTotalReceived] = useState(0)
  const [breakdown, setBreakdown] = useState<KudoSummary[]>([])
  const [totalGiven, setTotalGiven] = useState(0)

  useFocusEffect(
    useCallback(() => {
      void fetchKudos()
    }, []),
  )

  async function fetchKudos() {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id
    if (!userId) { setLoading(false); return }

    const [receivedRes, givenRes] = await Promise.all([
      supabase.from('kudos').select('kudo_type').eq('receiver_id', userId),
      supabase.from('kudos').select('id', { count: 'exact', head: true }).eq('giver_id', userId),
    ])

    const rows = (receivedRes.data ?? []) as { kudo_type: KudoType }[]
    const counts: Partial<Record<KudoType, number>> = {}
    for (const row of rows) {
      counts[row.kudo_type] = (counts[row.kudo_type] ?? 0) + 1
    }
    const summary = KUDO_TYPES
      .map(kt => ({ kudo_type: kt.type, count: counts[kt.type] ?? 0 }))
      .filter(s => s.count > 0)
      .sort((a, b) => b.count - a.count)

    setTotalReceived(rows.length)
    setBreakdown(summary)
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
            <Text style={[shared.caption, { textAlign: 'center' }]}>kudos received</Text>
          </View>
          <View style={[shared.card, { flex: 1, alignItems: 'center', gap: theme.spacing.xs }]}>
            <Text style={{ fontSize: theme.font.size.xxl, fontWeight: theme.font.weight.bold, color: theme.colors.text }}>
              {totalGiven}
            </Text>
            <Text style={[shared.caption, { textAlign: 'center' }]}>kudos given</Text>
          </View>
        </View>

        {/* Breakdown */}
        {breakdown.length === 0 ? (
          <View style={[shared.card, { alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.xl }]}>
            <Ionicons name="star-outline" size={36} color={theme.colors.subtext} />
            <Text style={[shared.caption, { textAlign: 'center' }]}>
              No kudos received yet.{'\n'}Attend events and play great to earn some.
            </Text>
          </View>
        ) : (
          <View style={shared.card}>
            <Text style={[shared.subheading, { marginBottom: theme.spacing.md }]}>Breakdown</Text>
            <View style={{ gap: theme.spacing.sm }}>
              {breakdown.map(item => {
                const config = KUDO_TYPES.find(kt => kt.type === item.kudo_type)
                if (!config) return null
                const pct = totalReceived > 0 ? item.count / totalReceived : 0
                return (
                  <View key={item.kudo_type}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
                        <Ionicons name={config.icon as any} size={15} color={theme.colors.primary} />
                        <Text style={shared.body}>{config.label}</Text>
                      </View>
                      <Text style={[shared.caption, { fontWeight: theme.font.weight.semibold }]}>{item.count}</Text>
                    </View>
                    <View style={{ height: 6, borderRadius: theme.radius.full, backgroundColor: theme.colors.border }}>
                      <View style={{
                        height: 6,
                        borderRadius: theme.radius.full,
                        backgroundColor: theme.colors.primary,
                        width: `${Math.round(pct * 100)}%`,
                      }} />
                    </View>
                  </View>
                )
              })}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  )
}
