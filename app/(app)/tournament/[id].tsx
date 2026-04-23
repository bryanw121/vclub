import React, { useEffect, useState } from 'react'
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../../lib/supabase'
import { theme, shared } from '../../../constants'
import type { Tournament, TournamentRules } from '../../../types'

const SKILL_LABELS: Record<string, string> = {
  d: 'D', c: 'C', b: 'B', bb: 'BB', a: 'A', aa_plus: 'AA+', open: 'Open',
}

const FORMAT_LABELS: Record<string, string> = {
  pool_bracket: 'Pool Play + Bracket',
  bracket:      'Bracket Only',
  pool_play:    'Pool Play Only',
  round_robin:  'Full Round Robin',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short', month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

export default function TournamentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [rules, setRules] = useState<TournamentRules | null>(null)
  const [loading, setLoading] = useState(true)
  const [myId, setMyId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      setMyId(user?.id ?? null)

      const [{ data: t }, { data: r }] = await Promise.all([
        supabase
          .from('tournaments')
          .select('*')
          .eq('id', id)
          .single(),
        supabase
          .from('tournament_rules')
          .select('*')
          .eq('tournament_id', id)
          .single(),
      ])

      setTournament(t as Tournament | null)
      setRules(r as TournamentRules | null)
      setLoading(false)
    }
    void load()
  }, [id])

  const isCreator = myId && tournament?.created_by === myId

  async function handlePublish() {
    await supabase.from('tournaments').update({ status: 'published', published_at: new Date().toISOString() }).eq('id', id)
    setTournament(prev => prev ? { ...prev, status: 'published' } : prev)
  }

  if (loading) {
    return (
      <View style={[shared.screen, shared.centered]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    )
  }

  if (!tournament) {
    return (
      <View style={[shared.screen, shared.centered]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={shared.body}>Tournament not found.</Text>
      </View>
    )
  }

  const skillLabels = (tournament.skill_levels ?? []).map(s => SKILL_LABELS[s] ?? s).join(', ')

  return (
    <View style={[shared.screen, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: theme.colors.border,
      }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginHorizontal: 12 }}>
          <Text style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: 16, color: theme.colors.text }} numberOfLines={1}>
            {tournament.title}
          </Text>
        </View>
        {/* Status badge */}
        <View style={{
          paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.radius.full,
          backgroundColor: tournament.status === 'published' ? theme.colors.primary + '22' : theme.colors.border,
        }}>
          <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: 11, color: tournament.status === 'published' ? theme.colors.primary : theme.colors.subtext, textTransform: 'capitalize' }}>
            {tournament.status}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>

        {/* Banner card */}
        <View style={{
          backgroundColor: theme.colors.warm + '18',
          borderRadius: 20, padding: 20, marginBottom: 20,
          borderWidth: 1, borderColor: theme.colors.warm + '33',
          overflow: 'hidden', position: 'relative',
        }}>
          <Text style={{ position: 'absolute', right: -8, top: -16, fontSize: 100, opacity: 0.08 }}>🏆</Text>
          <Text style={{ fontFamily: theme.fonts.display, fontWeight: '700', fontSize: 26, letterSpacing: -0.8, color: theme.colors.text, marginBottom: 6 }}>
            {tournament.title}
          </Text>
          {tournament.location && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
              <Ionicons name="location-outline" size={13} color={theme.colors.subtext} />
              <Text style={{ fontFamily: theme.fonts.body, fontSize: 13, color: theme.colors.subtext }}>{tournament.location}</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="calendar-outline" size={13} color={theme.colors.subtext} />
            <Text style={{ fontFamily: theme.fonts.body, fontSize: 13, color: theme.colors.subtext }}>{formatDate(tournament.start_date)}</Text>
          </View>
          {skillLabels.length > 0 && (
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              {(tournament.skill_levels ?? []).map(s => (
                <View key={s} style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: theme.radius.full, backgroundColor: theme.colors.primary + '18' }}>
                  <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: 12, color: theme.colors.primary }}>{SKILL_LABELS[s] ?? s}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Details */}
        <View style={[shared.card, { marginBottom: 16, gap: 0 }]}>
          {[
            { label: 'Format',   value: FORMAT_LABELS[tournament.format] ?? tournament.format },
            { label: 'Bracket',  value: tournament.bracket_type === 'double' ? 'Double elimination' : 'Single elimination', hide: !tournament.bracket_type },
            { label: 'Max teams',value: tournament.max_teams ? String(tournament.max_teams) : 'Unlimited' },
            { label: 'Roster',   value: `${tournament.min_roster_size}–${tournament.max_roster_size} players` },
            { label: 'Refs',     value: tournament.has_refs ? 'Yes' : 'No' },
            { label: 'Entry fee',value: tournament.price > 0 ? `$${tournament.price.toFixed(2)}` : 'Free' },
            { label: 'Reg. deadline', value: tournament.registration_deadline ? formatDate(tournament.registration_deadline) : 'None', hide: !tournament.registration_deadline },
          ].filter(r => !r.hide).map((row, i, arr) => (
            <View key={row.label} style={{
              flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
              paddingVertical: 12, paddingHorizontal: 4,
              borderBottomWidth: i < arr.length - 1 ? 1 : 0,
              borderBottomColor: theme.colors.border,
            }}>
              <Text style={{ fontFamily: theme.fonts.body, fontSize: 14, color: theme.colors.subtext }}>{row.label}</Text>
              <Text style={{ fontFamily: theme.fonts.bodyMedium, fontSize: 14, color: theme.colors.text }}>{row.value}</Text>
            </View>
          ))}
        </View>

        {tournament.description && (
          <View style={[shared.card, { marginBottom: 16 }]}>
            <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: 13, color: theme.colors.subtext, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6 }}>About</Text>
            <Text style={{ fontFamily: theme.fonts.body, fontSize: 14, color: theme.colors.text, lineHeight: 20 }}>{tournament.description}</Text>
          </View>
        )}

        {rules && (
          <View style={[shared.card, { marginBottom: 16, gap: 0 }]}>
            <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: 13, color: theme.colors.subtext, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: 4 }}>Scoring Rules</Text>
            {[
              { label: 'Win to',        value: `${rules.winning_score} pts` },
              { label: 'Deciding set',  value: `${rules.deciding_set_score} pts` },
              { label: 'Win by',        value: `${rules.win_by_margin}` },
              { label: 'Point cap',     value: rules.point_cap ? String(rules.point_cap) : 'None' },
              { label: 'Sets to win',   value: String(rules.sets_to_win) },
            ].map((row, i, arr) => (
              <View key={row.label} style={{
                flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                paddingVertical: 10, paddingHorizontal: 4,
                borderBottomWidth: i < arr.length - 1 ? 1 : 0,
                borderBottomColor: theme.colors.border,
              }}>
                <Text style={{ fontFamily: theme.fonts.body, fontSize: 14, color: theme.colors.subtext }}>{row.label}</Text>
                <Text style={{ fontFamily: theme.fonts.bodyMedium, fontSize: 14, color: theme.colors.text }}>{row.value}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Creator actions */}
        {isCreator && tournament.status === 'draft' && (
          <TouchableOpacity
            onPress={handlePublish}
            style={{ backgroundColor: theme.colors.primary, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 4 }}
          >
            <Text style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: 15, color: '#fff' }}>Publish Tournament</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  )
}
