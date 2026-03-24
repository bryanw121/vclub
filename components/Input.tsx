import { TextInput, Text, View } from 'react-native'
import { shared, theme } from '../constants'

type Props = {
  label?: string
  value: string
  onChangeText: (text: string) => void
  placeholder?: string
  secureTextEntry?: boolean
  multiline?: boolean
  numberOfLines?: number
}

export function Input({ label, value, onChangeText, placeholder, secureTextEntry, multiline, numberOfLines }: Props) {
  return (
    <View style={shared.inputContainer}>
      {label && <Text style={shared.label}>{label}</Text>}
      <TextInput
        style={[shared.input, multiline && shared.inputMultiline]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.subtext}
        secureTextEntry={secureTextEntry}
        multiline={multiline}
        numberOfLines={numberOfLines}
      />
    </View>
  )
}
