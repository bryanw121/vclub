import React, { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../../../../lib/supabase'
import { BadgeIcon } from '../../../../components/BadgeIcon'
import { useStackBackTitle } from '../../../../hooks/useStackBackTitle'
import { useBadges } from '../../../../hooks/useBadges'
import {
  shared,
  theme,
  BADGE_DEFINITIONS,
  BADGE_CATEGORY_GRADIENTS,
  PROFILE_BORDERS,
  isBorderUnlocked,
  badgeTitle,
} from '../../../../constants'
import type { BadgeType, UserBadge } from '../../../../types'
import type { ProfileBorderType, BadgeDef } from '../../../../constants'

export default function BadgesScreen() {
  useStackBackTitle('Badges')

  const { width } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const cols = width >= 768 ? 6 : 4

  const { badges, loading, fetchBadges, setDisplaySlot } = useBadges()
  const [selecting, setSelecting] = useState(false)
  const [selectedBorder, setSelectedBorder] = useState<ProfileBorderType | null>(null)
  const [borderSaving, setBorderSaving] = useState(false)
  const [profileLoading, setProfileLoading] = useState(true)
  const [detailDef, setDetailDef] = useState<BadgeDef | null>(null)

  useFocusEffect(
    useCallback(() => {
      void fetchBadges(true)
      void fetchBorder()
    }, [fetchBadges]),
  )

  async function fetchBorder() {
    // profileLoading starts true (initial state) and only clears once.
    // Subsequent calls update selectedBorder silently with no spinner flash.
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user?.id) { setProfileLoading(false); return }
    const { data } = await supabase
      .from('profiles')
      .select('selected_border')
      .eq('id', session.user.id)
      .single()
    setSelectedBorder((data as any)?.selected_border ?? null)
    setProfileLoading(false)
  }

  async function saveBorder(border: ProfileBorderType | null) {
    if (borderSaving) return
    try {
      setBorderSaving(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user?.id) return
      await supabase.from('profiles').update({ selected_border: border }).eq('id', session.user.id)
      setSelectedBorder(border)
    } finally {
      setBorderSaving(false)
    }
  }

  async function toggleDisplay(badge: UserBadge) {
    if (badge.display_order != null) {
      // Already displayed — remove it
      await setDisplaySlot(badge.badge_type, null)
    } else {
      // Find next free slot (1, 2, or 3)
      const usedSlots = badges
        .filter(b => b.display_order != null)
        .map(b => b.display_order as number)
      const next = [1, 2, 3].find(s => !usedSlots.includes(s))
      if (next == null) return // all 3 slots full
      await setDisplaySlot(badge.badge_type, next)
    }
  }

  const displayedSlots = [1, 2, 3].map(s => badges.find(b => b.display_order === s) ?? null)
  const earnedBadges = badges.filter(b => b.tier > 0)
  const displayedCount = badges.filter(b => b.display_order != null).length

  if (loading || profileLoading) {
    return (
      <View style={[shared.screen, shared.centered]}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    )
  }

  const detailBadge = detailDef ? badges.find(b => b.badge_type === detailDef.type) : null

  return (
    <View style={shared.screen}>
      <ScrollView
        contentContainerStyle={[shared.scrollContentSubpage, detailDef ? { paddingBottom: 260 + insets.bottom } : undefined]}>

        {/* ── Displayed badges ── */}
        <View style={shared.card}>
          <View style={[shared.rowBetween, { marginBottom: theme.spacing.sm }]}>
            <View>
              <Text style={shared.subheading}>Display</Text>
              <Text style={[shared.caption, { marginTop: 2 }]}>
                {selecting ? 'Tap badges below to fill slots' : 'Shown on your profile'}
              </Text>
            </View>
            {earnedBadges.length > 0 && (
              <Pressable
                onPress={() => setSelecting(s => !s)}
                hitSlop={8}
                style={{
                  paddingHorizontal: theme.spacing.sm,
                  paddingVertical: 4,
                  borderRadius: theme.radius.full,
                  backgroundColor: selecting ? theme.colors.primary : theme.colors.primary + '14',
                }}
              >
                <Text style={{
                  fontSize: theme.font.size.sm,
                  fontWeight: theme.font.weight.semibold,
                  color: selecting ? '#fff' : theme.colors.primary,
                }}>
                  {selecting ? 'Done' : 'Edit'}
                </Text>
              </Pressable>
            )}
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingVertical: theme.spacing.sm }}>
            {displayedSlots.map((badge, i) => {
              const def = badge ? BADGE_DEFINITIONS.find(d => d.type === badge.badge_type) : null
              // Match the total height BadgeIcon renders: circle(68) + gap(8) + dots(10) + gap(8) + label(28) = 122
              const SLOT_HEIGHT = 68 + 8 + 10 + 8 + 28
              return (
                <View key={i} style={{ alignItems: 'center', gap: theme.spacing.xs }}>
                  <Text style={[shared.caption, { color: theme.colors.subtext }]}>Slot {i + 1}</Text>
                  {def && badge ? (
                    <BadgeIcon def={def} tier={badge.tier} size="lg" showLabel />
                  ) : (
                    <View style={{ height: SLOT_HEIGHT, alignItems: 'center', justifyContent: 'flex-start' }}>
                      <View style={{
                        width: 68, height: 68, borderRadius: 34,
                        borderWidth: 2, borderColor: theme.colors.border,
                        borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Ionicons name="add" size={24} color={theme.colors.subtext} />
                      </View>
                    </View>
                  )}
                </View>
              )
            })}
          </View>

          {displayedCount === 3 && !selecting && (
            <Text style={[shared.caption, { textAlign: 'center', marginTop: theme.spacing.xs, color: theme.colors.subtext }]}>
              Tap Edit to swap badges
            </Text>
          )}
        </View>

        {/* ── All badges grid ── */}
        <View style={[shared.card, { marginTop: theme.spacing.md }]}>
          <View style={[shared.rowBetween, { marginBottom: theme.spacing.md }]}>
            <Text style={shared.subheading}>Your Badges</Text>
            <Text style={[shared.caption, { color: theme.colors.subtext }]}>
              {earnedBadges.length} / {BADGE_DEFINITIONS.length}
            </Text>
          </View>

          {selecting && (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs,
              backgroundColor: theme.colors.primary + '12',
              borderRadius: theme.radius.sm,
              padding: theme.spacing.sm,
              marginBottom: theme.spacing.md,
            }}>
              <Ionicons name="information-circle-outline" size={16} color={theme.colors.primary} />
              <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.primary, flex: 1 }}>
                Tap an earned badge to add or remove it from your display slots.{displayedCount === 3 ? ' All slots full — remove one first.' : ''}
              </Text>
            </View>
          )}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {BADGE_DEFINITIONS.map(def => {
              const badge = badges.find(b => b.badge_type === def.type)
              const isDisplayed = badge?.display_order != null
              const isEarned = (badge?.tier ?? 0) > 0
              const allSlotsFull = displayedCount >= 3
              const isSelected = detailDef?.type === def.type

              return (
                <Pressable
                  key={def.type}
                  onPress={() => {
                    if (selecting) {
                      if (!isEarned) return
                      if (!isDisplayed && allSlotsFull) return
                      void toggleDisplay(badge!)
                    } else {
                      setDetailDef(prev => prev?.type === def.type ? null : def)
                    }
                  }}
                  style={({ pressed }) => ({
                    width: `${100 / cols}%` as any,
                    alignItems: 'center',
                    paddingVertical: theme.spacing.md,
                    paddingHorizontal: theme.spacing.xs,
                    opacity: pressed ? 0.7 : 1,
                    transform: [{ scale: pressed ? 0.94 : 1 }],
                    backgroundColor: isSelected ? theme.colors.primary + '0F' : 'transparent',
                    borderRadius: theme.radius.md,
                  })}
                >
                  <BadgeIcon
                    def={def}
                    tier={badge?.tier}
                    size="sm"
                    showLabel
                    slotNumber={isDisplayed ? badge!.display_order! : undefined}
                  />
                </Pressable>
              )
            })}
          </View>
        </View>

        {/* ── Profile border ── */}
        <View style={[shared.card, { marginTop: theme.spacing.md }]}>
          <Text style={[shared.subheading, { marginBottom: theme.spacing.xs }]}>Profile Border</Text>
          <Text style={[shared.caption, { marginBottom: theme.spacing.md }]}>
            Unlock borders by earning attendance badges.
          </Text>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.lg }}>
            <BorderOption
              label="None"
              unlocked
              selected={!selectedBorder}
              onPress={() => void saveBorder(null)}
              saving={borderSaving}
            />
            {PROFILE_BORDERS.map(border => {
              const unlocked = isBorderUnlocked(border, badges)
              return (
                <BorderOption
                  key={border.type}
                  label={border.label}
                  borderType={border.type}
                  color={border.color}
                  gradientColors={border.gradientColors}
                  unlocked={unlocked}
                  selected={selectedBorder === border.type}
                  description={border.description}
                  onPress={() => void saveBorder(border.type)}
                  saving={borderSaving}
                />
              )
            })}
          </View>
        </View>

      </ScrollView>

      {/* ── Badge detail panel + backdrop ── */}
      {detailDef && (
        <>
          <Pressable
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            onPress={() => setDetailDef(null)}
            accessibilityRole="button"
            accessibilityLabel="Close badge details"
          />
          <BadgeDetailPanel
            def={detailDef}
            badge={detailBadge ?? null}
            onClose={() => setDetailDef(null)}
            bottomInset={insets.bottom}
          />
        </>
      )}
    </View>
  )
}

