/*
-- Run in Supabase SQL editor:
-- (schema comments retained from prior clubs setup — see git history for full DDL)
*/

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native'
import { Image } from 'expo-image'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { Stack, useRouter, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../../lib/supabase'
import { shared, theme } from '../../../constants'
import { DocScrollView } from '../../../components/DocScrollView'
import { useTabsActive, useTabsShell } from '../../../contexts/tabs'
import { resolveClubAvatarUri } from '../../../utils'
import type { Club, ClubMember, MajorCity } from '../../../types'

/** List payload: member count; membership embed is added when signed in. */
const CLUB_LIST_SELECT_BASE =
  'id, name, description, membership_type, created_by, avatar_url, cover_url, created_at, major_city_id, major_cities (id, display_name, city_name, admin_region, country_code), club_members(count)'

const CLUB_LIST_MY_MEMBERSHIP = 'my_membership:club_members(club_id, user_id, role, joined_at)'

type ClubListItem = Club & {
  major_cities: MajorCity | null
  club_members: { count: number }[]
  my_membership?: Pick<ClubMember, 'club_id' | 'user_id' | 'role' | 'joined_at'>[]
}

/** PostgREST usually returns one embedded row as an object; normalize if it ever comes back as a single-element array. */
function resolvedMajorCity(c: ClubListItem): MajorCity | null {
  const raw = c.major_cities as unknown
  if (raw == null) return null
  if (Array.isArray(raw)) return (raw[0] as MajorCity | undefined) ?? null
  return raw as MajorCity
}

function memberCount(club: ClubListItem): number {
  return Number(club.club_members?.[0]?.count ?? 0)
}

/** Deterministic color for a club based on its name */
function clubColor(name: string): string {
  const PALETTE = [
    theme.colors.primary, theme.colors.warm, theme.colors.cool,
    theme.colors.hot, theme.colors.accent, '#8B5CF6', '#0EA5E9', '#10B981',
  ]
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff
  return PALETTE[Math.abs(h) % PALETTE.length]
}

type ClubCardProps = {
  club: ClubListItem
  isOwner: boolean
  isMember: boolean
  onPress: () => void
  onJoin: () => Promise<void>
}

function ClubCard({ club, isOwner, isMember, onPress, onJoin }: ClubCardProps) {
  const [avatarUri, setAvatarUri] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const count = memberCount(club)
  const initial = club.name.charAt(0).toUpperCase()
  const color = clubColor(club.name)

  useEffect(() => {
    let cancelled = false
    resolveClubAvatarUri(club.avatar_url).then(uri => {
      if (!cancelled) setAvatarUri(uri)
    })
    return () => { cancelled = true }
  }, [club.avatar_url])

  async function handleJoinPress(e: any) {
    e.stopPropagation?.()
    setJoining(true)
    try {
      await onJoin()
    } finally {
      setJoining(false)
    }
  }

  return (
    <TouchableOpacity
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        marginBottom: 10,
        backgroundColor: theme.colors.card,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: theme.colors.border,
        padding: 14,
        overflow: 'hidden',
      }}
      onPress={onPress}
      activeOpacity={0.72}
    >
      <View style={{ width: 54, height: 54, borderRadius: 14, overflow: 'hidden', flexShrink: 0 }}>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={{ width: 54, height: 54 }} contentFit="cover" transition={150} />
        ) : (
          <LinearGradient
            colors={[color, color + 'BB', color + '77'] as [string, string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ width: 54, height: 54, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontFamily: theme.fonts.display, fontWeight: '700', fontSize: 24, color: '#fff', textShadowColor: 'rgba(0,0,0,0.2)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }}>
              {initial}
            </Text>
          </LinearGradient>
        )}
      </View>

      <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
        <Text style={{ fontFamily: theme.fonts.display, fontSize: 16, letterSpacing: -0.3, color: theme.colors.text }} numberOfLines={1}>
          {club.name}
        </Text>
        <Text style={{ fontFamily: theme.fonts.body, fontSize: 11.5, color: theme.colors.subtext }} numberOfLines={1}>
          {resolvedMajorCity(club)?.display_name ?? 'Unknown'} · {count} members{isOwner ? ' · Owner' : ''}
        </Text>
      </View>

      {isMember ? (
        <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: theme.colors.cool + '20' }}>
          <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: 12, color: theme.colors.cool }}>✓ Joined</Text>
        </View>
      ) : (
        <TouchableOpacity
          onPress={handleJoinPress}
          disabled={joining}
          style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: theme.colors.primary, opacity: joining ? 0.6 : 1 }}
        >
          {joining
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: 12, color: '#fff' }}>Join</Text>
          }
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  )
}

