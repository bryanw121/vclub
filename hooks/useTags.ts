import { supabase } from '../lib/supabase'
import { queryKey, useQuery } from '../lib/query'
import type { QueryResult } from '../lib/query'
import { STALE } from '../constants/cache'
import type { Tag } from '../types'

const TAG_SELECT = 'id, name, category, display_order'

/** Cache key of the (global, near-static) tag list. */
export const TAGS_KEY = queryKey('tags')

/** Every tag, in display order. Throws on a Supabase error so `useQuery` keeps the last good list. */
export async function fetchTags(): Promise<Tag[]> {
  const { data, error } = await supabase.from('tags').select(TAG_SELECT).order('display_order', { ascending: true })
  if (error) throw error
  return (data ?? []) as Tag[]
}

/**
 * The event tags (event type, skill level, ...). One cache entry shared by the
 * host form and anything else that lists tags; the table changes so rarely that
 * it stays fresh for ten minutes.
 */
export function useTags(opts?: { enabled?: boolean }): QueryResult<Tag[]> {
  return useQuery<Tag[]>(TAGS_KEY, fetchTags, { staleMs: STALE.tags, enabled: opts?.enabled })
}