// ─── Badge detail panel ───────────────────────────────────────────────────────

type BadgeDetailPanelProps = {
  def: BadgeDef
  badge: UserBadge | null
  onClose: () => void
  bottomInset: number
}

function BadgeDetailPanel({ def, badge, onClose, bottomInset }: BadgeDetailPanelProps) {
  const earnedTier = badge?.tier ?? 0
  const [topColor] = BADGE_CATEGORY_GRADIENTS[def.type] ?? ['#888', '#444']
  const isSingleTier = def.tiers.length === 1

  const statUnit: Record<string, string> = {
    events_attended_past: 'events attended',
    events_hosted_past:   'events hosted',
    cheers_received_total:'cheers received',
    cheers_given_events:  'events where you gave cheers',
    spike_cheers:         'spike cheers',
    serve_cheers:         'serve cheers',
    block_cheers:         'block cheers',
    set_cheers:           'set cheers',
    dig_pass_cheers:      'dig/pass cheers',
    communication_cheers: 'communication cheers',
  }
  const unit = statUnit[def.stat]

  return (
    <View style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      backgroundColor: theme.colors.card,
      borderTopLeftRadius: theme.radius.lg,
      borderTopRightRadius: theme.radius.lg,
      paddingTop: theme.spacing.sm,
      paddingBottom: bottomInset + theme.spacing.md,
      paddingHorizontal: theme.spacing.md,
      // Shadow above the panel
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -3 },
      shadowOpacity: 0.12,
      shadowRadius: 12,
      elevation: 16,
    }}>
      {/* Handle */}
      <View style={{ alignItems: 'center', marginBottom: theme.spacing.sm }}>
        <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: theme.colors.border }} />
      </View>

      {/* Header row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, marginBottom: theme.spacing.md }}>
        <BadgeIcon def={def} tier={earnedTier > 0 ? earnedTier : undefined} size="lg" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: theme.font.size.lg, fontWeight: theme.font.weight.bold, color: theme.colors.text }}>
            {badgeTitle(def.type)}
          </Text>
          <Text style={[shared.caption, { color: theme.colors.subtext, marginTop: 2 }]} numberOfLines={2}>
            {def.description}
          </Text>
        </View>
        <Pressable onPress={onClose} hitSlop={10}>
          <Ionicons name="close-circle" size={24} color={theme.colors.subtext} />
        </Pressable>
      </View>

      {/* Tier list */}
      {isSingleTier ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.xs }}>
          <Ionicons
            name={earnedTier > 0 ? 'checkmark-circle' : 'ellipse-outline'}
            size={18}
            color={earnedTier > 0 ? topColor : theme.colors.border}
          />
          <Text style={{ fontSize: theme.font.size.sm, color: earnedTier > 0 ? theme.colors.text : theme.colors.subtext, flex: 1 }}>
            {def.tiers[0].label}
          </Text>
          {earnedTier > 0 && (
            <Text style={{ fontSize: theme.font.size.xs, color: topColor, fontWeight: theme.font.weight.semibold }}>
              Earned
            </Text>
          )}
        </View>
      ) : (
        <View style={{ gap: theme.spacing.xs }}>
          {def.tiers.map(t => {
            const earned = earnedTier >= t.tier
            return (
              <View key={t.tier} style={{
                flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm,
                paddingVertical: 5,
                paddingHorizontal: theme.spacing.sm,
                borderRadius: theme.radius.sm,
                backgroundColor: earned ? topColor + '12' : 'transparent',
              }}>
                <Ionicons
                  name={earned ? 'checkmark-circle' : 'ellipse-outline'}
                  size={16}
                  color={earned ? topColor : theme.colors.border}
                />
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
                  <Text style={{
                    fontSize: theme.font.size.sm,
                    fontWeight: earned ? theme.font.weight.semibold : theme.font.weight.regular,
                    color: earned ? theme.colors.text : theme.colors.subtext,
                  }}>
                    {t.label}
                  </Text>
                  {unit && (
                    <Text style={{ fontSize: theme.font.size.xs, color: theme.colors.subtext }}>
                      · {t.threshold} {unit}
                    </Text>
                  )}
                </View>
                {earned && earnedTier === t.tier && (
                  <Text style={{ fontSize: 10, color: topColor, fontWeight: theme.font.weight.semibold }}>
                    Current
                  </Text>
                )}
              </View>
            )
          })}
        </View>
      )}
    </View>
  )
}

