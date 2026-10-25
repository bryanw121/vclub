import { GENERIC_ERROR_MESSAGE } from './copy'

/** Tournament screen copy and labels. Shared copy lives in constants/copy.ts. */

/** Shown when a write fails and the server gave no usable message. */
export const TOURNAMENT_GENERIC_ERROR = GENERIC_ERROR_MESSAGE

export const TOURNAMENT_ERROR_TITLE = {
  register: 'Registration failed',
  withdraw: 'Could not withdraw',
  invite: 'Could not send invite',
  acceptInvite: 'Could not accept invitation',
  declineInvite: 'Could not decline invitation',
  joinRequest: 'Could not send request',
  reviewRequest: 'Could not update request',
  team: 'Could not update team',
  movePlayer: 'Could not move player',
  schedule: 'Could not update schedule',
  match: 'Could not save match',
  publish: 'Could not publish',
  prize: 'Could not update prizes',
  comment: 'Could not update discussion',
  announcement: 'Could not post announcement',
} as const

export const FORMAT_LABELS: Record<string, string> = {
  pool_bracket: 'Pool Play + Bracket',
  bracket:      'Bracket Only',
  pool_play:    'Pool Play Only',
  round_robin:  'Full Round Robin',
}

export const TOURNAMENT_TABS = ['Overview', 'Teams', 'Schedule', 'Discussion'] as const

/** Choices offered by the schedule generator form. */
export const SCHEDULE_OPTIONS = {
  courts: [1, 2, 3, 4, 6],
  matchDuration: [30, 45, 60, 75, 90],
  breakDuration: [0, 5, 10, 15, 20],
  gamesPerTeam: [null, 2, 3, 4, 5],
} as const
