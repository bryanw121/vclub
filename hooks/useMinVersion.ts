import { useEffect, useState } from 'react'
import { Platform } from 'react-native'
import { supabase } from '../lib/supabase'
import { currentAppVersion, isBelowMinimum } from '../utils/appVersion'
import type { AppConfigRow, UpdateRequirement } from '../types'

/**
 * Checks the app_config table once per launch. Returns an UpdateRequirement when this
 * install is older than the platform's min_version, otherwise null.
 * Fails open: if the table is missing or the network is down, the app runs as usual.
 */
export function useMinVersion(): UpdateRequirement | null {
  const [requirement, setRequirement] = useState<UpdateRequirement | null>(null)

  useEffect(() => {
    let cancelled = false
    const platform = Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web'
    supabase
      .from('app_config')
      .select('platform, min_version, store_url, message')
      .eq('platform', platform)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error || !data) return
        const row = data as AppConfigRow
        const current = currentAppVersion()
        if (isBelowMinimum(current, row.min_version)) {
          setRequirement({ current, minimum: row.min_version, storeUrl: row.store_url, message: row.message })
        }
      })
    return () => { cancelled = true }
  }, [])

  return requirement
}
