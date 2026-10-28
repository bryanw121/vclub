import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { queryKey, useMutation, useQuery } from '../lib/query'
import { useSession } from '../contexts/session'
import type { AccountDeletionPlan } from '../types'

/** Edge function that carries out the deletion (supabase/functions/delete-account). */
export const DELETE_ACCOUNT_FUNCTION = 'delete-account'
/** Typed on the confirm screen and sent to the function as proof of intent. */
export const DELETE_CONFIRMATION = 'DELETE'

const EMPTY_PLAN: AccountDeletionPlan = { clubs: [], tournaments: [], events: [], past_events_kept: 0 }

async function fetchPreview(): Promise<AccountDeletionPlan> {
  const { data, error } = await supabase.rpc('get_account_deletion_preview')
  if (error) throw error
  return { ...EMPTY_PLAN, ...((data ?? {}) as Partial<AccountDeletionPlan>) }
}

async function messageOf(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const body = await (error.context as Response).json().catch(() => null) as { error?: unknown } | null
    if (typeof body?.error === 'string') return body.error
  }
  return 'Could not delete your account. Please try again.'
}

/**
 * Account deletion: the preview of what will be deleted or handed over (always
 * fetched fresh: it must match what the server will do), and the delete
 * itself. On success the local session is cleared; the caller navigates away.
 */
export function useAccountDeletion() {
  const { userId } = useSession()
  const preview = useQuery(
    userId ? queryKey('settings', userId, 'deletion-preview') : null,
    fetchPreview,
    { staleMs: 0 },
  )

  const remove = useMutation<string, true>(async confirmation => {
    const { error } = await supabase.functions.invoke(DELETE_ACCOUNT_FUNCTION, { body: { confirm: confirmation } })
    if (error) throw new Error(await messageOf(error))
    // The account is gone server-side; only the device's copy of the session remains.
    await supabase.auth.signOut({ scope: 'local' })
    return true
  })

  return {
    plan: preview.data,
    isLoading: preview.isLoading,
    error: preview.error,
    refetch: preview.refetch,
    deleteAccount: remove.mutate,
    isDeleting: remove.isPending,
    deleteError: remove.error,
  }
}
