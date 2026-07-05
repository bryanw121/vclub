import React from 'react'
import { ScrollView, ScrollViewProps, StyleProp, View, ViewStyle } from 'react-native'

type Props = ScrollViewProps & {
  /**
   * When true (mobile web document-scroll mode), render a plain View so the
   * content flows in the document and the BODY scrolls — this is what lets
   * Safari/Chrome collapse their URL bars. When false, behave exactly like
   * a ScrollView (native + app-shell web).
   */
  docScroll: boolean
  children?: React.ReactNode
}

export function DocScrollView({ docScroll, children, style, contentContainerStyle, ...rest }: Props) {
  if (docScroll) {
    return (
      <View style={[style as StyleProp<ViewStyle>, contentContainerStyle as StyleProp<ViewStyle>, { flex: undefined } as ViewStyle]}>
        {children}
      </View>
    )
  }
  return (
    <ScrollView style={style} contentContainerStyle={contentContainerStyle} {...rest}>
      {children}
    </ScrollView>
  )
}
