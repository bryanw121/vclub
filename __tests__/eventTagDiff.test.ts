import { diffTagIds } from '../utils'

const A = 'tag-a'
const B = 'tag-b'
const C = 'tag-c'

describe('diffTagIds', () => {
  it('writes nothing when the tags are untouched — the common case for a title edit', () => {
    expect(diffTagIds([A, B], [A, B])).toEqual({ toAdd: [], toRemove: [] })
  })

  it('writes nothing when the same set arrives in a different order', () => {
    expect(diffTagIds([A, B], [B, A])).toEqual({ toAdd: [], toRemove: [] })
  })

  it('adds only the new tag', () => {
    expect(diffTagIds([A], [A, B])).toEqual({ toAdd: [B], toRemove: [] })
  })

  it('removes only the dropped tag', () => {
    expect(diffTagIds([A, B], [A])).toEqual({ toAdd: [], toRemove: [B] })
  })

  it('handles a swap as one add and one remove', () => {
    expect(diffTagIds([A], [B])).toEqual({ toAdd: [B], toRemove: [A] })
  })

  it('handles adding and removing at once', () => {
    const { toAdd, toRemove } = diffTagIds([A, B], [B, C])
    expect(toAdd).toEqual([C])
    expect(toRemove).toEqual([A])
  })

  it('removes everything when all tags are cleared', () => {
    expect(diffTagIds([A, B], [])).toEqual({ toAdd: [], toRemove: [A, B] })
  })

  it('adds everything when an untagged event gains tags', () => {
    expect(diffTagIds([], [A, B])).toEqual({ toAdd: [A, B], toRemove: [] })
  })

  it('is a no-op for an untagged event that stays untagged', () => {
    expect(diffTagIds([], [])).toEqual({ toAdd: [], toRemove: [] })
  })

  it('treats duplicates in either input as a set', () => {
    expect(diffTagIds([A, A], [A])).toEqual({ toAdd: [], toRemove: [] })
    expect(diffTagIds([A], [A, A])).toEqual({ toAdd: [], toRemove: [] })
    expect(diffTagIds([], [B, B])).toEqual({ toAdd: [B], toRemove: [] })
  })

  it('never reports the same id as both added and removed', () => {
    const { toAdd, toRemove } = diffTagIds([A, B, C], [B, C, A])
    expect(toAdd.filter(id => toRemove.includes(id))).toEqual([])
  })

  it('does not mutate its inputs', () => {
    const original = [A, B]
    const selected = [B, C]
    diffTagIds(original, selected)
    expect(original).toEqual([A, B])
    expect(selected).toEqual([B, C])
  })

  /**
   * The property that makes this failure-safe: applying only the adds, or only
   * the removes, still leaves a valid tag set. The old delete-all-then-insert
   * had an intermediate state of zero tags, which is what wiped events.
   */
  it('never produces an empty intermediate state when tags are being kept', () => {
    const original = [A, B]
    const selected = [B, C]
    const { toAdd, toRemove } = diffTagIds(original, selected)

    // Adds applied, removes failed → superset, still tagged.
    const addsOnly = [...new Set([...original, ...toAdd])]
    expect(addsOnly.length).toBeGreaterThan(0)
    expect(addsOnly).toEqual(expect.arrayContaining([B]))

    // Removes applied, adds failed → subset, still tagged.
    const removesOnly = original.filter(id => !toRemove.includes(id))
    expect(removesOnly.length).toBeGreaterThan(0)
    expect(removesOnly).toEqual([B])
  })
})
