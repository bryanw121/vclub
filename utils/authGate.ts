/**
 * Guest browsing rules.
 *
 * Guests (not signed in) can browse Events, Clubs, event pages, club pages and
 * other players' profiles. The Chat and Profile tabs render a sign-in prompt in
 * place. The routes below need an account outright, so a guest who lands on one
 * (deep link, back button, typed URL) is sent to the login screen instead.
 */
const PROTECTED_ROUTES = [
  '/host',
  '/tournament/create',
  '/notifications',
  '/settings',
  '/club/create',
]

export function isProtectedPath(pathname: string): boolean {
  // A conversation needs an account; the /chat tab itself shows a prompt instead.
  if (pathname.startsWith('/chat/')) return true
  return PROTECTED_ROUTES.some(route => pathname === route || pathname.startsWith(`${route}/`))
}

/**
 * Where to return after signing in. Module-level on purpose: the login screen
 * and the root layout's redirect live in different trees, and this only ever
 * holds one path for the current app session.
 */
let pendingRedirect: string | null = null

const AUTH_SCREENS = ['/(auth)', '/login', '/register', '/reset-password']

export function setPostSignInRedirect(path: string | null) {
  pendingRedirect = path && !AUTH_SCREENS.some(screen => path.startsWith(screen)) ? path : null
}

export function takePostSignInRedirect(): string | null {
  const path = pendingRedirect
  pendingRedirect = null
  return path
}
