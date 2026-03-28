import { View, Text } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { shared, theme } from '../constants'

type Props = {
  value: Date
  onChange: (date: Date) => void
}

function toDateInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function toTimeInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const css = `
  .vclub-field-wrap {
    display: flex;
    align-items: center;
    gap: ${theme.spacing.sm}px;
    background: ${theme.colors.card};
    border: 1.5px solid ${theme.colors.border};
    border-radius: ${theme.radius.md}px;
    padding: ${theme.spacing.sm + 4}px ${theme.spacing.md}px;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
    cursor: pointer;
    flex: 1;
  }
  .vclub-field-wrap:hover {
    border-color: ${theme.colors.primary}80;
  }
  .vclub-field-wrap:focus-within {
    border-color: ${theme.colors.primary};
    box-shadow: 0 0 0 3px ${theme.colors.primary}28;
  }
  .vclub-date-input,
  .vclub-time-input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: none;
    outline: none;
    cursor: pointer;
    font-family: inherit !important;
    font-size: ${theme.font.size.md}px !important;
    font-weight: ${theme.font.weight.medium} !important;
    color: ${theme.colors.text} !important;
  }
  .vclub-date-input::-webkit-calendar-picker-indicator,
  .vclub-time-input::-webkit-calendar-picker-indicator {
    cursor: pointer;
    opacity: 0.45;
    transition: opacity 0.15s;
  }
  .vclub-date-input::-webkit-calendar-picker-indicator:hover,
  .vclub-time-input::-webkit-calendar-picker-indicator:hover {
    opacity: 1;
  }
`

export function DatePickerField({ value: date, onChange }: Props) {
  function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.value) return
    const [y, m, d] = e.target.value.split('-').map(Number)
    const updated = new Date(date)
    updated.setFullYear(y, m - 1, d)
    onChange(updated)
  }

  function handleTimeChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.value) return
    const [h, min] = e.target.value.split(':').map(Number)
    const updated = new Date(date)
    updated.setHours(h, min)
    onChange(updated)
  }

  return (
    <View style={shared.inputContainer}>
      {/* @ts-ignore — plain HTML on web */}
      <style>{css}</style>
      <Text style={shared.label}>Date & Time</Text>
      {/* @ts-ignore */}
      <div style={{ display: 'flex', gap: theme.spacing.sm }}>
        {/* @ts-ignore */}
        <div className="vclub-field-wrap">
          <Ionicons name="calendar-outline" size={16} color={theme.colors.subtext} />
          {/* @ts-ignore */}
          <input
            type="date"
            className="vclub-date-input"
            min={toDateInputValue(new Date())}
            value={toDateInputValue(date)}
            onChange={handleDateChange}
          />
        </div>
        {/* @ts-ignore */}
        <div className="vclub-field-wrap">
          <Ionicons name="time-outline" size={16} color={theme.colors.subtext} />
          {/* @ts-ignore */}
          <input
            type="time"
            className="vclub-time-input"
            value={toTimeInputValue(date)}
            onChange={handleTimeChange}
          />
        </div>
      </div>
    </View>
  )
}
