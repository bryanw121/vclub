import { View, Text } from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { shared } from '../constants'

type Props = {
  value: Date
  onChange: (date: Date) => void
}

export function DatePickerField({ value, onChange }: Props) {
  return (
    <View style={shared.inputContainer}>
      <Text style={shared.label}>Date & Time</Text>
      <View style={shared.pickerBox}>
        <View style={shared.pickerRow}>
          <View style={shared.pickerItem}>
            <Text style={shared.pickerLabel}>Date</Text>
            <DateTimePicker
              value={value}
              mode="date"
              display="compact"
              minimumDate={new Date()}
              themeVariant="light"
              onChange={(_, d) => { if (d) onChange(d) }}
            />
          </View>
          <View style={shared.pickerDivider} />
          <View style={shared.pickerItem}>
            <Text style={shared.pickerLabel}>Time</Text>
            <DateTimePicker
              value={value}
              mode="time"
              display="compact"
              themeVariant="light"
              onChange={(_, d) => { if (d) onChange(d) }}
            />
          </View>
        </View>
      </View>
    </View>
  )
}
