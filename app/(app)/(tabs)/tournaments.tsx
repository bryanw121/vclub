import React, { useState, useCallback } from 'react'
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { theme } from '../../../constants'
import { useTabsContext } from '../../../contexts/tabs'

// ── Mock data — will be replaced by Supabase queries ─────────────────────────

const FEATURED = {
  name: "Fall Classic\nBracket '25",
  date: 'Sat Nov 22 · 10AM – 6PM · Oak Hills Gym',
  registered: 42,
  total: 48,
}

const LIVE_MATCHES = [
  { teamA: 'RED', colorA: '#E53935', scoreA: 25, teamB: 'BLUE', colorB: '#1E88E5', scoreB: 18 },
  { teamA: 'YEL', colorA: '#FDD835', scoreA: 22, teamB: 'GRN',  colorB: '#00BFA5', scoreB: 25 },
]

const PAST_RESULTS = [
  { name: 'Spring Open', date: 'Mar 2025', place: 3, teams: 16 },
  { name: 'Winter Cup',  date: 'Feb 2025', place: 1, teams: 12 },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function placeColor(p: number) {
  if (p === 1) return '#FFD54F'
  if (p === 2) return '#B0BEC5'
  return '#D7A86E'
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TournamentsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { tabBarHeight } = useTabsContext()
  const [refreshing, setRefreshing] = useState(false)

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    // Placeholder until this screen loads real tournament data from Supabase
    setTimeout(() => setRefreshing(false), 400)
  }, [])

  const pct = Math.round((FEATURED.registered / FEATURED.total) * 100)

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ paddingBottom: tabBarHeight + 32 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
      }
    >
      {/* ── Season label + heading ── */}
      <View style={{
        paddingTop: insets.top + theme.spacing.md,
        paddingHorizontal: theme.spacing.lg,
        paddingBottom: 4,
      }}>
        <Text style={{
          fontFamily: theme.fonts.bodyBold,
          fontSize: 11,
          color: theme.colors.subtext,
          letterSpacing: 1,
          textTransform: 'uppercase',
          marginBottom: 2,
        }}>Season 3 · Fall</Text>
        <Text style={{
          fontFamily: theme.fonts.display,
          fontWeight: '700',
          fontSize: 34,
          letterSpacing: -1.2,
          color: theme.colors.text,
        }}>Tournaments</Text>
      </View>

      {/* ── Featured card ── */}
      <View style={{ paddingHorizontal: theme.spacing.lg, paddingTop: 12 }}>
        <View style={{
          backgroundColor: theme.colors.accent,
          borderRadius: 24,
          padding: 18,
          overflow: 'hidden',
        }}>
          {/* Giant number watermark */}
          <Text
            style={{
              position: 'absolute',
              right: -10,
              bottom: -30,
              fontFamily: theme.fonts.display,
              fontWeight: '700',
              fontSize: 140,
              lineHeight: 140,
              color: theme.colors.accentInk,
              opacity: 0.1,
              letterSpacing: -6,
            }}
            pointerEvents="none"
          >01</Text>

          {/* Status chip */}
          <View style={{
            alignSelf: 'flex-start',
            backgroundColor: 'rgba(0,0,0,0.18)',
            borderRadius: theme.radius.full,
            paddingHorizontal: 12,
            paddingVertical: 5,
            marginBottom: 10,
          }}>
            <Text style={{
              fontFamily: theme.fonts.bodySemiBold,
              fontSize: 11,
              color: theme.colors.accentInk,
              letterSpacing: 0.3,
            }}>● Registration open</Text>
          </View>

          {/* Title */}
          <Text style={{
            fontFamily: theme.fonts.display,
            fontWeight: '700',
            fontSize: 24,
            letterSpacing: -0.7,
            lineHeight: 28,
            color: theme.colors.accentInk,
          }}>{FEATURED.name}</Text>

          {/* Date / location */}
          <Text style={{
            marginTop: 10,
            fontFamily: theme.fonts.bodySemiBold,
            fontSize: 12.5,
            color: theme.colors.accentInk,
            opacity: 0.8,
          }}>{FEATURED.date}</Text>

          {/* Registration progress row */}
          <View style={{
            marginTop: 14,
            backgroundColor: 'rgba(0,0,0,0.1)',
            borderRadius: 12,
            padding: 10,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{
                  fontFamily: theme.fonts.bodyBold,
                  fontSize: 10.5,
                  color: theme.colors.accentInk,
                }}>{FEATURED.registered} / {FEATURED.total} teams</Text>
                <Text style={{
                  fontFamily: theme.fonts.bodyBold,
                  fontSize: 10.5,
                  color: theme.colors.accentInk,
                }}>{pct}%</Text>
              </View>
              <View style={{
                height: 4,
                backgroundColor: 'rgba(0,0,0,0.12)',
                borderRadius: 2,
                overflow: 'hidden',
              }}>
                <View style={{
                  width: `${pct}%` as any,
                  height: '100%',
                  backgroundColor: theme.colors.accentInk,
                }} />
              </View>
            </View>
            <TouchableOpacity
              onPress={() => router.push('/host' as any)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 10,
                backgroundColor: theme.colors.accentInk,
              }}
              activeOpacity={0.8}
            >
              <Text style={{
                fontFamily: theme.fonts.display,
                fontWeight: '700',
                fontSize: 13,
                color: theme.colors.accent,
              }}>Enter</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ── Live bracket preview ── */}
      <View style={{
        paddingHorizontal: theme.spacing.lg,
        paddingTop: 22,
        paddingBottom: 8,
      }}>
        <Text style={{
          fontFamily: theme.fonts.display,
          fontWeight: '700',
          fontSize: 18,
          color: theme.colors.text,
        }}>Live now · Summer Slam</Text>
      </View>

      <View style={{ paddingHorizontal: theme.spacing.lg }}>
        <View style={{
          backgroundColor: theme.colors.card,
          borderRadius: 20,
          padding: 14,
          borderWidth: 1,
          borderColor: theme.colors.border,
          gap: 10,
        }}>
          {LIVE_MATCHES.map((m, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {/* Team A — right-aligned */}
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                <Text style={{
                  fontFamily: theme.fonts.display,
                  fontWeight: '700',
                  fontSize: 16,
                  color: m.scoreA > m.scoreB ? theme.colors.text : theme.colors.subtext,
                }}>{m.scoreA}</Text>
                <View style={{
                  width: 28,
                  height: 28,
                  borderRadius: 7,
                  backgroundColor: m.colorA,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Text style={{ fontFamily: theme.fonts.display, fontWeight: '700', fontSize: 12, color: '#fff' }}>
                    {m.teamA[0]}
                  </Text>
                </View>
              </View>

              {/* VS divider */}
              <Text style={{
                fontFamily: theme.fonts.bodyBold,
                fontSize: 10,
                color: theme.colors.subtext,
                letterSpacing: 0.4,
                width: 26,
                textAlign: 'center',
              }}>VS</Text>

              {/* Team B — left-aligned */}
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{
                  width: 28,
                  height: 28,
                  borderRadius: 7,
                  backgroundColor: m.colorB,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Text style={{ fontFamily: theme.fonts.display, fontWeight: '700', fontSize: 12, color: '#fff' }}>
                    {m.teamB[0]}
                  </Text>
                </View>
                <Text style={{
                  fontFamily: theme.fonts.display,
                  fontWeight: '700',
                  fontSize: 16,
                  color: m.scoreB > m.scoreA ? theme.colors.text : theme.colors.subtext,
                }}>{m.scoreB}</Text>
              </View>
            </View>
          ))}

          <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: 2 }} />

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{
              fontFamily: theme.fonts.bodySemiBold,
              fontSize: 11.5,
              color: theme.colors.subtext,
            }}>Semifinal · 8:20 PM</Text>
            <Text style={{
              fontFamily: theme.fonts.bodyBold,
              fontSize: 11.5,
              color: theme.colors.primary,
            }}>View bracket →</Text>
          </View>
        </View>
      </View>

      {/* ── Past results ── */}
      <View style={{
        paddingHorizontal: theme.spacing.lg,
        paddingTop: 22,
        paddingBottom: 8,
      }}>
        <Text style={{
          fontFamily: theme.fonts.display,
          fontWeight: '700',
          fontSize: 18,
          color: theme.colors.text,
        }}>Past</Text>
      </View>

      <View style={{ paddingHorizontal: theme.spacing.lg, gap: 8 }}>
        {PAST_RESULTS.map((t, i) => (
          <View key={i} style={{
            backgroundColor: theme.colors.card,
            borderRadius: 16,
            padding: 12,
            borderWidth: 1,
            borderColor: theme.colors.border,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}>
            <View style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              backgroundColor: placeColor(t.place),
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Text style={{
                fontFamily: theme.fonts.display,
                fontWeight: '700',
                fontSize: 16,
                color: '#1A1A1A',
              }}>{t.place}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{
                fontFamily: theme.fonts.display,
                fontWeight: '700',
                fontSize: 14.5,
                color: theme.colors.text,
              }}>{t.name}</Text>
              <Text style={{
                fontFamily: theme.fonts.body,
                fontSize: 11,
                color: theme.colors.subtext,
                marginTop: 1,
              }}>{t.date} · {t.teams} teams</Text>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  )
}
