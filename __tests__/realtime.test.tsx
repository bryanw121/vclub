import React from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import { render, act } from '@testing-library/react-native'

type StatusCb = (status: string, err?: Error) => void
type FakeChannel = {
  name: string
  ons: Array<{ type: string; filter: Record<string, string>; cb: (p: unknown) => void }>
  statusCb: StatusCb | null
  subscribedAfterOns: number | null
  removed: boolean
  on: jest.Mock
  subscribe: jest.Mock
}

const channels: FakeChannel[] = []

jest.mock('../lib/supabase', () => ({
  supabase: {
    channel: jest.fn((name: string) => {
      const ch: FakeChannel = {
        name,
        ons: [],
        statusCb: null,
        subscribedAfterOns: null,
        removed: false,
        on: jest.fn(),
        subscribe: jest.fn(),
      }
      ch.on.mockImplementation((type: string, filter: Record<string, string>, cb: (p: unknown) => void) => {
        ch.ons.push({ type, filter, cb })
        return ch
      })
      ch.subscribe.mockImplementation((cb: StatusCb) => {
        ch.statusCb = cb
        ch.subscribedAfterOns = ch.ons.length
        return ch
      })
      channels.push(ch)
      return ch
    }),
    removeChannel: jest.fn(async (ch: FakeChannel) => {
      ch.removed = true
      return 'ok'
    }),
  },
}))

// Imported after the mock so lib/realtime binds to the fake client.
import { useRealtimeChannel, getChannelState, __resetRealtime, type RealtimeBinding } from '../lib/realtime'
import { supabase } from '../lib/supabase'

let appStateHandler: ((s: AppStateStatus) => void) | null = null

beforeEach(() => {
  __resetRealtime()
  channels.length = 0
  jest.clearAllMocks()
  appStateHandler = null
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_type: string, handler: (s: AppStateStatus) => void) => {
    appStateHandler = handler
    return { remove: () => { appStateHandler = null } }
  }) as never)
})

afterEach(() => {
  jest.useRealTimers()
})

function bindingsFor(handler: (p: unknown) => void): RealtimeBinding[] {
  return [
    { event: 'INSERT', table: 'messages', handler },
    { event: 'UPDATE', table: 'conversation_members', filter: 'user_id=eq.u1', handler },
  ]
}

function Sub({
  topic,
  handler,
  onReconnect,
  enabled,
}: {
  topic: string | null
  handler: (p: unknown) => void
  onReconnect?: () => void
  enabled?: boolean
}) {
  useRealtimeChannel(topic, bindingsFor(handler), { onReconnect, enabled })
  return null
}

