/**
 * Single owner of the `body.doc-scroll` class (see app/+html.tsx for the CSS).
 *
 * Multiple screens can request document-scroll mode (the tabs shell for
 * Events/Clubs/Profile, the event detail page for its Details/People tabs).
 * Their effects can run in any order during navigation commits, so a naive
 * classList.toggle in each screen races — one screen's cleanup can wipe out
 * another's claim. Claims make the outcome order-independent: the class is
 * present iff at least one screen currently claims it.
 */

const claims = new Set<string>()

export function setDocScrollClaim(key: string, active: boolean) {
  if (typeof document === 'undefined') return
  const wasActive = claims.size > 0
  if (active) claims.add(key)
  else claims.delete(key)
  const isActive = claims.size > 0
  document.body.classList.toggle('doc-scroll', isActive)
  // Leaving doc-scroll mode: reset any document scroll offset so the
  // restored app-shell layout isn't clipped.
  if (wasActive && !isActive) window.scrollTo(0, 0)
}
