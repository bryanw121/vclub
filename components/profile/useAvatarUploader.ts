import { useCallback, useEffect, useState } from 'react'
import { Alert } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../../lib/supabase'
import { Sentry } from '../../lib/sentry'
import { AVATARS_BUCKET, AVATAR_MAX_FILE_BYTES } from '../../constants'
import { useSession } from '../../contexts/session'
import { resolveProfileAvatarUriWithError } from '../../utils'
import type { Profile, ProfilePatch } from '../../types'

const TOO_BIG = 'Photo must be smaller than 3 MB. Please try again.'

type Options = {
  profile: Profile
  updateProfile: (patch: ProfilePatch) => Promise<boolean>
  /** Called with the profile as saved after a new photo lands (badge checks hang off this). */
  onSaved: (updated: Profile) => void
  onToast: (message: string) => void
}

export type AvatarUploader = {
  /** The picture to render; null while loading or when there is none. */
  uri: string | null
  /** An upload, removal or URL lookup is in flight. */
  busy: boolean
  /** Why the stored picture could not be displayed, if it could not. */
  uriError: string | null
  /** A picked photo awaiting the user's "Use Photo" confirmation. */
  pending: ImagePicker.ImagePickerAsset | null
  pick: () => Promise<void>
  confirm: () => Promise<void>
  cancel: () => void
  remove: () => Promise<void>
}

/** Pick → preview → upload → save for the signed-in user's profile picture. */
export function useAvatarUploader({ profile, updateProfile, onSaved, onToast }: Options): AvatarUploader {
  const { userId } = useSession()
  const [uploading, setUploading] = useState(false)
  const [pending, setPending] = useState<ImagePicker.ImagePickerAsset | null>(null)
  const [uri, setUri] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)
  const [uriError, setUriError] = useState<string | null>(null)

  const avatarRef = profile.avatar_url
  useEffect(() => {
    if (!avatarRef) {
      setUri(null)
      setUriError(null)
      return
    }
    let cancelled = false
    setResolving(true)
    void resolveProfileAvatarUriWithError(avatarRef).then(res => {
      if (cancelled) return
      setUri(res.uri)
      setUriError(res.error)
      setResolving(false)
    })
    return () => { cancelled = true }
  }, [avatarRef])

  const pick = useCallback(async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Allow photo library access to upload a profile picture.')
        return
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true, aspect: [1, 1], quality: 0.6,
      })
      if (result.canceled) return
      const asset = result.assets[0]
      if (asset.fileSize != null && asset.fileSize > AVATAR_MAX_FILE_BYTES) {
        onToast(TOO_BIG)
        return
      }
      setPending(asset)
    } catch (e) {
      Sentry.captureException(e)
      Alert.alert('Error', 'Could not select photo. Please try again.')
    }
  }, [onToast])

  const confirm = useCallback(async () => {
    if (!pending || !userId) return
    const asset = pending
    setPending(null)
    try {
      setUploading(true)
      const ext = asset.mimeType?.includes('png') ? 'png' : 'jpg'
      const path = `${userId}/avatar_${Date.now()}.${ext}`
      const contentType = asset.mimeType ?? (ext === 'png' ? 'image/png' : 'image/jpeg')
      const response = await fetch(asset.uri)
      const arrayBuffer = await response.arrayBuffer()
      if (arrayBuffer.byteLength > AVATAR_MAX_FILE_BYTES) {
        onToast(TOO_BIG)
        return
      }
      if (profile.avatar_url && !/^https?:\/\//i.test(profile.avatar_url)) {
        await supabase.storage.from(AVATARS_BUCKET).remove([profile.avatar_url])
      }
      const { error: uploadError } = await supabase.storage.from(AVATARS_BUCKET).upload(path, arrayBuffer, { contentType })
      if (uploadError) throw uploadError
      if (!(await updateProfile({ avatar_url: path }))) throw new Error('Could not save the new profile picture')
      onSaved({ ...profile, avatar_url: path })
    } catch (e) {
      Sentry.captureException(e)
      Alert.alert('Error', 'Could not upload photo. Please try again.')
    } finally {
      setUploading(false)
    }
  }, [pending, userId, profile, updateProfile, onSaved, onToast])

  const remove = useCallback(async () => {
    if (!profile.avatar_url) return
    try {
      setUploading(true)
      if (!/^https?:\/\//i.test(profile.avatar_url)) {
        await supabase.storage.from(AVATARS_BUCKET).remove([profile.avatar_url])
      }
      if (!(await updateProfile({ avatar_url: null }))) throw new Error('Could not remove the profile picture')
    } catch (e) {
      Sentry.captureException(e)
      Alert.alert('Error', 'Could not remove photo. Please try again.')
    } finally {
      setUploading(false)
    }
  }, [profile.avatar_url, updateProfile])

  const busy = uploading || resolving
  return {
    uri: busy ? null : uri,
    busy,
    uriError,
    pending,
    pick,
    confirm,
    cancel: () => setPending(null),
    remove,
  }
}
