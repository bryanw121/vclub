import { useSyncExternalStore } from 'react'
import { invalidate } from './query'

/**
 * DEPRECATED — migration shim over `lib/query`. New code reads with `useQuery`
 * and writes with `useMutation({ invalidates })` / `invalidate(prefix)`.
 * `bumpVersion(key)` now also calls `invalidate(key)`, so a screen already on
 * `useQuery` with that key (e.g. `eventKey(id)`) refetches too. Remove once
 * Phase B has moved `/host` and `/event/[id]` off it.
 *
 * Original contract, kept working for the existing readers:
 *
 * Mutation-scoped cache invalidation.
 *
 * Screens cache what they fetch and only refetch when they think the data is
 * stale. That heuristic can't see a write that happened on a *different*
 * screen — editing an event in `/host` left `/event/[id]` showing the old row
 * because its focus refetch is gated behind a 30s staleness window, and a real
 * edit round-trip is faster than that.
 *
 * So writers publish an explicit signal: bump the version for the entity they
 * changed, and every reader of that entity refetches the next time it's
 * focused. Same contract as React Query's `invalidateQueries(key)`, hand-rolled
 * because `CLAUDE.md` mandates no third-party state management.
 *
 * Lives in `lib/` rather than `contexts/` on purpose: `/host` and `/event/[id]`
 * are sibling stack routes, not tab children, so a tabs-scoped context can't
 * reach both.
 */

const versions = new Map<string, number>()
const listeners = new Set<() => void>()

/** Key for a single event's detail data. Same as `queryKey('event', id)` for UUID ids. */
export function eventKey(id: string): string {
  return `event:${id}`
}

/**
 * Announce that `key`'s underlying data changed. Version readers refetch on
 * next focus; `useQuery` readers of `key` (and keys under it) refetch now.
 */
export function bumpVersion(key: string): void {
  versions.set(key, (versions.get(key) ?? 0) + 1)
  // Copy before iterating: a listener may unsubscribe during the callback.
  Array.from(listeners).forEach(l => l())
  invalidate(key)
}

export function getVersion(key: string): number {
  return versions.get(key) ?? 0
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Test-only: drop all versions and listeners so cases can't leak into each other. */
export function __resetDataVersions(): void {
  versions.clear()
  listeners.clear()
}

/**
 * Current version for `key`. Re-renders the caller whenever any key is bumped,
 * but the returned number only moves for this key — so an effect depending on
 * it stays stable across unrelated mutations.
 */
export function useDataVersion(key: string): number {
  return useSyncExternalStore(
    subscribe,
    () => getVersion(key),
    () => getVersion(key),
  )
}

/**
 * Should a screen refetch right now?
 *
 * Extracted from the focus effect so the decision is unit-testable without
 * mounting a navigator. `seenVersion` is what the screen last fetched at.
 */
export function shouldRefetch(args: {
  version: number
  seenVersion: number
  lastFetchedAt: number
  now: number
  staleAfterMs: number
}): boolean {
  if (args.version !== args.seenVersion) return true
  return args.now - args.lastFetchedAt > args.staleAfterMs
}
