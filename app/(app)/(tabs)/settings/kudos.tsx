import React, { useCallback, useState } from 'react'
import { ActivityIndicator, ScrollView, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../../../../lib/supabase'
import { useStackBackTitle } from '../../../../hooks/useStackBackTitle'
import { shared, theme, KUDO_TYPES } from '../../../../constants'
import type { KudoType } from '../../../../types'

type CheerSummary = {
  cheer_type: KudoType
  count: number
}

export default function ProfileCheersScreen() {
  useStackBackTitle('Cheers')

  const [loading, setLoading] = useState(true)
  const [totalReceived, setTotalReceived] = useState(0)
  const [breakdown, setBreakdown] = useState<CheerSummary[]>([])
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
    const counts: Partial<Record<KudoType, number>> = {}
    for (const row of rows) {
      counts[row.cheer_type] = (counts[row.cheer_type] ?? 0) + 1
    }
    const summary = KUDO_TYPES
      .map(kt => ({ cheer_type: kt.type, count: counts[kt.type] ?? 0 }))
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
            <Text style={[shared.caption, { textAlign: 'center' }]}>cheers received</Text>
          </View>
          <View style={[shared.card, { flex: 1, alignItems: 'center', gap: theme.spacing.xs }]}>
            <Text style={{ fontSize: theme.font.size.xxl, fontWeight: theme.font.weight.bold, color: theme.colors.text }}>
              {totalGiven}
            </Text>
            <Text style={[shared.caption, { textAlign: 'center' }]}>cheers given</Text>
          </View>
        </View>

        {/* Breakdown */}
        {breakdown.length === 0 ? (
          <View style={[shared.card, { alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.xl }]}>
            <Ionicons name="star-outline" size={36} color={theme.colors.subtext} />
            <Text style={[shared.caption, { textAlign: 'center' }]}>
              No cheers received yet.{'\n'}Attend events and play great to earn some.
            </Text>
          </View>
        ) : (
          <View style={shared.card}>
            <Text style={[shared.subheading, { marginBottom: theme.spacing.md }]}>Breakdown</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
              {breakdown.map(item => {
                const config = KUDO_TYPES.find(kt => kt.type === item.cheer_type)
                if (!config) return null
                return (
                  <View
                    key={item.cheer_type}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: theme.spacing.xs,
                      paddingHorizontal: theme.spacing.md,
                      paddingVertical: theme.spacing.sm,
                      borderRadius: theme.radius.full,
                      borderWidth: 1.5,
                      borderColor: theme.colors.primary + '60',
                      backgroundColor: theme.colors.primary + '0E',
                    }}
                  >
                    <Ionicons name={config.icon as any} size={14} color={theme.colors.primary} />
                    <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.text }}>
                      {config.label}
                    </Text>
                    <Text style={{
                      fontSize: theme.font.size.sm,
                      fontWeight: theme.font.weight.bold,
                      color: theme.colors.primary,
                    }}>
                      {item.count}
                    </Text>
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
