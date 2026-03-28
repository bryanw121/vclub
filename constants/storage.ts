/** Supabase Storage bucket for profile photos. Create this bucket in the Supabase dashboard. */
export const AVATARS_BUCKET = 'avatars'

/** Must match the bucket’s max file size policy (private `avatars` bucket). */
export const AVATAR_MAX_FILE_BYTES = 3 * 1024 * 1024

/** Signed URL lifetime for private bucket avatars (`profiles.avatar_url` stores the object path). */
export const AVATAR_SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 7
