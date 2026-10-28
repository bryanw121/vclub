import type { AccountDeletionPlan } from '../types'

/** True when deleting the account deletes or hands over nothing beyond the person's own data. */
export function deletionPlanIsEmpty(plan: AccountDeletionPlan): boolean {
  return plan.clubs.length === 0 && plan.tournaments.length === 0 && plan.events.length === 0 && plan.past_events_kept === 0
}

