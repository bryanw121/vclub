import React, { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Platform, Pressable, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Linking from 'expo-linking'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { theme } from '../../constants'
import { routes } from '../../utils/routes'

type IoniconName = React.ComponentProps<typeof Ionicons>['name']

type Props = {
  eventId: string
  title: string | undefined
  /** Host or co-host: show edit + delete. */
  canManage: boolean
  deleting: boolean
  onBack: () => void
  onEdit: () => void
  onDelete: () => void
}

const IS_WEB = Platform.OS === 'web'

function ShareMenuItem({ icon, label, onPress, active }: { icon: IoniconName; label: string; onPress: () => void; active?: boolean }) {
  const [hovered, setHovered] = useState(false)
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[styles.shareMenuItem, hovered && { backgroundColor: theme.colors.background }]}
    >
      <Ionicons name={icon} size={16} color={active ? theme.colors.success : theme.colors.text} />
      <Text style={[styles.shareMenuText, active && { color: theme.colors.success }]}>{label}</Text>
    </Pressable>
  )
}

/**
 * Back + share (+ edit / delete for hosts) for the event page. One component,
 * two looks: on web an in-flow header row with flat round buttons and a share
 * dropdown (copy link / Web Share); on native floating card-style pills over
 * the banner, and share opens the OS share sheet.
 */
export function EventHeaderActions({ eventId, title, canManage, deleting, onBack, onEdit, onDelete }: Props) {
  const insets = useSafeAreaInsets()
  const [menuOpen, setMenuOpen] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current) }, [])

  async function handleShare() {
    if (IS_WEB) {
      setMenuOpen(v => !v)
      return
    }
    const url = Linking.createURL(routes.event(eventId))
    await Share.share({ message: `Check out "${title ?? 'Event'}" on vclub:\n${url}`, url })
  }

  async function handleCopyLink() {
    await navigator.clipboard.writeText(window.location.href)
    setLinkCopied(true)
    if (copiedTimer.current) clearTimeout(copiedTimer.current)
    copiedTimer.current = setTimeout(() => setLinkCopied(false), 2000)
  }

  async function handleWebShare() {
    await navigator.share({ title: title ?? 'Event', url: window.location.href })
    setMenuOpen(false)
  }

  /** Round icon button in this platform's look. */
  const button = (icon: IoniconName, color: string, onPress: () => void, opts?: { testID?: string; danger?: boolean; busy?: boolean; size?: number }) => (
    <Pressable
      testID={opts?.testID}
      onPress={onPress}
      hitSlop={IS_WEB ? undefined : 8}
      style={({ pressed }) => IS_WEB
        ? [styles.webBtn, pressed && { backgroundColor: (opts?.danger ? theme.colors.error : theme.colors.primary) + '14' }]
        : [styles.floatBtn, pressed && { opacity: 0.75 }]}
    >
      {opts?.busy
        ? <ActivityIndicator size="small" color={theme.colors.error} />
        : <Ionicons name={icon} size={opts?.size ?? (IS_WEB ? 20 : 19)} color={color} />}
    </Pressable>
  )

  // Web uses brand-coloured icons on the flat header; native pills use text colour.
  const actionColor = IS_WEB ? theme.colors.primary : theme.colors.text

  return (
    <View
      pointerEvents={IS_WEB ? 'auto' : 'box-none'}
      style={IS_WEB ? styles.webBar : [styles.floatBar, { top: insets.top + 8 }]}
    >
      {button('chevron-back', theme.colors.text, onBack, { size: IS_WEB ? 22 : 20 })}
      <View style={IS_WEB ? styles.webActions : styles.floatActions}>
        <View>
          {button('share-outline', actionColor, () => { void handleShare() })}
          {IS_WEB && menuOpen && (
            <>
              <TouchableOpacity style={styles.menuBackdrop} onPress={() => setMenuOpen(false)} />
              <View style={styles.shareMenu}>
                {!!navigator.share && (
                  <ShareMenuItem icon="share-social-outline" label="Share…" onPress={() => { void handleWebShare() }} />
                )}
                <ShareMenuItem
                  icon={linkCopied ? 'checkmark' : 'link-outline'}
                  label={linkCopied ? 'Copied!' : 'Copy link'}
                  onPress={() => { void handleCopyLink() }}
                  active={linkCopied}
                />
              </View>
            </>
          )}
        </View>
        {canManage && (
          <>
            {button('create-outline', actionColor, onEdit, { testID: 'event-edit-button' })}
            {button('trash-outline', theme.colors.error, onDelete, { danger: true, busy: deleting })}
          </>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  webBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    zIndex: 10,
    backgroundColor: theme.colors.background,
  },
  webActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  webBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  floatBar: {
    position: 'absolute',
    left: theme.spacing.md,
    right: theme.spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 50,
  },
  floatActions: { flexDirection: 'row', gap: theme.spacing.xs },
  floatBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  // Web only: `fixed` covers the viewport so any outside click closes the menu.
  menuBackdrop: { position: 'fixed' as 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  shareMenu: {
    position: 'absolute',
    top: 32,
    right: 0,
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 100,
    minWidth: 148,
    overflow: 'hidden',
  },
  shareMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  shareMenuText: {
    fontSize: theme.font.size.md,
    color: theme.colors.text,
  },
})
