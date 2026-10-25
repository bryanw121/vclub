import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The publishing half of the #34 fix: `/host` must announce an edit. The
 * consuming half (event/[id] refetching every piece of `event:<id>` when it is
 * invalidated) is now a real hook test in eventHooks.test.tsx, not a source grep.
 */

const root = join(__dirname, '..')
const host = readFileSync(join(root, 'app/(app)/host.tsx'), 'utf8')

describe('host.tsx publishes the invalidation signal', () => {
  it('imports the version store', () => {
    expect(host).toMatch(/import\s*\{[^}]*bumpVersion[^}]*\}\s*from\s*'\.\.\/\.\.\/lib\/dataVersion'/)
  })

  it('bumps the edited event key on a successful edit', () => {
    expect(host).toMatch(/bumpVersion\(eventKey\(editId\)\)/)
  })

  it('bumps only after the whole save (tags + waitlist), not right after the events update', () => {
    const bumpAt = host.indexOf('bumpVersion(eventKey(editId))')
    // Anchored on the tag-write entry point rather than a specific query
    // string: #45 replaced delete-all-then-reinsert with a diff, and the old
    // literal anchor silently stopped matching.
    const tagsAt = host.indexOf('diffTagIds(originalTagIdsRef.current, selectedTagIds)')
    const waitlistAt = host.lastIndexOf("status: 'attending'")
    expect(bumpAt).toBeGreaterThan(-1)
    expect(tagsAt).toBeGreaterThan(-1)
    expect(waitlistAt).toBeGreaterThan(-1)
    expect(bumpAt).toBeGreaterThan(tagsAt)
    expect(bumpAt).toBeGreaterThan(waitlistAt)
  })
})
