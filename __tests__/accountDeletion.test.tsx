import React from 'react'
import { render } from '@testing-library/react-native'
import { bearerToken, isDeleteConfirmed } from '../supabase/functions/_shared/accountDeletion'
import { deletionPlanIsEmpty } from '../utils/accountDeletion'
import { DeletionPlanList } from '../components/profile/DeletionPlanList'
import type { AccountDeletionPlan } from '../types'

const bo = { id: 'u2', username: 'bo', first_name: 'Bo', last_name: 'Lee' }
const PLAN: AccountDeletionPlan = {
  clubs: [
    { id: 'c1', name: 'Sand Club', action: 'transfer', to: bo },
    { id: 'c2', name: 'Solo Club', action: 'delete', to: null },
  ],
  tournaments: [
    { id: 't1', title: 'Fall Cup', action: 'delete', with_club: 'Solo Club', to: null },
    { id: 't2', title: 'Spring Cup', action: 'transfer', with_club: null, to: bo },
  ],
  events: [
    { id: 'e1', title: 'Tuesday Open', event_date: '2026-11-03T19:00:00', action: 'cancel', to: null },
    { id: 'e2', title: 'Thursday Open', event_date: '2026-11-05T19:00:00', action: 'transfer', to: bo },
  ],
  past_events_kept: 3,
}

describe('delete-account request checks', () => {
  it('requires the typed confirmation', () => {
    expect(isDeleteConfirmed({ confirm: 'DELETE' })).toBe(true)
    expect(isDeleteConfirmed({ confirm: 'delete' })).toBe(false)
    expect(isDeleteConfirmed({})).toBe(false)
    expect(isDeleteConfirmed(null)).toBe(false)
  })
  it('reads a bearer token', () => {
    expect(bearerToken('Bearer abc.def')).toBe('abc.def')
    expect(bearerToken('Basic xyz')).toBeNull()
    expect(bearerToken(null)).toBeNull()
  })
})

describe('DeletionPlanList', () => {
  it('names every club, tournament and event with what happens to it', () => {
    const view = render(<DeletionPlanList plan={PLAN} />)
    for (const name of ['Sand Club', 'Solo Club', 'Fall Cup', 'Spring Cup', 'Tuesday Open', 'Thursday Open']) {
      expect(view.getByText(name)).toBeTruthy()
    }
    expect(view.getAllByText('Goes to Bo Lee (@bo)')).toHaveLength(2)
    expect(view.getByText('Goes to Bo Lee (@bo) (your co-host)')).toBeTruthy()
    expect(view.getByText('Deleted with the club')).toBeTruthy()
    expect(view.getByText('Cancelled, and players who joined are notified')).toBeTruthy()
    expect(view.getByText('3 past events you hosted will stay, without your name.')).toBeTruthy()
  })
  it('says so when nothing else is affected', () => {
    const empty = { clubs: [], tournaments: [], events: [], past_events_kept: 0 }
    expect(deletionPlanIsEmpty(empty)).toBe(true)
    const view = render(<DeletionPlanList plan={empty} />)
    expect(view.getByText(/nothing else is deleted or handed over/)).toBeTruthy()
  })
})
