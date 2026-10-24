import { useCallback } from 'react'
import { usePathname, useRouter } from 'expo-router'
import { useSession } from '../contexts/session'
import { setPostSignInRedirect } from '../utils/authGate'

/**
 * For actions that need an account (join, host, message). Returns a guard:
 * `if (!requireSignIn()) return` — signed-in users pass straight through; guests
 * are sent to login and brought back to `returnTo` (default: the current page).
 */
export function useRequireSignIn() {
  const { userId } = useSession()
  const router = useRouter()
  const pathname = usePathname()

  return useCallback((returnTo?: string): boolean => {
    if (userId) return true
    setPostSignInRedirect(returnTo ?? pathname)
    router.push('/(auth)/login' as any)
    return false
  }, [userId, router, pathname])
}