type ClubFilter = 'joined' | 'nearby' | 'popular'

export default function ClubsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { docScrollActive, tabBarHeight } = useTabsShell()
  const { activeTabIndex } = useTabsActive()
  const isActive = activeTabIndex === 1
  const [clubs, setClubs] = useState<ClubListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [filter, setFilter] = useState<ClubFilter>('joined')
  const [searchQuery, setSearchQuery] = useState('')
  const hasFetched = useRef(false)

  const fetchClubs = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true)
    else if (!hasFetched.current) setLoading(true)
    setFetchError(null)

    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user.id ?? null
    setUserId(uid)

    let query = supabase
      .from('clubs')
      .select(uid ? `${CLUB_LIST_SELECT_BASE}, ${CLUB_LIST_MY_MEMBERSHIP}` : CLUB_LIST_SELECT_BASE)
      .order('created_at', { ascending: false })
    if (uid) {
      query = query.eq('my_membership.user_id', uid)
    }

    const { data, error } = await query

    if (error) {
      console.error('clubs fetch error:', error)
      setFetchError(error.message)
    }
    setClubs((data ?? []) as unknown as ClubListItem[])
    hasFetched.current = true
    if (showRefreshing) setRefreshing(false)
    else setLoading(false)
  }, [])

  // Fetch when this pager page becomes active (neighbor prefetch may mount early).
  useEffect(() => {
    if (!isActive) return
    void fetchClubs()
  }, [isActive, fetchClubs])

  // Refetch when returning to the main shell while already on Clubs.
  useFocusEffect(useCallback(() => {
    if (!isActive || !hasFetched.current) return
    void fetchClubs()
  }, [isActive, fetchClubs]))

  function onRefresh() {
    void fetchClubs(true)
  }

  const myClubs = useMemo(() =>
    clubs.filter(c => (c.my_membership ?? []).some(m => m.user_id === userId)),
  [clubs, userId])

  const discoverClubs = useMemo(() =>
    clubs.filter(c => !(c.my_membership ?? []).some(m => m.user_id === userId)),
  [clubs, userId])

  const discoverOrdered = useMemo(() =>
    filter === 'popular'
      ? [...discoverClubs].sort((a, b) => memberCount(b) - memberCount(a))
      : discoverClubs,
  [discoverClubs, filter])

  const q = searchQuery.trim().toLowerCase()
  function matchesSearch(c: ClubListItem): boolean {
    if (!q) return true
    const inName = c.name.toLowerCase().includes(q)
    const mc = resolvedMajorCity(c)
    const inRegion = !!mc && (
      mc.display_name.toLowerCase().includes(q)
      || mc.city_name.toLowerCase().includes(q)
      || (mc.admin_region ?? '').toLowerCase().includes(q)
    )
    return inName || inRegion
  }

  function isOwner(club: ClubListItem): boolean {
    return (club.my_membership ?? []).some(m => m.user_id === userId && m.role === 'owner')
  }

  function isMember(club: ClubListItem): boolean {
    return (club.my_membership ?? []).some(m => m.user_id === userId)
  }

  async function handleJoin(club: ClubListItem) {
    if (!userId) return
    setClubs(prev => prev.map(c =>
      c.id !== club.id ? c : {
        ...c,
        club_members: [{ count: memberCount(c) + 1 }],
        my_membership: [{ club_id: c.id, user_id: userId, role: 'member', joined_at: new Date().toISOString() }],
      }
    ))
    const { error } = await supabase
      .from('club_members')
      .insert({ club_id: club.id, user_id: userId, role: 'member' })
    if (error) {
      setClubs(prev => prev.map(c =>
        c.id !== club.id ? c : {
          ...c,
          club_members: [{ count: Math.max(0, memberCount(c) - 1) }],
          my_membership: [],
        }
      ))
      Alert.alert('Could not join', error.message)
    }
  }

  const baseList = filter === 'joined' ? myClubs : discoverOrdered
  const visibleClubs = (q ? clubs : baseList).filter(matchesSearch)

  const listHeader = (
    <>
      <View style={{
        paddingHorizontal: theme.spacing.lg,
        paddingTop: theme.spacing.md,
        paddingBottom: 4,
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: theme.spacing.md,
      }}>
        <Text style={{ fontFamily: theme.fonts.display, fontSize: 34, letterSpacing: -1.2, color: theme.colors.text, lineHeight: 38, flex: 1 }}>
          Clubs
        </Text>
        <TouchableOpacity
          onPress={() => router.push('/club/create' as any)}
          accessibilityRole="button"
          accessibilityLabel="Create a new club"
          style={{
            marginTop: 6,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: theme.radius.full,
            backgroundColor: theme.colors.primary,
          }}
        >
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: 13, color: '#fff' }}>Create</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm }}>
        {([
          { id: 'joined',  label: 'Joined' },
          { id: 'nearby',  label: 'Near me' },
          { id: 'popular', label: 'Popular' },
        ] as const).map(f => {
          const active = filter === f.id
          return (
            <TouchableOpacity
              key={f.id}
              onPress={() => setFilter(f.id)}
              style={{
                paddingHorizontal: 14, paddingVertical: 7,
                borderRadius: theme.radius.full,
                backgroundColor: active ? theme.colors.primary : theme.colors.card,
                borderWidth: active ? 0 : 1,
                borderColor: theme.colors.border,
              }}
            >
              <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: 12, color: active ? '#fff' : theme.colors.text }}>
                {f.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>

      <View style={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.sm }}>
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
          paddingHorizontal: 12,
          paddingVertical: 10,
          backgroundColor: theme.colors.card,
        }}>
          <Ionicons name="search-outline" size={18} color={theme.colors.subtext} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search all clubs by name or city…"
            placeholderTextColor={theme.colors.subtext}
            style={{
              flex: 1,
              fontFamily: theme.fonts.body,
              fontSize: 16,
              color: theme.colors.text,
              padding: 0,
            }}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
        </View>
      </View>
    </>
  )

  const emptyBody = (
    <View style={[shared.card, { alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.xl, marginHorizontal: theme.spacing.lg }]}>
      <Ionicons name="people-outline" size={48} color={theme.colors.subtext} />
      <Text style={[shared.caption, { textAlign: 'center', maxWidth: 260 }]}>
        {searchQuery.trim()
          ? 'No clubs match your search.'
          : filter === 'joined'
          ? "You haven't joined any clubs yet."
          : filter === 'nearby'
          ? discoverClubs.length > 0 ? "No clubs match this view — try another filter or search." : "No clubs yet. Check back soon!"
          : clubs.length > 0 ? "You're in all available clubs!" : "No clubs yet. Check back soon!"}
      </Text>
    </View>
  )

  return (
    <View style={[shared.screen, { paddingTop: insets.top }, docScrollActive && ({ flex: undefined } as any)]}>
      <Stack.Screen options={{ headerShown: false }} />

      {loading ? (
        <>
          {listHeader}
          <View style={shared.centered}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        </>
      ) : fetchError ? (
        <>
          {listHeader}
          <View style={shared.centered}>
            <Text style={[shared.caption, { color: theme.colors.error, textAlign: 'center', paddingHorizontal: theme.spacing.lg }]}>
              {fetchError}
            </Text>
          </View>
        </>
      ) : docScrollActive ? (
        <DocScrollView
          docScroll
          style={shared.screen}
          contentContainerStyle={{ paddingBottom: tabBarHeight + 32 }}
        >
          {listHeader}
          {visibleClubs.length === 0
            ? emptyBody
            : visibleClubs.map(club => (
              <View key={club.id} style={{ paddingHorizontal: theme.spacing.lg }}>
                <ClubCard
                  club={club}
                  isOwner={isOwner(club)}
                  isMember={isMember(club)}
                  onPress={() => router.push(`/club/${club.id}` as any)}
                  onJoin={() => handleJoin(club)}
                />
              </View>
            ))}
        </DocScrollView>
      ) : (
        <FlatList
          data={visibleClubs}
          keyExtractor={c => c.id}
          ListHeaderComponent={listHeader}
          contentContainerStyle={{ paddingBottom: tabBarHeight + 32 }}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={7}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.primary}
              colors={[theme.colors.primary]}
            />
          }
          ListEmptyComponent={emptyBody}
          renderItem={({ item: club }) => (
            <View style={{ paddingHorizontal: theme.spacing.lg }}>
              <ClubCard
                club={club}
                isOwner={isOwner(club)}
                isMember={isMember(club)}
                onPress={() => router.push(`/club/${club.id}` as any)}
                onJoin={() => handleJoin(club)}
              />
            </View>
          )}
        />
      )}
    </View>
  )
}
