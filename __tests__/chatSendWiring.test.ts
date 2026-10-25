import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * A failed send has ONE recovery path: the "Not sent · Tap to retry" bubble.
 * Restoring the draft into the composer as well let the user send the same
 * message a second time next to the retry.
 */
const screen = readFileSync(join(__dirname, '..', 'app/(app)/chat/[id].tsx'), 'utf8')

describe('chat room send failure', () => {
  it('does not restore the draft when sendMessage fails', () => {
    const at = screen.indexOf('await sendMessage(trimmed || null')
    expect(at).toBeGreaterThan(-1)
    // Nothing after the send in handleSend puts text back.
    const rest = screen.slice(at, screen.indexOf('async function handlePickImage'))
    expect(rest).not.toMatch(/setText\(/)
  })
})
