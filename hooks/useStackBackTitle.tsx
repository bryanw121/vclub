import React, { useLayoutEffect } from 'react'
import { HeaderBackButton, type HeaderBackButtonProps } from '@react-navigation/elements'
import { useNavigation } from 'expo-router'
import { theme } from '../constants/theme'

/**
 * Settings subpages: chevron-only back (no label beside the arrow) and no duplicate
 * title in the nav bar — the screen card already shows the heading.
 */
export function useStackBackTitle() {
  const navigation = useNavigation()

  useLayoutEffect(() => {
    navigation.setOptions({
      title: '',
      headerTitle: '',
      headerBackTitle: '',
      headerLeft: (props: HeaderBackButtonProps) => (
        <HeaderBackButton
          {...props}
          displayMode="minimal"
          tintColor={props.tintColor ?? theme.colors.primary}
        />
      ),
    })
  }, [navigation])
}
