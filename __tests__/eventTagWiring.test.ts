import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The diff function being correct is not the fix — the fix is that host.tsx
 * actually uses it. These guards fail if the delete-all-then-reinsert ever
 * comes back, since that is the shape that wipes an event's tags.
 */

const host = readFileSync(join(__dirname, '..', 'app/(app)/host.tsx'), 'utf8')

describe('host.tsx no longer deletes every tag before re-inserting', () => {
  it('has no unscoped delete on event_tags', () => {
    // The original bug, verbatim: delete every row for the event, then insert
    // the whole set back. Any delete must now be narrowed by `.in('tag_id', …)`.
    expect(host).not.toMatch(/from\('event_tags'\)\s*\.delete\(\)\s*\.eq\('event_id', editId\)\s*(?!\s*\.in\()/)
  })

  it('scopes every event_tags delete to the specific tags being removed', () => {
    const deletes = host.match(/from\('event_tags'\)[\s\S]{0,200}?\.delete\(\)/g) ?? []
    expect(deletes.length).toBeGreaterThan(0)
    for (const _ of deletes) {
      expect(host).toMatch(/\.delete\(\)\s*\.eq\('event_id', editId\)\s*\.in\('tag_id', toRemove\)/)
    }
  })
})

describe('host.tsx drives the tag write from the diff', () => {
  it('imports the diff helper', () => {
    expect(host).toMatch(/import \{[^}]*diffTagIds[^}]*\} from '\.\.\/\.\.\/utils'/)
  })

  it('diffs against the loaded DB state, not the mutated UI state', () => {
    expect(host).toMatch(/diffTagIds\(originalTagIdsRef\.current, selectedTagIds\)/)
  })

  it('captures the baseline when loading an event for edit', () => {
    expect(host).toMatch(/originalTagIdsRef\.current = loadedTagIds/)
  })

  it('refreshes the baseline after a save, so a second save diffs correctly', () => {
    expect(host).toMatch(/originalTagIdsRef\.current = \[\.\.\.selectedTagIds\]/)
  })

  it('skips both round-trips when nothing changed', () => {
    expect(host).toMatch(/if \(toAdd\.length > 0\)/)
    expect(host).toMatch(/if \(toRemove\.length > 0\)/)
  })
})

describe('host.tsx surfaces tag-write failures distinctly', () => {
  it('checks the error on both the insert and the delete', () => {
    expect(host).toMatch(/if \(addError\) throw new TagWriteError/)
    expect(host).toMatch(/if \(removeError\) throw new TagWriteError/)
  })

  it('tells the user the event itself saved when only tags failed', () => {
    expect(host).toMatch(/e instanceof TagWriteError/)
    expect(host).toMatch(/Event saved — tags not updated/)
  })

  it('opens the result modal on failure — otherwise the error is invisible', () => {
    // `successMessage` renders only inside the modal, so setting it without
    // opening the modal meant every failure was silent.
    const catchBlock = host.slice(host.indexOf('} catch (e: any) {'))
    expect(catchBlock.slice(0, 700)).toMatch(/setSuccessModal\(true\)/)
  })
})
