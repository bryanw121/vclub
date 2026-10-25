import { ScreenState } from '../ui'
import type { FeedEmptyProps } from '../../types'

/**
 * What the feed shows when it has no cards: a spinner while the first months
 * load, an error with Retry when they failed and nothing is cached, otherwise
 * the "no events" message (with Clear filter when a filter is hiding things).
 */
export function FeedEmpty({ loading, error, onRetry, filterActive, isGuest, onClearFilter }: FeedEmptyProps) {
  return (
    <ScreenState
      loading={loading}
      error={error ? true : null}
      onRetry={onRetry}
      empty
      emptyIcon="calendar-outline"
      emptyTitle={filterActive ? 'No events match this filter' : isGuest ? 'No upcoming events yet' : 'No upcoming events — create one!'}
      emptyActionLabel={filterActive ? 'Clear filter' : undefined}
      onEmptyAction={filterActive ? onClearFilter : undefined}
    />
  )
}
