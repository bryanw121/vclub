import React from 'react'
import { Platform, Text, TouchableOpacity, View } from 'react-native'
import { theme } from '../../constants'

export const EVENT_TABS = ['Details', 'People', 'Discussion', 'Cheers'] as const

type Props = {
  activeTab: number
  /** Count badge on People (attending incl. +1s); hidden at 0. */
  peopleCount: number
  onSelect: (index: number) => void
}

/** Underlined text tabs under the event banner. testIDs: `event-tab-<label>`. */
export function EventTabBar({ activeTab, peopleCount, onSelect }: Props) {
  return (
    <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
      {EVENT_TABS.map((label, i) => {
        const active = activeTab === i
        const badge = i === 1 && peopleCount > 0 ? peopleCount : 0
        return (
          <TouchableOpacity
            key={label}
            testID={`event-tab-${label.toLowerCase()}`}
            onPress={() => onSelect(i)}
            style={[
              { flex: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5, paddingVertical: 13 },
              Platform.OS === 'web' && ({ outlineStyle: 'none' } as any),
            ]}
          >
            <Text style={{
              fontFamily: active ? theme.fonts.bodySemiBold : theme.fonts.body,
              fontSize: theme.font.size.sm,
              color: active ? theme.colors.text : theme.colors.subtext,
            }}>
              {label}
            </Text>
            {badge > 0 && (
              <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: active ? theme.colors.primary : theme.colors.border }}>
                <Text style={{ fontFamily: theme.fonts.bodyBold, fontSize: theme.font.size.xs, color: active ? theme.colors.white : theme.colors.subtext }}>{badge}</Text>
              </View>
            )}
            {active && (
              <View style={{ position: 'absolute', bottom: 0, left: 10, right: 10, height: 2.5, backgroundColor: theme.colors.primary, borderRadius: 2 }} />
            )}
          </TouchableOpacity>
        )
      })}
    </View>
  )
}
