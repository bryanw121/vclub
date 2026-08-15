import React from 'react'
import { Text } from 'react-native'
import { render, act, screen } from '@testing-library/react-native'
import { bumpVersion, eventKey, useDataVersion, __resetDataVersions } from '../lib/dataVersion'

beforeEach(() => {
  __resetDataVersions()
})

function Probe({ id, onRender }: { id: string; onRender?: () => void }) {
  const version = useDataVersion(eventKey(id))
  onRender?.()
  return <Text testID={`v-${id}`}>{String(version)}</Text>
}

describe('useDataVersion', () => {
  it('renders 0 before anything is mutated', () => {
    render(<Probe id="e1" />)
    expect(screen.getByTestId('v-e1').props.children).toBe('0')
  })

  it('re-renders with the new version when its key is bumped', () => {
    render(<Probe id="e1" />)
    act(() => {
      bumpVersion(eventKey('e1'))
    })
    expect(screen.getByTestId('v-e1').props.children).toBe('1')
  })

  it('leaves the reported version unchanged when a different key is bumped', () => {
    render(<Probe id="e1" />)
    act(() => {
      bumpVersion(eventKey('e2'))
    })
    expect(screen.getByTestId('v-e1').props.children).toBe('0')
  })

  it('unsubscribes on unmount so a later bump cannot update a dead tree', () => {
    const onRender = jest.fn()
    const view = render(<Probe id="e1" onRender={onRender} />)
    const rendersWhileMounted = onRender.mock.calls.length
    view.unmount()
    act(() => {
      bumpVersion(eventKey('e1'))
    })
    expect(onRender).toHaveBeenCalledTimes(rendersWhileMounted)
  })

  it('keeps two independent readers on their own versions', () => {
    render(
      <>
        <Probe id="a" />
        <Probe id="b" />
      </>,
    )
    act(() => {
      bumpVersion(eventKey('a'))
      bumpVersion(eventKey('a'))
    })
    expect(screen.getByTestId('v-a').props.children).toBe('2')
    expect(screen.getByTestId('v-b').props.children).toBe('0')
  })
})
