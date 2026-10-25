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
  it('imports invalidate and queryKey from lib/query (not the deprecated version store)', () => {
    expect(host).toMatch(/import\s*\{[^}]*\binvalidate\b[^}]*\}\s*from\s*'\.\.\/\.\.\/lib\/query'/)
    expect(host).not.toMatch(/dataVersion/)
  })

  it('invalidates the edited event, the feed and club pages on a successful edit', () => {
    expect(host).toMatch(/invalidate\(queryKey\('event', editId\)\)/)
    expect(host).toMatch(/invalidate\('feed'\)/)
    expect(host).toMatch(/invalidate\('club'\)/)
  })

  it('invalidates only after the whole save (tags + waitlist), not right after the events update', () => {
    const invalidateAt = host.indexOf("invalidate(queryKey('event', editId))")
    // Anchored on the tag-write entry point rather than a specific query
    // string: #45 replaced delete-all-then-reinsert with a diff, and the old
    // literal anchor silently stopped matching.
    const tagsAt = host.indexOf('diffTagIds(originalTagIdsRef.current, selectedTagIds)')
    const waitlistAt = host.lastIndexOf("status: 'attending'")
    expect(invalidateAt).toBeGreaterThan(-1)
    expect(tagsAt).toBeGreaterThan(-1)
    expect(waitlistAt).toBeGreaterThan(-1)
    expect(invalidateAt).toBeGreaterThan(tagsAt)
    expect(invalidateAt).toBeGreaterThan(waitlistAt)
  })

  it('also invalidates the feed when new events are created', () => {
    const createAt = host.indexOf("supabase.from('events').insert(rows)")
    expect(createAt).toBeGreaterThan(-1)
    expect(host.indexOf("invalidate('feed')", createAt)).toBeGreaterThan(createAt)
  })
})
