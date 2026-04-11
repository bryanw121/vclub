import React from 'react'
import { View, Text, TouchableOpacity } from 'react-native'
import * as Sentry from '@sentry/react-native'
import { theme } from '../constants'

function DefaultFallback({ resetError }: { resetError: () => void }) {
  return (
    <View style={{
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 48,
      gap: theme.spacing.md,
      backgroundColor: theme.colors.background,
    }}>
      <Text style={{ fontSize: 18, fontWeight: theme.font.weight.semibold, color: theme.colors.text }}>
        Something went wrong
      </Text>
      <Text style={{ fontSize: theme.font.size.md, color: theme.colors.subtext, textAlign: 'center', lineHeight: 22 }}>
        An unexpected error occurred. We've been notified and are working on it.
      </Text>
      <TouchableOpacity
        onPress={resetError}
        style={{
          marginTop: theme.spacing.sm,
          backgroundColor: theme.colors.primary,
          paddingHorizontal: theme.spacing.xl,
          paddingVertical: theme.spacing.md,
          borderRadius: theme.radius.md,
        }}
      >
        <Text style={{ color: theme.colors.white, fontWeight: theme.font.weight.semibold }}>
          Try Again
        </Text>
      </TouchableOpacity>
    </View>
  )
}

type Props = { children: React.ReactNode }

export function SentryErrorBoundary({ children }: Props) {
  return (
    <Sentry.ErrorBoundary
      fallback={({ resetError }) => <DefaultFallback resetError={resetError} />}
    >
      {children}
    </Sentry.ErrorBoundary>
  )
}
