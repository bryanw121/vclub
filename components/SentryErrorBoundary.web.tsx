import React from 'react'
import { Sentry } from '../lib/sentry'
import { ErrorFallback } from './ErrorFallback'

type Props = { children: React.ReactNode }
type State = { error: Error | null }

/**
 * Web: the same boundary and fallback as native, without importing the Sentry
 * SDK (it loads lazily on web, see lib/sentry.web.ts). Render errors are
 * reported through the lazy client, queued until it has loaded. A class
 * component because React has no hook for error boundaries.
 */
export class SentryErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    Sentry.captureException(error, { contexts: { react: { componentStack: info.componentStack ?? '' } } })
  }

  resetError = (): void => {
    this.setState({ error: null })
  }

  render() {
    if (this.state.error) return <ErrorFallback resetError={this.resetError} />
    return this.props.children
  }
}
