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

const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]
const HOURS12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

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
  .vclub-date-input {
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
  .vclub-date-input::-webkit-calendar-picker-indicator {
    cursor: pointer;
    opacity: 0.45;
    transition: opacity 0.15s;
  }
  .vclub-date-input::-webkit-calendar-picker-indicator:hover {
    opacity: 1;
  }
  .vclub-time-select {
    background: transparent;
    border: none;
    outline: none;
    cursor: pointer;
    font-family: inherit !important;
    font-size: ${theme.font.size.md}px !important;
    font-weight: ${theme.font.weight.medium} !important;
    color: ${theme.colors.text} !important;
    padding: 0;
    appearance: none;
    -webkit-appearance: none;
    text-align: center;
  }
  .vclub-time-sep {
    font-size: ${theme.font.size.md}px;
    font-weight: ${theme.font.weight.medium};
    color: ${theme.colors.subtext};
    user-select: none;
  }
`

export function DatePickerField({ value: date, onChange }: Props) {
  const hours24 = date.getHours()
  const period  = hours24 >= 12 ? 'PM' : 'AM'
  const hours12 = hours24 % 12 || 12
  const minutes = Math.round(date.getMinutes() / 5) * 5 % 60

  function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.value) return
    const [y, m, d] = e.target.value.split('-').map(Number)
    const updated = new Date(date)
    updated.setFullYear(y, m - 1, d)
    onChange(updated)
  }

  function handleHourChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const h12 = Number(e.target.value)
    const h24 = (h12 % 12) + (period === 'PM' ? 12 : 0)
    const updated = new Date(date)
    updated.setHours(h24, minutes)
    onChange(updated)
  }

  function handleMinuteChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const updated = new Date(date)
    updated.setHours(hours24, Number(e.target.value))
    onChange(updated)
  }

  function handlePeriodChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const p = e.target.value as 'AM' | 'PM'
    const h24 = (hours12 % 12) + (p === 'PM' ? 12 : 0)
    const updated = new Date(date)
    updated.setHours(h24, minutes)
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
        <div className="vclub-field-wrap" style={{ gap: 2 }}>
          <Ionicons name="time-outline" size={16} color={theme.colors.subtext} />
          {/* @ts-ignore */}
          <select className="vclub-time-select" value={hours12} onChange={handleHourChange}>
            {HOURS12.map(h => (
              // @ts-ignore
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
          {/* @ts-ignore */}
          <span className="vclub-time-sep">:</span>
          {/* @ts-ignore */}
          <select className="vclub-time-select" value={minutes} onChange={handleMinuteChange}>
            {MINUTES.map(m => (
              // @ts-ignore
              <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
            ))}
          </select>
          {/* @ts-ignore */}
          <select className="vclub-time-select" value={period} onChange={handlePeriodChange}>
            {/* @ts-ignore */}
            <option value="AM">AM</option>
            {/* @ts-ignore */}
            <option value="PM">PM</option>
          </select>
        </div>
      </div>
    </View>
  )
}
