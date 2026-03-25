import { forwardRef } from 'react'
import { TextInput, Text, View, TextInputProps } from 'react-native'
import { shared, theme } from '../constants'

type Props = {
  label?: string
  value: string
  onChangeText: (text: string) => void
  placeholder?: string
  secureTextEntry?: boolean
  multiline?: boolean
  numberOfLines?: number
  error?: string
  returnKeyType?: TextInputProps['returnKeyType']
  onSubmitEditing?: () => void
  blurOnSubmit?: boolean
  autoCapitalize?: TextInputProps['autoCapitalize']
  keyboardType?: TextInputProps['keyboardType']
  autoCorrect?: boolean
}

export const Input = forwardRef<TextInput, Props>(function Input(
  { label, value, onChangeText, placeholder, secureTextEntry, multiline, numberOfLines,
    error, returnKeyType, onSubmitEditing, blurOnSubmit, autoCapitalize, keyboardType, autoCorrect },
  ref
) {
  return (
    <View style={shared.inputContainer}>
      {label && <Text style={shared.label}>{label}</Text>}
      <TextInput
        ref={ref}
        style={[shared.input, multiline && shared.inputMultiline, !!error && shared.inputError]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.subtext}
        secureTextEntry={secureTextEntry}
        multiline={multiline}
        numberOfLines={numberOfLines}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        blurOnSubmit={blurOnSubmit}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        autoCorrect={autoCorrect}
      />
      {error && <Text style={shared.inputErrorText}>{error}</Text>}
    </View>
  )
})
