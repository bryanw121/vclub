import * as Sentry from '@sentry/react-native'

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN
const APP_ENV = process.env.EXPO_PUBLIC_APP_ENV ?? 'production'

export function initSentry() {
  if (!DSN) return

  Sentry.init({
    dsn: DSN,
    environment: APP_ENV,

    // Sample all traces in beta; 20% in production to stay within free tier
    tracesSampleRate: APP_ENV === 'beta' ? 1.0 : 0.2,

    // Performance features
    enableAppStartTracking: true,
    enableNativeFramesTracking: true,
    enableStallTracking: true,

    integrations: [
      Sentry.reactNativeTracingIntegration({
        traceFetch: true,
        traceXHR: true,
      }),
    ],

    // Log Sentry internals to console only in dev
    debug: __DEV__,
  })
}

export { Sentry }
