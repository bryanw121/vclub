import React, { useEffect, useId } from 'react'
import { View, Text } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Svg, {
  Defs,
  LinearGradient as SvgGrad,
  Stop,
  Circle as SvgCircle,
  Line as SvgLine,
} from 'react-native-svg'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated'
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
const FRAME:  Record<'sm' | 'lg', number> = { sm: 58, lg: 80 }
const BADGE:  Record<'sm' | 'lg', number> = { sm: 44, lg: 62 }
const ICON:   Record<'sm' | 'lg', number> = { sm: 20, lg: 28 }
const GAP:    Record<'sm' | 'lg', number> = { sm: 5,  lg: 8  }
const DOTS_H     = 10
const LABEL_LINE = 14
const LABEL_H    = LABEL_LINE * 2

const PI = Math.PI

// ─── Gradient stop definitions per tier ───────────────────────────────────────
// Diagonal top-left (bright highlight) → bottom-right (dark shadow) = metallic 3D coin look.
type GS = { offset: string; color: string }
const TIER_STOPS: Record<number, GS[]> = {
  1: [
    { offset: '0',   color: '#D4924A' }, // bright bronze highlight
    { offset: '0.4', color: '#CD7F32' }, // mid bronze
    { offset: '1',   color: '#6B3510' }, // deep bronze shadow
  ],
  2: [
    { offset: '0',   color: '#E8E8E8' }, // bright silver highlight
    { offset: '0.4', color: '#B0B0B0' }, // mid silver
    { offset: '1',   color: '#606060' }, // dark silver shadow
  ],
  3: [
    { offset: '0',   color: '#FFF066' }, // bright gold highlight
    { offset: '0.4', color: '#FFD700' }, // mid gold
    { offset: '1',   color: '#B8760A' }, // deep gold shadow
  ],
  4: [
    { offset: '0',   color: '#E8F4FF' }, // bright platinum highlight
    { offset: '0.4', color: '#C8DCF0' }, // mid platinum
    { offset: '1',   color: '#6A8FAA' }, // platinum shadow
  ],
  5: [
    { offset: '0',    color: '#C4B5FD' }, // violet
    { offset: '0.25', color: '#7DD3FC' }, // sky blue
    { offset: '0.5',  color: '#6EE7B7' }, // emerald
    { offset: '0.75', color: '#FDE68A' }, // amber
    { offset: '1',    color: '#FDA4AF' }, // rose
  ],
}

// ─── Coin-style SVG frame ─────────────────────────────────────────────────────
// All tiers: circular gradient ring + coin-ridge tick marks.
// Higher tiers add accent rings and decorative dots.
const TIER_TICKS = [0, 24, 36, 48, 60, 72]  // tick count per tier
const TIER_DOTS  = [0,  0,  4,  8, 12, 16]  // decorative dot count per tier

function CoinFrame({ fs, badgeR, outerR, tier, gradId }: {
  fs: number; badgeR: number; outerR: number; tier: number; gradId: string
}) {
  const cx = fs / 2
  const cy = fs / 2
  const midR = (outerR + badgeR) / 2
  const sw   = outerR - badgeR      // ring stroke width

  const stops = TIER_STOPS[tier] ?? TIER_STOPS[1]
  const tickCount = TIER_TICKS[tier] ?? TIER_TICKS[1]
  const dotCount  = TIER_DOTS[tier]  ?? 0

  // Coin ridge ticks — span the full ring width, hairline gaps at edges
  const tickInner = badgeR + 0.8
  const tickOuter = outerR - 0.8
  const ticks = Array.from({ length: tickCount }, (_, i) => {
    const a = (2 * PI * i) / tickCount
    return {
      x1: (cx + tickInner * Math.cos(a)).toFixed(2),
      y1: (cy + tickInner * Math.sin(a)).toFixed(2),
      x2: (cx + tickOuter * Math.cos(a)).toFixed(2),
      y2: (cy + tickOuter * Math.sin(a)).toFixed(2),
    }
  })

  // Decorative dots — placed at mid-ring radius, start from top (−π/2)
  const dotR    = 1.5
  const dotRing = midR
  const dots = Array.from({ length: dotCount }, (_, i) => {
    const a = (2 * PI * i) / dotCount - PI / 2
    return {
      cx: (cx + dotRing * Math.cos(a)).toFixed(2),
      cy: (cy + dotRing * Math.sin(a)).toFixed(2),
    }
  })

  // gradId is unique per badge instance — prevents SVG gradient ID collisions
  // on web where all inline SVG defs share the same global HTML document scope.
  const gUrl = `url(#${gradId})`

  const gradDef = (
    <Defs>
      <SvgGrad id={gradId} x1="0" y1="0" x2="1" y2="1">
        {stops.map(s => (
          <Stop key={s.offset} offset={s.offset} stopColor={s.color} stopOpacity="1" />
        ))}
      </SvgGrad>
    </Defs>
  )

  return (
    <Svg width={fs} height={fs}>
      {gradDef}

      {/* ── Main coin ring ── */}
      <SvgCircle cx={cx} cy={cy} r={midR} stroke={gUrl} strokeWidth={sw} fill="none" />

      {/* ── Coin ridge ticks (semi-transparent white for 3D emboss effect) ── */}
      {ticks.map((t, i) => (
        <SvgLine
          key={i}
          x1={t.x1} y1={t.y1}
          x2={t.x2} y2={t.y2}
          stroke="rgba(255,255,255,0.42)"
          strokeWidth={0.9}
        />
      ))}

      {/* ── T3+: thin inner accent ring (just outside badge circle) ── */}
      {tier >= 3 && (
        <SvgCircle
          cx={cx} cy={cy}
          r={badgeR + 0.8}
          stroke={gUrl}
          strokeWidth={0.9}
          fill="none"
          opacity={0.65}
        />
      )}

      {/* ── T4+: thin outer accent ring (just inside frame edge) ── */}
      {tier >= 4 && (
        <SvgCircle
          cx={cx} cy={cy}
          r={outerR - 0.8}
          stroke={gUrl}
          strokeWidth={0.9}
          fill="none"
          opacity={0.65}
        />
      )}

      {/* ── T2+: pearl-white decorative dots embossed on the ring ── */}
      {dots.map((d, i) => (
        <SvgCircle key={i} cx={d.cx} cy={d.cy} r={dotR} fill="rgba(255,255,255,0.82)" />
      ))}

      {/* ── T5: extra outer glow ring at frame edge ── */}
      {tier >= 5 && (
        <SvgCircle
          cx={cx} cy={cy}
          r={outerR + 0.4}
          stroke={gUrl}
          strokeWidth={0.8}
          fill="none"
          opacity={0.55}
        />
      )}
    </Svg>
  )
}

