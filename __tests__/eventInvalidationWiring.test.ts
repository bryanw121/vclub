import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The unit tests above prove the invalidation *primitive* works. They can't
 * prove the two screens are actually wired to it — and that wiring is the whole
 * fix for #34. These guards fail if someone reverts either half.
 */

const root = join(__dirname, '..')
const host = readFileSync(join(root, 'app/(app)/host.tsx'), 'utf8')
const detail = readFileSync(join(root, 'app/(app)/event/[id].tsx'), 'utf8')

describe('host.tsx publishes the invalidation signal', () => {
  it('imports the version store', () => {
    expect(host).toMatch(/import\s*\{[^}]*bumpVersion[^}]*\}\s*from\s*'\.\.\/\.\.\/lib\/dataVersion'/)
  })

  it('bumps the edited event key on a successful edit', () => {
    expect(host).toMatch(/bumpVersion\(eventKey\(editId\)\)/)
  })

  it('bumps only after the whole save (tags + waitlist), not right after the events update', () => {
    const bumpAt = host.indexOf('bumpVersion(eventKey(editId))')
    const tagsAt = host.indexOf("from('event_tags').delete()")
    const waitlistAt = host.lastIndexOf("status: 'attending'")
    expect(bumpAt).toBeGreaterThan(-1)
    expect(tagsAt).toBeGreaterThan(-1)
    expect(waitlistAt).toBeGreaterThan(-1)
    expect(bumpAt).toBeGreaterThan(tagsAt)
    expect(bumpAt).toBeGreaterThan(waitlistAt)
  })
})

describe('event/[id].tsx consumes the invalidation signal', () => {
  it('subscribes to this event key', () => {
    expect(detail).toMatch(/useDataVersion\(eventKey\(id\)\)/)
  })

  it('routes the focus refetch decision through shouldRefetch', () => {
    expect(detail).toMatch(/shouldRefetch\(\{/)
  })

  it('no longer gates the focus refetch on staleness alone', () => {
    // The original bug, verbatim: `if (stale) void fetchEvent(...)`. A refetch
    // guarded only by elapsed time can never see a fast edit.
    expect(detail).not.toMatch(/if\s*\(stale\)\s*void\s+fetchEvent/)
  })

  it('keeps the refetch silent so the user sees a swap, not a spinner', () => {
    const effect = detail.slice(detail.indexOf('useDataVersion(eventKey(id))'))
    expect(effect.slice(0, 800)).toMatch(/fetchEvent\(\{\s*silent:\s*true\s*\}\)/)
  })

  it('records the version it fetched at, so one edit causes exactly one refetch', () => {
    expect(detail).toMatch(/seenEventVersion\.current\s*=\s*eventVersion/)
  })

  it('re-runs the focus effect when the version changes', () => {
    const effect = detail.slice(detail.indexOf('useDataVersion(eventKey(id))'))
    expect(effect.slice(0, 900)).toMatch(/\[id,\s*eventVersion\]/)
  })
})
