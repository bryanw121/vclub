import React from 'react'
import { ScrollView, ScrollViewProps, StyleProp, View, ViewStyle } from 'react-native'
import type { RefreshControlProps } from 'react-native'
import { DocPullToRefresh } from './RefreshControl'

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
    // No ScrollView to hang `refreshControl` on: the body scrolls, so pull-to-refresh
    // listens on the document instead (#35).
    const pull = React.isValidElement<RefreshControlProps>(rest.refreshControl) ? rest.refreshControl.props : null
    return (
      <View style={[style as StyleProp<ViewStyle>, contentContainerStyle as StyleProp<ViewStyle>, { flex: undefined } as ViewStyle]}>
        {pull && <DocPullToRefresh {...pull} />}
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
