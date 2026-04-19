/*
-- Run in Supabase SQL editor:
-- create table public.clubs (
--   id uuid primary key default gen_random_uuid(),
--   name text not null,
--   description text,
--   membership_type text not null default 'open' check (membership_type in ('open', 'invite')),
--   created_by uuid not null references public.profiles(id),
--   avatar_url text,
--   created_at timestamptz not null default now()
-- );
-- create table public.club_members (
--   club_id uuid not null references public.clubs(id) on delete cascade,
--   user_id uuid not null references public.profiles(id) on delete cascade,
--   role text not null default 'member' check (role in ('owner', 'member')),
--   joined_at timestamptz not null default now(),
--   primary key (club_id, user_id)
-- );
-- alter table public.events add column if not exists club_id uuid references public.clubs(id) on delete set null;
-- alter table public.profiles add column if not exists is_admin boolean not null default false;
-- alter table public.clubs enable row level security;
-- create policy "Anyone reads clubs" on public.clubs for select using (true);
-- create policy "Admins insert clubs" on public.clubs for insert with check ((select is_admin from public.profiles where id = auth.uid()));
-- create policy "Owners update clubs" on public.clubs for update using (exists (select 1 from public.club_members where club_id = id and user_id = auth.uid() and role = 'owner'));
-- alter table public.club_members enable row level security;
-- create policy "Anyone reads club_members" on public.club_members for select using (true);
-- create policy "Users join open clubs" on public.club_members for insert with check (auth.uid() = user_id and (select membership_type from public.clubs where id = club_id) = 'open');
-- create policy "Users leave clubs" on public.club_members for delete using (auth.uid() = user_id);
-- create policy "Owners manage members" on public.club_members for all using (exists (select 1 from public.club_members cm2 where cm2.club_id = club_members.club_id and cm2.user_id = auth.uid() and cm2.role = 'owner'));
-- Storage: create bucket 'club-avatars' (private). Add policies: SELECT for authenticated, INSERT/UPDATE/DELETE for club owners.
*/

import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { Stack, useRouter, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../../lib/supabase'
import { shared, theme } from '../../../constants'
import { resolveClubAvatarUri } from '../../../utils'
import type { ClubWithDetails, MajorCity } from '../../../types'

const CLUB_LIST_SELECT =
  'id, name, description, membership_type, created_by, avatar_url, cover_url, created_at, major_city_id, major_cities (id, display_name, city_name, admin_region, country_code), club_members (club_id, user_id, role, joined_at, profiles (id, username, first_name, last_name, avatar_url))'

/** PostgREST usually returns one embedded row as an object; normalize if it ever comes back as a single-element array. */
function resolvedMajorCity(c: ClubWithDetails): MajorCity | null {
  const raw = c.major_cities as unknown
  if (raw == null) return null
  if (Array.isArray(raw)) return (raw[0] as MajorCity | undefined) ?? null
  return raw as MajorCity
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
  club: ClubWithDetails
  isOwner: boolean
  isMember: boolean
  onPress: () => void
}

function ClubCard({ club, isOwner, isMember, onPress }: ClubCardProps) {
  const [avatarUri, setAvatarUri] = useState<string | null>(null)
  const memberCount = club.club_members.length
  const initial = club.name.charAt(0).toUpperCase()
  const color = clubColor(club.name)

  useEffect(() => {
    let cancelled = false
    resolveClubAvatarUri(club.avatar_url).then(uri => {
      if (!cancelled) setAvatarUri(uri)
    })
    return () => { cancelled = true }
  }, [club.avatar_url])

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
      {/* Diagonal-stripe avatar */}
      <View style={{ width: 54, height: 54, borderRadius: 14, overflow: 'hidden', flexShrink: 0 }}>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={{ width: 54, height: 54 }} />
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

      {/* Info */}
      <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
        <Text style={{ fontFamily: theme.fonts.display, fontSize: 16, letterSpacing: -0.3, color: theme.colors.text }} numberOfLines={1}>
          {club.name}
        </Text>
        <Text style={{ fontFamily: theme.fonts.body, fontSize: 11.5, color: theme.colors.subtext }} numberOfLines={1}>
          {resolvedMajorCity(club)?.display_name ?? 'Unknown'} · {memberCount} members{isOwner ? ' · Owner' : ''}
        </Text>
      </View>

      {/* Joined badge or Join button */}
      {isMember ? (
        <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: theme.colors.cool + '20' }}>
          <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: 12, color: theme.colors.cool }}>✓ Joined</Text>
        </View>
      ) : (
        <TouchableOpacity
          onPress={onPress}
          style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: theme.colors.primary }}
        >
          <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: 12, color: '#fff' }}>Join</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  )
}

