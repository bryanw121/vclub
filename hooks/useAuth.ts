import { useSession } from '../contexts/session'

/** Session + loading flag. Thin alias of `useSession()` kept for existing callers. */
export function useAuth() {
  const { session, loading } = useSession()
  return { session, loading }
}
