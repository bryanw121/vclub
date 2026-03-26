import { View, Text } from 'react-native'
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

function formatDisplayDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDisplayTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

const card: React.CSSProperties = {
  position: 'relative',
  backgroundColor: theme.colors.card,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radius.md,
  padding: `${theme.spacing.sm}px ${theme.spacing.md}px`,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  cursor: 'pointer',
  userSelect: 'none',
}

const sublabel: React.CSSProperties = {
  fontSize: theme.font.size.xs,
  fontWeight: theme.font.weight.medium as any,
  color: theme.colors.subtext,
  textTransform: 'uppercase',
  letterSpacing: '0.4px',
  fontFamily: 'inherit',
}

const value: React.CSSProperties = {
  fontSize: theme.font.size.md,
  fontWeight: theme.font.weight.medium as any,
  color: theme.colors.text,
  fontFamily: 'inherit',
}

const overlay: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  opacity: 0,
  cursor: 'pointer',
  width: '100%',
  height: '100%',
  zIndex: 1,
}

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
      <Text style={shared.label}>Date & Time</Text>
      {/* @ts-ignore — plain HTML on web */}
      <div style={{ display: 'flex', gap: theme.spacing.sm }}>
        <div style={{ flex: 1 }}>
          <div style={card}>
            <span style={sublabel}>Date</span>
            <span style={value}>{formatDisplayDate(date)}</span>
            <input
              type="date"
              min={toDateInputValue(new Date())}
              value={toDateInputValue(date)}
              onChange={handleDateChange}
              style={overlay}
            />
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={card}>
            <span style={sublabel}>Time</span>
            <span style={value}>{formatDisplayTime(date)}</span>
            <input
              type="time"
              value={toTimeInputValue(date)}
              onChange={handleTimeChange}
              style={overlay}
            />
          </div>
        </div>
      </div>
    </View>
  )
}