// ─── BadgeIcon ────────────────────────────────────────────────────────────────
export function BadgeIcon({ def, tier, size = 'sm', showLabel = false, slotNumber }: Props) {
  // Unique per component instance — prevents SVG gradient ID collisions in the
  // global HTML document scope on web (inline SVGs share one ID namespace).
  const rawId  = useId()
  const gradId = `cg${rawId.replace(/[^a-zA-Z0-9]/g, '')}`

  const earned    = (tier ?? 0) > 0
  const fs        = FRAME[size]
  const badgeSize = BADGE[size]
  const iconSize  = ICON[size]
  const gap       = GAP[size]
  const isTiered  = def.tiers.length > 1

  const badgeR = badgeSize / 2
  const outerR = fs / 2 - 1

  const [topColor, bottomColor] = BADGE_CATEGORY_GRADIENTS[def.type] ?? ['#888', '#444']
  const label = earned ? badgeTierLabel(def, tier!) : def.tiers[0].label

  // Tier 5: slow coin spin on the starburst frame
  const rot = useSharedValue(0)
  useEffect(() => {
    if ((tier ?? 0) >= 5) {
      rot.value = withRepeat(withTiming(360, { duration: 9000, easing: Easing.linear }), -1, false)
    } else {
      rot.value = 0
    }
  }, [tier])
  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rot.value}deg` }],
  }))

  return (
    <View style={{ alignItems: 'center', gap }}>

      {/* ── Icon area ── */}
      <View style={{ width: fs, height: fs, alignItems: 'center', justifyContent: 'center' }}>

        {/* Coin frame SVG — behind the badge circle */}
        {earned && (
          <Animated.View
            pointerEvents="none"
            style={[
              { position: 'absolute', top: 0, left: 0 },
              tier === 5 ? spinStyle : undefined,
            ]}
          >
            <CoinFrame
              fs={fs} badgeR={badgeR} outerR={outerR} tier={tier ?? 1}
              gradId={gradId}
            />
          </Animated.View>
        )}

        {/* Badge circle */}
        <View style={{
          width: badgeSize, height: badgeSize,
          borderRadius: badgeR,
          overflow: 'hidden',
          opacity: earned ? 1 : 0.35,
        }}>
          {earned ? (
            <LinearGradient
              colors={[topColor, bottomColor] as [string, string]}
              start={{ x: 0.15, y: 0 }}
              end={{ x: 0.85, y: 1 }}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
            >
              {/* Frosted shine at top */}
              <View style={{
                position: 'absolute',
                top: 0, left: 0, right: 0,
                height: badgeSize * 0.45,
                backgroundColor: 'rgba(255,255,255,0.18)',
                borderTopLeftRadius: badgeR,
                borderTopRightRadius: badgeR,
              }} />
              <Ionicons name={def.icon as any} size={iconSize} color="#fff" />
            </LinearGradient>
          ) : (
            <View style={{
              flex: 1, backgroundColor: theme.colors.border,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Ionicons name="lock-closed-outline" size={iconSize - 2} color={theme.colors.subtext} />
            </View>
          )}
        </View>

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