// ─── Border option ────────────────────────────────────────────────────────────

type BorderOptionProps = {
  label: string
  borderType?: ProfileBorderType
  color?: string
  gradientColors?: readonly string[]
  selected: boolean
  unlocked: boolean
  description?: string
  saving: boolean
  onPress: () => void
}

function BorderOption({
  label, borderType, color, gradientColors, selected, unlocked, description, saving, onPress,
}: BorderOptionProps) {
  const SIZE = 64
  const RING = 4

  function renderSwatch() {
    if (!borderType) {
      // "None" option
      return (
        <View style={{
          width: SIZE, height: SIZE, borderRadius: SIZE / 2,
          borderWidth: 2, borderColor: theme.colors.border,
          backgroundColor: theme.colors.background,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Ionicons name="close" size={22} color={theme.colors.subtext} />
        </View>
      )
    }

    if (gradientColors && borderType === 'gradient') {
      return (
        <View style={{ width: SIZE + RING * 2, height: SIZE + RING * 2, borderRadius: (SIZE + RING * 2) / 2, overflow: 'hidden', opacity: unlocked ? 1 : 0.3 }}>
          <LinearGradient
            colors={gradientColors as [string, string, ...string[]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ position: 'absolute', inset: 0 }}
          />
          <View style={{
            position: 'absolute', top: RING, left: RING, right: RING, bottom: RING,
            borderRadius: SIZE / 2, backgroundColor: theme.colors.card,
            alignItems: 'center', justifyContent: 'center',
          }}>
            {!unlocked && <Ionicons name="lock-closed" size={18} color={theme.colors.subtext} />}
          </View>
        </View>
      )
    }

    // Solid or gold border
    const isGold = borderType === 'gold'
    return (
      <View style={{ width: SIZE + RING * 2, height: SIZE + RING * 2, borderRadius: (SIZE + RING * 2) / 2, overflow: 'hidden', opacity: unlocked ? 1 : 0.3 }}>
        <LinearGradient
          colors={isGold ? ['#FFE066', color!, '#CC8800'] as [string, string, string] : [color!, color!] as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: 'absolute', inset: 0 }}
        />
        <View style={{
          position: 'absolute', top: RING, left: RING, right: RING, bottom: RING,
          borderRadius: SIZE / 2, backgroundColor: theme.colors.card,
          alignItems: 'center', justifyContent: 'center',
        }}>
          {!unlocked && <Ionicons name="lock-closed" size={18} color={theme.colors.subtext} />}
        </View>
      </View>
    )
  }

  return (
    <Pressable
      onPress={() => { if (unlocked && !saving) onPress() }}
      disabled={!unlocked || saving}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: !unlocked }}
      accessibilityHint={description}
      style={({ pressed }) => ({
        alignItems: 'center', gap: theme.spacing.xs,
        opacity: pressed && unlocked ? 0.75 : 1,
      })}
    >
      <View style={{ position: 'relative' }}>
        {renderSwatch()}
        {selected && unlocked && (
          <View style={{
            position: 'absolute', bottom: -2, right: -2,
            width: 20, height: 20, borderRadius: 10,
            backgroundColor: theme.colors.primary,
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 2, borderColor: theme.colors.card,
          }}>
            <Ionicons name="checkmark" size={11} color="#fff" />
          </View>
        )}
      </View>
      <Text style={{
        fontSize: theme.font.size.xs,
        fontWeight: selected ? theme.font.weight.semibold : theme.font.weight.regular,
        color: unlocked ? theme.colors.text : theme.colors.subtext,
        opacity: unlocked ? 1 : 0.5,
      }}>
        {label}
      </Text>
      {!unlocked && description && (
        <Text style={{ fontSize: 9, color: theme.colors.subtext, textAlign: 'center', maxWidth: 72, opacity: 0.7 }} numberOfLines={2}>
          {description}
        </Text>
      )}
    </Pressable>
  )
}