describe('useRealtimeChannel', () => {
  it('attaches every binding before subscribing', () => {
    render(<Sub topic="chat" handler={() => {}} />)
    expect(channels).toHaveLength(1)
    const ch = channels[0]
    expect(ch.subscribedAfterOns).toBe(2)
    expect(ch.ons.map(o => o.type)).toEqual(['postgres_changes', 'postgres_changes'])
    expect(ch.ons[0].filter).toEqual({ event: 'INSERT', schema: 'public', table: 'messages' })
    expect(ch.ons[1].filter).toEqual({
      event: 'UPDATE',
      schema: 'public',
      table: 'conversation_members',
      filter: 'user_id=eq.u1',
    })
  })

  it('shares one channel between two subscribers and fans out to both handlers', () => {
    const a = jest.fn()
    const b = jest.fn()
    render(
      <>
        <Sub topic="chat" handler={a} />
        <Sub topic="chat" handler={b} />
      </>,
    )
    expect(supabase.channel).toHaveBeenCalledTimes(1)
    expect(getChannelState('chat')?.subscribers).toBe(2)
    channels[0].ons[0].cb({ new: { id: 1 } })
    expect(a).toHaveBeenCalledWith({ new: { id: 1 } })
    expect(b).toHaveBeenCalledWith({ new: { id: 1 } })
  })

  it('keeps the channel while one subscriber remains and removes it after the last', () => {
    const a = jest.fn()
    const b = jest.fn()
    const first = render(<Sub topic="chat" handler={a} />)
    const second = render(<Sub topic="chat" handler={b} />)

    first.unmount()
    expect(supabase.removeChannel).not.toHaveBeenCalled()
    expect(getChannelState('chat')?.subscribers).toBe(1)
    channels[0].ons[0].cb({ new: { id: 2 } })
    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledTimes(1)

    second.unmount()
    expect(supabase.removeChannel).toHaveBeenCalledTimes(1)
    expect(channels[0].removed).toBe(true)
    expect(getChannelState('chat')).toBeNull()
  })

  it('uses the latest handler without resubscribing', () => {
    const first = jest.fn()
    const next = jest.fn()
    const view = render(<Sub topic="chat" handler={first} />)
    view.rerender(<Sub topic="chat" handler={next} />)
    expect(supabase.channel).toHaveBeenCalledTimes(1)
    channels[0].ons[0].cb({})
    expect(first).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('does nothing for a null topic or enabled: false', () => {
    render(
      <>
        <Sub topic={null} handler={() => {}} />
        <Sub topic="x" handler={() => {}} enabled={false} />
      </>,
    )
    expect(supabase.channel).not.toHaveBeenCalled()
  })

  it('gives distinct topics distinct channels', () => {
    render(
      <>
        <Sub topic="chat:a" handler={() => {}} />
        <Sub topic="chat:b" handler={() => {}} />
      </>,
    )
    expect(channels).toHaveLength(2)
    expect(channels[0].name).not.toBe(channels[1].name)
  })

  it('on CHANNEL_ERROR recreates the channel with backoff and calls onReconnect after the rejoin', () => {
    jest.useFakeTimers()
    const onReconnectA = jest.fn()
    const onReconnectB = jest.fn()
    render(
      <>
        <Sub topic="chat" handler={() => {}} onReconnect={onReconnectA} />
        <Sub topic="chat" handler={() => {}} onReconnect={onReconnectB} />
      </>,
    )
    act(() => channels[0].statusCb!('SUBSCRIBED'))
    expect(getChannelState('chat')?.status).toBe('joined')
    // First join is not a reconnect.
    expect(onReconnectA).not.toHaveBeenCalled()

    act(() => channels[0].statusCb!('CHANNEL_ERROR'))
    expect(getChannelState('chat')?.status).toBe('errored')
    act(() => jest.advanceTimersByTime(999))
    expect(channels).toHaveLength(1)
    act(() => jest.advanceTimersByTime(1))
    expect(channels).toHaveLength(2)
    expect(channels[0].removed).toBe(true)
    expect(channels[1].subscribedAfterOns).toBe(2)

    // Second failure backs off to 2s.
    act(() => channels[1].statusCb!('TIMED_OUT'))
    act(() => jest.advanceTimersByTime(1_999))
    expect(channels).toHaveLength(2)
    act(() => jest.advanceTimersByTime(1))
    expect(channels).toHaveLength(3)

    act(() => channels[2].statusCb!('SUBSCRIBED'))
    expect(onReconnectA).toHaveBeenCalledTimes(1)
    expect(onReconnectB).toHaveBeenCalledTimes(1)
    expect(getChannelState('chat')).toMatchObject({ status: 'joined', joins: 2, retryAttempt: 0 })
  })

  it('caps the backoff at 30s', () => {
    jest.useFakeTimers()
    render(<Sub topic="chat" handler={() => {}} />)
    for (let i = 0; i < 6; i++) {
      act(() => channels[channels.length - 1].statusCb!('CHANNEL_ERROR'))
      act(() => jest.advanceTimersByTime(30_000))
    }
    const before = channels.length
    act(() => channels[channels.length - 1].statusCb!('CHANNEL_ERROR'))
    act(() => jest.advanceTimersByTime(29_999))
    expect(channels).toHaveLength(before)
    act(() => jest.advanceTimersByTime(1))
    expect(channels).toHaveLength(before + 1)
  })

  it('ignores status callbacks from a channel that has been replaced', () => {
    jest.useFakeTimers()
    const onReconnect = jest.fn()
    render(<Sub topic="chat" handler={() => {}} onReconnect={onReconnect} />)
    act(() => channels[0].statusCb!('SUBSCRIBED'))
    act(() => channels[0].statusCb!('CHANNEL_ERROR'))
    act(() => jest.advanceTimersByTime(1_000))
    // The dead channel reporting CLOSED must not clobber the new one's state.
    act(() => channels[0].statusCb!('CLOSED'))
    expect(getChannelState('chat')?.status).toBe('joining')
  })

  it('resubscribes on AppState → active when the channel is not joined', () => {
    const onReconnect = jest.fn()
    render(<Sub topic="chat" handler={() => {}} onReconnect={onReconnect} />)
    act(() => channels[0].statusCb!('SUBSCRIBED'))
    act(() => channels[0].statusCb!('CLOSED'))
    expect(appStateHandler).not.toBeNull()

    act(() => appStateHandler!('background'))
    act(() => appStateHandler!('active'))
    expect(channels).toHaveLength(2)
    act(() => channels[1].statusCb!('SUBSCRIBED'))
    expect(onReconnect).toHaveBeenCalledTimes(1)
  })

  it('leaves a joined channel alone on AppState → active', () => {
    render(<Sub topic="chat" handler={() => {}} />)
    act(() => channels[0].statusCb!('SUBSCRIBED'))
    act(() => appStateHandler!('background'))
    act(() => appStateHandler!('active'))
    expect(channels).toHaveLength(1)
  })

  it('cancels a pending retry when the last subscriber unmounts', () => {
    jest.useFakeTimers()
    const view = render(<Sub topic="chat" handler={() => {}} />)
    act(() => channels[0].statusCb!('CHANNEL_ERROR'))
    view.unmount()
    act(() => jest.advanceTimersByTime(60_000))
    expect(channels).toHaveLength(1)
    expect(getChannelState('chat')).toBeNull()
  })

  it('warns in dev when a second subscriber passes different bindings', () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => {})
    function Other() {
      useRealtimeChannel('chat', [{ event: 'DELETE', table: 'messages', handler: () => {} }])
      return null
    }
    render(
      <>
        <Sub topic="chat" handler={() => {}} />
        <Other />
      </>,
    )
    expect(err).toHaveBeenCalledWith(expect.stringContaining('different bindings'), expect.anything())
    expect(supabase.channel).toHaveBeenCalledTimes(1)
    err.mockRestore()
  })
})
