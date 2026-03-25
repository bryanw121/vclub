import { View, Text, TextInput, StyleSheet } from 'react-native'
import { shared, theme } from '../constants'

type Props = {
  value: Date
  onChange: (date: Date) => void
}

/** Formats a Date to the "datetime-local" input value format: YYYY-MM-DDTHH:MM */
function toInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Returns today's date formatted as YYYY-MM-DDTHH:MM (the min value for the input) */
function todayInputValue(): string {
  return toInputValue(new Date())
}

export function DatePickerField({ value, onChange }: Props) {
  function handleChange(text: string) {
    const parsed = new Date(text)
    if (!isNaN(parsed.getTime())) onChange(parsed)
  }

  return (
    <View style={shared.inputContainer}>
      <Text style={shared.label}>Date & Time</Text>
      <View style={shared.pickerBox}>
        {/* @ts-ignore — 'type' and 'min' are valid HTML input attributes on web */}
        <TextInput
          style={styles.input}
          // @ts-ignore
          type="datetime-local"
          min={todayInputValue()}
          value={toInputValue(value)}
          onChangeText={handleChange}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  input: {
    fontSize: theme.font.size.md,
    color: theme.colors.text,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
})
