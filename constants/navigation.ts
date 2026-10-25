import type { ComponentProps } from 'react'
import type { Ionicons } from '@expo/vector-icons'
import { routes, type RouteString } from '../utils/routes'

/**
 * The only definition of the app's tabs and the create menu. The sidebar
 * (app/(app)/_layout), the mobile tab bar (app/(app)/(tabs)/_layout), the
 * pager (.../(main)/_layout) and the doc-scroll hook all derive from this, so
 * adding, reordering or renaming a tab is a one-file change.
 */

export type TabKey = 'events' | 'clubs' | 'chat' | 'profile'

export type Tab = {
  key: TabKey
  /** Sidebar label and accessible name. */
  name: string
  /** Label under the icon in the mobile tab bar (shorter than `name` for Profile). */
  mobileLabel: string
  icon: ComponentProps<typeof Ionicons>['name']
  /** Route the tab lives at; what the sidebar / tab bar navigates to. */
  path: RouteString
  /** Index in the mobile / narrow-web pager; always equals the tab's position in TABS. */
  pageIndex: number
  /** Narrow web: the tab's content flows in the document so the body scrolls (see useDocScrollMode). */
  docScroll: boolean
  /** Guests see a sign-in prompt in place of the tab's content. */
  requiresAuth: boolean
  /** URL prefixes that belong to this tab (other than `path` itself), for tabForPath. */
  pathPrefixes: readonly string[]
}

/** Pager order, left to right. Keep `pageIndex` equal to the array index (navigation.test.ts checks it). */
export const TABS: readonly Tab[] = [
  {
    key: 'events', name: 'Events', mobileLabel: 'Events', icon: 'calendar-outline',
    path: routes.events(), pageIndex: 0, docScroll: true, requiresAuth: false, pathPrefixes: [],
  },
  {
    key: 'clubs', name: 'Clubs', mobileLabel: 'Clubs', icon: 'people-outline',
    path: routes.clubs(), pageIndex: 1, docScroll: true, requiresAuth: false, pathPrefixes: ['/clubs', '/club'],
  },
  {
    // Chat keeps the app-shell layout: its pinned input bar needs a fixed viewport.
    key: 'chat', name: 'Chat', mobileLabel: 'Chat', icon: 'chatbubbles-outline',
    path: routes.chat(), pageIndex: 2, docScroll: false, requiresAuth: true, pathPrefixes: ['/chat'],
  },
  {
    key: 'profile', name: 'Profile', mobileLabel: 'Me', icon: 'person-circle-outline',
    path: routes.profile(), pageIndex: 3, docScroll: true, requiresAuth: true, pathPrefixes: ['/profile', '/settings'],
  },
]

export function tabIndexOf(key: TabKey): number {
  return TABS.findIndex(tab => tab.key === key)
}

export const EVENTS_TAB_INDEX = tabIndexOf('events')
export const CLUBS_TAB_INDEX = tabIndexOf('clubs')
export const CHAT_TAB_INDEX = tabIndexOf('chat')
export const PROFILE_TAB_INDEX = tabIndexOf('profile')

/** The tab a URL path belongs to. Anything unrecognised (event pages, host, ...) falls back to Events. */
export function tabForPath(path: string): Tab {
  return TABS.find(tab => tab.pathPrefixes.some(prefix => path.startsWith(prefix))) ?? TABS[EVENTS_TAB_INDEX]
}

/** Pager index for a URL path (0 = Events, 1 = Clubs, 2 = Chat, 3 = Profile). */
export function tabIndexFromPath(path: string): number {
  return tabForPath(path).pageIndex
}

export type CreateMenuOption = {
  label: string
  path: RouteString
}

/**
 * The create ("+") menu: the bottom bar's centre button on mobile and the FAB on
 * wide web. Both render this list.
 *
 * Note: on wide web the FAB is only shown on the Events tab (pathname === '/'),
 * while mobile shows the button on every tab. That difference is long-standing
 * and intentionally unchanged.
 */
export const CREATE_MENU: readonly CreateMenuOption[] = [
  { label: 'Open Play',     path: routes.host({ maxAttendees: 18 }) },
  { label: 'Tournament',    path: routes.tournamentCreate() },
  { label: 'From Template', path: routes.host({ mode: 'templates' }) },
]