type ClubFilter = 'joined' | 'nearby' | 'popular'

export default function ClubsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [clubs, setClubs] = useState<ClubWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [filter, setFilter] = useState<ClubFilter>('joined')
  const [searchQuery, setSearchQuery] = useState('')

  async function fetchClubs(showRefreshing = false) {
    if (showRefreshing) setRefreshing(true)
    else setLoading(true)
    setFetchError(null)

    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user.id ?? null
    setUserId(uid)

    const { data, error } = await supabase
      .from('clubs')
      .select(CLUB_LIST_SELECT)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('clubs fetch error:', error)
      setFetchError(error.message)
    }
    setClubs((data ?? []) as unknown as ClubWithDetails[])
    if (showRefreshing) setRefreshing(false)
    else setLoading(false)
  }

  useEffect(() => {
    fetchClubs()
  }, [])

  useFocusEffect(useCallback(() => {
    fetchClubs()
  }, []))

  function onRefresh() {
    fetchClubs(true)
  }

  const myClubs = clubs.filter(c =>
    c.club_members.some(m => m.user_id === userId)
  )
  const discoverClubs = clubs.filter(c =>
    !c.club_members.some(m => m.user_id === userId)
  )

  const discoverOrdered =
    filter === 'popular'
      ? [...discoverClubs].sort((a, b) => b.club_members.length - a.club_members.length)
      : discoverClubs

  const q = searchQuery.trim().toLowerCase()
  function matchesSearch(c: ClubWithDetails): boolean {
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

  function isOwner(club: ClubWithDetails): boolean {
    return club.club_members.some(m => m.user_id === userId && m.role === 'owner')
  }

  function isMember(club: ClubWithDetails): boolean {
    return club.club_members.some(m => m.user_id === userId)
  }

  const baseList = filter === 'joined' ? myClubs : discoverOrdered
  // When searching, scan all clubs — otherwise "Joined" + search only searched empty myClubs for new users.
  const visibleClubs = (q ? clubs : baseList).filter(matchesSearch)

  return (
    <View style={[shared.screen, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
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

      {/* Filter pills */}
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

      {loading ? (
        <View style={shared.centered}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : fetchError ? (
        <View style={shared.centered}>
          <Text style={[shared.caption, { color: theme.colors.error, textAlign: 'center', paddingHorizontal: theme.spacing.lg }]}>
            {fetchError}
          </Text>
        </View>
      ) : (
        <ScrollView
          style={shared.screen}
          contentContainerStyle={{ padding: theme.spacing.lg, paddingTop: 4 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.primary}
              colors={[theme.colors.primary]}
            />
          }
        >
          {visibleClubs.length === 0 ? (
            <View style={[shared.card, { alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.xl }]}>
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
          ) : (
            visibleClubs.map(club => (
              <ClubCard
                key={club.id}
                club={club}
                isOwner={isOwner(club)}
                isMember={isMember(club)}
                onPress={() => router.push(`/club/${club.id}` as any)}
              />
            ))
          )}
        </ScrollView>
      )}
    </View>
  )
}
