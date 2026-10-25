import React from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import { theme } from '../../constants'
import { SCHEDULE_OPTIONS } from '../../constants/tournamentCopy'
import { Button } from '../Button'
import type { ScheduleConfig } from '../../types/tournamentScreen'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: theme.colors.text }}>{label}</Text>
      {children}
    </View>
  )
}

function Choices<T extends number | null>({ options, value, onSelect, labelFor, padding = 12, wrap }: {
  options: readonly T[]
  value: T
  onSelect: (v: T) => void
  labelFor?: (v: T) => string
  padding?: number
  wrap?: boolean
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: wrap ? 'wrap' : 'nowrap' }}>
      {options.map(n => {
        const active = value === n
        return (
          <TouchableOpacity
            key={String(n)}
            onPress={() => onSelect(n)}
            accessibilityState={{ selected: active }}
            style={{ paddingHorizontal: padding, paddingVertical: 8, borderRadius: 8, backgroundColor: active ? theme.colors.primary : theme.colors.border }}
          >
            <Text style={{ fontSize: 13, color: active ? theme.colors.onPrimary : theme.colors.text }}>{labelFor ? labelFor(n) : String(n)}</Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

type Props = {
  config: ScheduleConfig
  onChange: (config: ScheduleConfig) => void
  submitLabel: string
  onSubmit: () => void
  busy: boolean
  /** Disable the submit button (e.g. fewer than two teams). */
  disabled?: boolean
}

/** The four generator settings plus the submit button. Used for both first-time generate and regenerate. */
export function ScheduleConfigForm({ config, onChange, submitLabel, onSubmit, busy, disabled }: Props) {
  const set = (patch: Partial<ScheduleConfig>) => onChange({ ...config, ...patch })
  return (
    <View style={{ gap: 16 }}>
      <Field label={`Courts (${config.numCourts})`}>
        <Choices options={SCHEDULE_OPTIONS.courts} value={config.numCourts} onSelect={v => set({ numCourts: v })} padding={14} />
      </Field>
      <Field label={`Match duration (${config.matchDuration} min)`}>
        <Choices options={SCHEDULE_OPTIONS.matchDuration} value={config.matchDuration} onSelect={v => set({ matchDuration: v })} />
      </Field>
      <Field label={`Break between matches (${config.breakDuration} min)`}>
        <Choices options={SCHEDULE_OPTIONS.breakDuration} value={config.breakDuration} onSelect={v => set({ breakDuration: v })} />
      </Field>
      <Field label={`Games per team (${config.gamesPerTeam ?? 'Full round-robin'})`}>
        <Choices
          options={SCHEDULE_OPTIONS.gamesPerTeam}
          value={config.gamesPerTeam}
          onSelect={v => set({ gamesPerTeam: v })}
          labelFor={v => (v === null ? 'Full' : String(v))}
          wrap
        />
        <Text style={{ fontSize: 11, color: theme.colors.subtext, marginTop: 4 }}>How many different opponents each team faces. Full = everyone plays everyone.</Text>
      </Field>
      <Button label={submitLabel} onPress={onSubmit} loading={busy} disabled={disabled} />
    </View>
  )
}
