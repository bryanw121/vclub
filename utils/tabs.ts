/** Tab for a URL path: 0 = Events, 1 = Clubs, 2 = Chat, 3 = Profile (same order as the pager and sidebar). */
export function tabIndexFromPath(path: string): number {
  if (path.startsWith('/profile') || path.startsWith('/settings')) return 3
  if (path.startsWith('/chat')) return 2
  if (path.startsWith('/clubs') || path.startsWith('/club')) return 1
  return 0
}
