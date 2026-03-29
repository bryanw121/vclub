import React, { useLayoutEffect } from 'react'
import { HeaderBackButton, type HeaderBackButtonProps } from '@react-navigation/elements'
import { useNavigation } from 'expo-router'
import { theme } from '../constants/theme'

/**
 * Settings routes render under `settings/_layout` → `<Slot />`, which uses an inner
 * stack that does not paint the native header. The visible bar is the parent `(tabs)`
 * stack, so we set options on `getParent()` as well as the leaf navigator.
 */
export function useStackBackTitle(screenTitle: string) {
  const navigation = useNavigation()

  useLayoutEffect(() => {
    const opts = {
      title: screenTitle,
      headerTitle: screenTitle,
      headerTitleAlign: 'left' as const,
      headerBackTitle: '',
      headerLeft: (props: HeaderBackButtonProps) => (
        <HeaderBackButton
          {...props}
          displayMode="minimal"
          tintColor={props.tintColor ?? theme.colors.primary}
        />
      ),
    }
    navigation.setOptions(opts)
    navigation.getParent()?.setOptions(opts)
  }, [navigation, screenTitle])
}
