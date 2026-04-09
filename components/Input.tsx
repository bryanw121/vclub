import { forwardRef, useState } from 'react'
import { TextInput, Text, View, TouchableOpacity, TextInputProps, StyleProp, ViewStyle, TextStyle, Platform } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { shared, theme } from '../constants'

type Props = {
  label?: string
  value: string
  onChangeText: (text: string) => void
  placeholder?: string
  secureTextEntry?: boolean
  showPasswordToggle?: boolean
  multiline?: boolean
  numberOfLines?: number
  error?: string
  returnKeyType?: TextInputProps['returnKeyType']
  onSubmitEditing?: () => void
  blurOnSubmit?: boolean
  autoCapitalize?: TextInputProps['autoCapitalize']
  keyboardType?: TextInputProps['keyboardType']
  autoCorrect?: boolean
  containerStyle?: StyleProp<ViewStyle>
  inputStyle?: StyleProp<TextStyle>
  onFocus?: TextInputProps['onFocus']
  onSelectionChange?: TextInputProps['onSelectionChange']
  includeFontPadding?: boolean
  maxLength?: number
}

export const Input = forwardRef<TextInput, Props>(function Input(
  { label, value, onChangeText, placeholder, secureTextEntry, showPasswordToggle, multiline, numberOfLines,
    error, returnKeyType, onSubmitEditing, blurOnSubmit, autoCapitalize, keyboardType, autoCorrect,
    containerStyle, inputStyle, onFocus, onSelectionChange, includeFontPadding, maxLength },
  ref
) {
  const [visible, setVisible] = useState(false)
  const isSecure = secureTextEntry && !visible

  return (
    <View style={[shared.inputContainer, containerStyle]}>
      {label && <Text style={shared.label}>{label}</Text>}
      <View style={{ position: 'relative' }}>
        <TextInput
          ref={ref}
          style={[
            shared.input,
            multiline && !inputStyle && shared.inputMultiline,
            !!error && shared.inputError,
            showPasswordToggle && { paddingRight: 44 },
            // Prevent iOS Safari auto-zoom (triggered when font-size < 16px)
            Platform.OS === 'web' && { fontSize: 16 },
            inputStyle,
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.subtext}
          secureTextEntry={isSecure}
          multiline={multiline}
          numberOfLines={numberOfLines}
          maxLength={maxLength}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          blurOnSubmit={blurOnSubmit}
          autoCapitalize={autoCapitalize}
          keyboardType={keyboardType}
          autoCorrect={autoCorrect}
          onFocus={onFocus}
          onSelectionChange={onSelectionChange}
          {...(includeFontPadding !== undefined ? ({ includeFontPadding } as TextInputProps) : {})}
        />
        {showPasswordToggle && (
          <TouchableOpacity
            onPress={() => setVisible(v => !v)}
            style={{ position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center', padding: 4 }}
            hitSlop={8}
          >
            <Ionicons
              name={visible ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={theme.colors.subtext}
            />
          </TouchableOpacity>
        )}
      </View>
      {error && <Text style={shared.inputErrorText}>{error}</Text>}
    </View>
  )
})
