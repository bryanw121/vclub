/**
 * Schema the app already uses but the live database does not have yet: objects
 * created by migration files in `supabase/migrations/` that have not been
 * applied. `types/database.ts` is generated from the live DB, so it cannot
 * describe them; this file adds them to the client's `Database` type by hand.
 *
 * Until the migration is applied these calls fail at runtime (PostgREST 404 /
 * PGRST202). Once it is applied: regenerate `types/database.ts` and delete the
 * matching entry here (delete the file when it is empty).
 */
import type { Database, Json } from './database'

type PendingTables = {
  /** supabase/migrations/20261024120400_app_config_min_version.sql */
  app_config: {
    Row: {
      platform: string
      min_version: string
      store_url: string | null
      message: string | null
      updated_at: string
    }
    Insert: {
      platform: string
      min_version?: string
      store_url?: string | null
      message?: string | null
      updated_at?: string
    }
    Update: {
      platform?: string
      min_version?: string
      store_url?: string | null
      message?: string | null
      updated_at?: string
    }
    Relationships: []
  }
}

type PendingFunctions = {
  /** supabase/migrations/20261025120000_tournament_rpcs.sql — returns the joined team id. */
  accept_tournament_invite: { Args: { p_invite_id: string }; Returns: string }
  /** supabase/migrations/20261025120000_tournament_rpcs.sql — returns the number of matches inserted. */
  replace_tournament_schedule: {
    Args: { p_tournament_id: string; p_matches: Json; p_pools?: Json }
    Returns: number
  }
}

type PublicSchema = Database['public']

/** The client's database type: the generated live schema plus the pending objects above. */
export type AppDatabase = Omit<Database, 'public'> & {
  public: Omit<PublicSchema, 'Tables' | 'Functions'> & {
    Tables: PublicSchema['Tables'] & PendingTables
    Functions: PublicSchema['Functions'] & PendingFunctions
  }
}

/** Row of a pending table. */
export type PendingTableRow<T extends keyof PendingTables> = PendingTables[T]['Row']
