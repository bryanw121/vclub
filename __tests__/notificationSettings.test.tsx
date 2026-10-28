import React from 'react'
import { Switch } from 'react-native'
import { act, fireEvent, render } from '@testing-library/react-native'
import { __resetQueryCache } from '../lib/query'
import NotificationSettingsScreen from '../app/(app)/(tabs)/settings/notifications'

jest.mock('expo-router', () => ({ useFocusEffect: () => {} }))
jest.mock('../lib/sentry', () => ({ Sentry: { captureException: jest.fn() } }))
jest.mock('../hooks/useStackBackTitle', () => ({ useStackBackTitle: () => {} }))
jest.mock('../contexts/session', () => ({
  useSession: () => ({ session: null, userId: 'u1', isGuest: false, loading: false }),
}))

type Update = { patch: Record<string, unknown>; release: (r: { error: unknown }) => void }
let mockUpdates: Update[]

jest.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => {
        const chain: Record<string, unknown> = {}
        chain.eq = () => chain
        // Private prefs come from user_settings (owner-only), not profiles.
        chain.maybeSingle = () => Promise.resolve({ data: table === 'user_settings' ? { notification_prefs: null } : null, error: null })
        chain.single = () => Promise.resolve({
          data: {
            id: 'u1', username: 'bryan', first_name: null, last_name: null, avatar_url: null, position: [],
            skill_level: null, created_at: 'x', selected_border: null, selected_card_bg: null, bio: null,
          },
          error: null,
        })
        return chain
      },
      update: () => ({ eq: () => Promise.reject(new Error(`unexpected ${table} update`)) }),
      upsert: (patch: Record<string, unknown>) => {
        if (table !== 'user_settings') return Promise.reject(new Error(`unexpected ${table} upsert`))
        return new Promise(release => { mockUpdates.push({ patch, release }) })
      },
    }),
  },
}))

async function flush() {
  await act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve()
  })
}

beforeEach(() => {
  __resetQueryCache()
  mockUpdates = []
})

describe('notification settings', () => {
  it('flipping two switches quickly saves both (latest prefs win) with no false error', async () => {
    const view = render(<NotificationSettingsScreen />)
    await flush()
    const switches = view.UNSAFE_getAllByType(Switch)

    act(() => { fireEvent(switches[0], 'valueChange', false) })
    act(() => { fireEvent(switches[1], 'valueChange', false) })
    expect(mockUpdates).toHaveLength(1)
    expect(view.queryByText('Could not save settings. Please try again.')).toBeNull()

    await act(async () => { mockUpdates[0].release({ error: null }) })
    await flush()
    expect(mockUpdates).toHaveLength(2)
    const latest = mockUpdates[1].patch.notification_prefs as { in_app: Record<string, boolean> }
    expect(Object.values(latest.in_app).filter(v => v === false)).toHaveLength(2)

    await act(async () => { mockUpdates[1].release({ error: null }) })
    await flush()
    expect(view.queryByText('Could not save settings. Please try again.')).toBeNull()
  })

  it('still reports a real failure of the latest save', async () => {
    const view = render(<NotificationSettingsScreen />)
    await flush()
    const switches = view.UNSAFE_getAllByType(Switch)
    act(() => { fireEvent(switches[0], 'valueChange', false) })
    await act(async () => { mockUpdates[0].release({ error: { message: 'denied' } }) })
    await flush()
    expect(view.getByText('Could not save settings. Please try again.')).toBeTruthy()
  })
})
