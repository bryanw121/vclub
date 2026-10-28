/**
 * Pure pieces of the delete-account function (no Deno globals; jest imports it).
 */

/** What the person must type on the confirm screen, sent along as proof of intent. */
export const DELETE_CONFIRMATION = 'DELETE'

export function isDeleteConfirmed(body: unknown): boolean {
  return !!body && typeof body === 'object' && (body as Record<string, unknown>).confirm === DELETE_CONFIRMATION
}

/** Storage buckets whose `<uid>/...` folder belongs to the person (uploads they made). */
export const USER_FOLDER_BUCKETS = ['avatars', 'chat-images'] as const

/** Bearer token from an Authorization header, or null. */
export function bearerToken(header: string | null): string | null {
  const m = /^Bearer\s+(.+)$/i.exec(header ?? '')
  return m ? m[1].trim() : null
}
