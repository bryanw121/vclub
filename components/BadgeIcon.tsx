import React from 'react'
import { View, Text, Image } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { badgeTierLabel, BADGE_CATEGORY_GRADIENTS, type BadgeDef } from '../constants/badges'
import { theme } from '../constants/theme'

type Props = {
  def: BadgeDef
  /** Current earned tier (1–5); 0 or undefined = locked. */
  tier?: number
  size?: 'sm' | 'lg'
  showLabel?: boolean
  /** Slot number (1–3) shown as a pip top-right. */
  slotNumber?: number
}

// ─── Fixed dimensions ─────────────────────────────────────────────────────────
const FRAME: Record<'sm' | 'lg', number> = { sm: 68, lg: 96 }
const ICON:  Record<'sm' | 'lg', number> = { sm: 30, lg: 42 }
const GAP:   Record<'sm' | 'lg', number> = { sm: 5,  lg: 8  }
const DOTS_H     = 10
const LABEL_LINE = 14
const LABEL_H    = LABEL_LINE * 2

// ─── BadgeIcon ────────────────────────────────────────────────────────────────
export function BadgeIcon({ def, tier, size = 'sm', showLabel = false, slotNumber }: Props) {
  const earned   = (tier ?? 0) > 0
  const fs       = FRAME[size]
  const iconSize = ICON[size]
  const gap      = GAP[size]
  const isTiered = def.tiers.length > 1
  const r        = fs / 2

  const [topColor, bottomColor] = BADGE_CATEGORY_GRADIENTS[def.type] ?? ['#888', '#444']
  const label = earned ? badgeTierLabel(def, tier!) : def.tiers[0].label

  return (
    <View style={{ alignItems: 'center', gap }}>

      {/* ── Icon area ── */}
      <View style={{ width: fs, height: fs, alignItems: 'center', justifyContent: 'center' }}>

        {def.imageUri ? (
          // Image badge — renders larger as a free-form sticker using image transparency
          <Image
            source={{ uri: def.imageUri }}
            style={{ width: fs * 1.2, height: fs * 1.2, opacity: earned ? 1 : 0.25 }}
            resizeMode="contain"
          />
        ) : (
          // Standard badge — gradient circle
          <View style={{ width: fs, height: fs, borderRadius: r, overflow: 'hidden', opacity: earned ? 1 : 0.35 }}>
            {earned ? (
              <LinearGradient
                colors={[topColor, bottomColor] as [string, string]}
                start={{ x: 0.15, y: 0 }}
                end={{ x: 0.85, y: 1 }}
                style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
              >
                <View style={{
                  position: 'absolute', top: 0, left: 0, right: 0,
                  height: fs * 0.45,
                  backgroundColor: 'rgba(255,255,255,0.18)',
                  borderTopLeftRadius: r, borderTopRightRadius: r,
                }} />
                <Ionicons name={def.icon as any} size={iconSize} color="#fff" />
              </LinearGradient>
            ) : (
              <View style={{ flex: 1, backgroundColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="lock-closed-outline" size={iconSize - 2} color={theme.colors.subtext} />
              </View>
            )}
          </View>
        )}

        {/* Slot number pip */}
        {slotNumber != null && earned && (
          <View style={{
            position: 'absolute', top: -2, right: -2,
            width: 17, height: 17, borderRadius: 9,
            backgroundColor: theme.colors.primary,
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 2, borderColor: theme.colors.card,
          }}>
            <Text style={{ fontSize: 9, fontWeight: '800', color: '#fff', lineHeight: 12 }}>
              {slotNumber}
            </Text>
          </View>
        )}
      </View>

      {/* ── Tier dots ── */}
      <View style={{ height: DOTS_H, flexDirection: 'row', gap: 3, alignItems: 'center', justifyContent: 'center' }}>
        {isTiered && def.tiers.map((_, i) => {
          const lit = earned && i < (tier ?? 0)
          return (
            <View key={i} style={{
              width: lit ? 6 : 4, height: lit ? 6 : 4,
              borderRadius: 3,
              backgroundColor: lit ? topColor : theme.colors.border,
              opacity: lit ? 1 : 0.5,
            }} />
          )
        })}
      </View>

      {/* ── Label ── */}
      {showLabel && (
        <Text
          numberOfLines={2}
          style={{
            height: LABEL_H,
            fontSize: theme.font.size.xs,
            fontWeight: earned ? theme.font.weight.semibold : theme.font.weight.regular,
            color: earned ? theme.colors.text : theme.colors.subtext,
            textAlign: 'center',
            lineHeight: LABEL_LINE,
            opacity: earned ? 1 : 0.5,
            width: fs - 4,
          }}
        >
          {label}
        </Text>
      )}
    </View>
  )
}
