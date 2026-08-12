import React from 'react'
import { StyleSheet } from 'react-native'
import { render, fireEvent } from '@testing-library/react-native'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { HeaderAction, HEADER_ACTION_MIN } from '../components/HeaderAction'

/**
 * Flattens a Pressable's style, which RN gives as a function of press state.
 */
function flattenPressableStyle(node: any) {
  const style = node.props.style
  return StyleSheet.flatten(typeof style === 'function' ? style({ pressed: false }) : style)
}

describe('HeaderAction touch targets', () => {
  it('declares a 44pt minimum, matching Apple HIG and the CLAUDE.md rule', () => {
    expect(HEADER_ACTION_MIN).toBeGreaterThanOrEqual(44)
  })

  it.each(['primary', 'secondary', 'plain'] as const)(
    'renders a >=44pt target for the %s variant',
    variant => {
      const { getByRole } = render(
        <HeaderAction icon="create-outline" label="Edit" variant={variant} onPress={() => {}} />,
      )
      const style = flattenPressableStyle(getByRole('button'))
      expect(style.minHeight).toBeGreaterThanOrEqual(44)
      expect(style.minWidth).toBeGreaterThanOrEqual(44)
    },
  )

  it('keeps a >=44pt target when icon-only (no label to pad it out)', () => {
    const { getByRole } = render(
      <HeaderAction icon="ellipsis-horizontal" onPress={() => {}} accessibilityLabel="More" />,
    )
    const style = flattenPressableStyle(getByRole('button'))
    expect(style.minHeight).toBeGreaterThanOrEqual(44)
    expect(style.minWidth).toBeGreaterThanOrEqual(44)
  })

  it('renders the visible label so the action is not icon-only', () => {
    const { getByText } = render(
      <HeaderAction icon="share-outline" label="Share" variant="secondary" onPress={() => {}} />,
    )
    expect(getByText('Share')).toBeTruthy()
  })

  it('always exposes an accessibility label, even without visible text', () => {
    const { getByLabelText } = render(
      <HeaderAction icon="ellipsis-horizontal" onPress={() => {}} accessibilityLabel="More event actions" />,
    )
    expect(getByLabelText('More event actions')).toBeTruthy()
  })

  it('fires onPress', () => {
    const onPress = jest.fn()
    const { getByRole } = render(<HeaderAction icon="create-outline" label="Edit" onPress={onPress} />)
    fireEvent.press(getByRole('button'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('swaps the icon for a spinner while busy, without shrinking the target', () => {
    const { getByRole, UNSAFE_getByType } = render(
      <HeaderAction icon="create-outline" busy onPress={() => {}} accessibilityLabel="Busy" />,
    )
    const style = flattenPressableStyle(getByRole('button'))
    expect(style.minHeight).toBeGreaterThanOrEqual(44)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(UNSAFE_getByType(require('react-native').ActivityIndicator)).toBeTruthy()
  })
})

describe('event header no longer ships sub-44pt controls', () => {
  // Mechanical guard: the two 36pt renderings of Edit/Delete are exactly the
  // bug this fixes, and a new toolbar icon is the obvious way to reintroduce it.
  const source = readFileSync(resolve(__dirname, '../app/(app)/event/[id].tsx'), 'utf8')

  it('has no 36x36 pressable left in the event header', () => {
    expect(source).not.toMatch(/width:\s*36,\s*height:\s*36/)
  })

  it('routes the Edit action through HeaderAction rather than a raw Pressable', () => {
    expect(source).toMatch(/<HeaderAction[\s\S]*?label="Edit"/)
  })

  it('keeps Share as a labelled, visible action rather than hiding it in a menu', () => {
    expect(source).toMatch(/<HeaderAction[\s\S]*?label="Share"/)
  })

  it('keeps the delete confirmation in place after moving Delete into the overflow', () => {
    expect(source).toMatch(/setDeleteConfirmVisible\(true\)/)
    expect(source).toMatch(/visible=\{deleteConfirmVisible\}/)
  })
})
