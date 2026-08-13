import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Roster messaging is deliberately asymmetric and deliberately narrow, so the
 * risky parts are the *gates*, not the happy path: who is offered a Message
 * action, and who must never be. These guards pin each decision from #40.
 */

const root = join(__dirname, '..')
const peopleTab = readFileSync(join(root, 'components/event/PeopleTab.tsx'), 'utf8')
const eventPage = readFileSync(join(root, 'app/(app)/event/[id].tsx'), 'utf8')

describe('only hosts and co-hosts can message from the roster', () => {
  it('gates every Message action behind canMessageUser', () => {
    expect(peopleTab).toMatch(/const canMessageUser = useCallback\(\(userId: string\) => \(/)
    expect(peopleTab).toMatch(/canMessage\s*$/m)
  })

  it('reuses the existing host/co-host flag rather than inventing a permission', () => {
    expect(eventPage).toMatch(/canMessage=\{isHostOrCohost\}/)
  })

  it('never offers to message yourself', () => {
    expect(peopleTab).toMatch(/userId !== currentUserId/)
  })

  it('never offers to message someone the viewer has silenced', () => {
    expect(peopleTab).toMatch(/!silencedUserIds\.has\(userId\)/)
  })

  it('does nothing when no handler was supplied', () => {
    expect(peopleTab).toMatch(/&& !!onMessage/)
  })
})

describe('tapping a row still opens the profile', () => {
  it('keeps View profile in the member menu', () => {
    expect(peopleTab).toMatch(/key: 'profile', label: 'View profile'/)
  })

  it('did not repurpose the row tap for messaging', () => {
    // The roster cell's press handler must still be onOpenProfile.
    expect(peopleTab).toMatch(/onPress=\{\(\) => onOpenProfile\(profile\.id\)\}/)
  })
})

describe('+1 guests', () => {
  it('offers the member who added them, since a guest has no account', () => {
    expect(peopleTab).toMatch(/key: 'message-adder'/)
    expect(peopleTab).toMatch(/onMessage\?\.\(g\.added_by\)/)
  })

  it('never treats a guest id as a user id', () => {
    expect(peopleTab).not.toMatch(/onMessage\?\.\(g\.id\)/)
  })
})

describe('the menu replaces controls rather than piling on', () => {
  it('falls back to the direct control when the menu would hold one entry', () => {
    // A single-entry menu turns one tap into two and hides the action; it also
    // would have broken the guest-removal e2e, which targets the ✕ by label.
    const matches = peopleTab.match(/length > 1 \? rect => openRowMenu/g)
    expect(matches).toHaveLength(2)
    expect(peopleTab).toMatch(/if \(options\.length < 2\) return null/)
  })

  it('gives the ⋯ trigger a 44pt target', () => {
    expect(peopleTab).toMatch(/rowMenuBtn: \{\s*\n\s*minWidth: 44,\s*\n\s*minHeight: 44,/)
  })

  it('mounts exactly one menu for the whole tab', () => {
    expect(peopleTab.match(/<AnchorOptionsMenu/g)).toHaveLength(1)
  })
})

describe('one definition of "message someone from an event"', () => {
  it('routes the Details tab button through the shared opener', () => {
    expect(eventPage).toMatch(/onMessageHost=\{openDmWith\}/)
  })

  it('routes the roster menu through the same opener', () => {
    expect(eventPage).toMatch(/onMessage=\{openDmWith\}/)
  })

  it('has only one find_or_create_dm call left on this screen', () => {
    expect(eventPage.match(/find_or_create_dm/g)).toHaveLength(1)
  })

  it('surfaces a failure instead of silently doing nothing', () => {
    const fn = eventPage.slice(eventPage.indexOf('async function openDmWith'))
    expect(fn.slice(0, 600)).toMatch(/if \(error\) throw error/)
    expect(fn.slice(0, 600)).toMatch(/Alert\.alert\('Error'/)
  })
})
