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
  TouchableOpacity,
  View,
  Image,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Stack, useRouter, useFocusEffect } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import { shared, theme } from '../../../constants'
import { resolveClubAvatarUri } from '../../../utils'
import type { ClubWithDetails } from '../../../types'

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

  useEffect(() => {
    let cancelled = false
    resolveClubAvatarUri(club.avatar_url).then(uri => {
      if (!cancelled) setAvatarUri(uri)
    })
    return () => { cancelled = true }
  }, [club.avatar_url])

  return (
    <TouchableOpacity
      style={[shared.card, { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, marginBottom: theme.spacing.sm }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Avatar */}
      <View style={{
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: theme.colors.primary + '22',
        borderWidth: 1,
        borderColor: theme.colors.primary + '44',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        flexShrink: 0,
      }}>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={{ width: 52, height: 52, borderRadius: 26 }} />
        ) : (
          <Text style={{ fontSize: theme.font.size.xl, fontWeight: theme.font.weight.bold, color: theme.colors.primary }}>
            {initial}
          </Text>
        )}
      </View>

      {/* Info */}
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
          <Text style={[shared.subheading, { flex: 1 }]} numberOfLines={1}>{club.name}</Text>
          {isOwner && (
            <View style={{
              paddingHorizontal: theme.spacing.xs,
              paddingVertical: 2,
              borderRadius: theme.radius.sm,
              backgroundColor: theme.colors.primary,
            }}>
              <Text style={{ fontSize: theme.font.size.xs, fontWeight: theme.font.weight.semibold, color: theme.colors.white }}>
                Owner
              </Text>
            </View>
          )}
        </View>

        <Text style={shared.caption}>
          {memberCount} {memberCount === 1 ? 'member' : 'members'}
        </Text>

        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          marginTop: 1,
          alignSelf: 'flex-start',
          paddingHorizontal: theme.spacing.xs,
          paddingVertical: 2,
          borderRadius: theme.radius.sm,
          backgroundColor: club.membership_type === 'open'
            ? theme.colors.success + '18'
            : theme.colors.subtext + '18',
          borderWidth: 1,
          borderColor: club.membership_type === 'open'
            ? theme.colors.success + '40'
            : theme.colors.border,
        }}>
          <Ionicons
            name={club.membership_type === 'open' ? 'globe-outline' : 'lock-closed-outline'}
            size={10}
            color={club.membership_type === 'open' ? theme.colors.success : theme.colors.subtext}
          />
          <Text style={{
            fontSize: theme.font.size.xs,
            fontWeight: theme.font.weight.medium,
            color: club.membership_type === 'open' ? theme.colors.success : theme.colors.subtext,
          }}>
            {club.membership_type === 'open' ? 'Open' : 'Invite only'}
          </Text>
        </View>
      </View>

      <Ionicons name="chevron-forward" size={18} color={theme.colors.subtext} />
    </TouchableOpacity>
  )
}

export default function ClubsScreen() {
  const router = useRouter()
  const [clubs, setClubs] = useState<ClubWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)

  async function fetchClubs(showRefreshing = false) {
    if (showRefreshing) setRefreshing(true)
    else setLoading(true)
    setFetchError(null)

    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user.id ?? null
    setUserId(uid)

    const { data, error } = await supabase
      .from('clubs')
      .select('*, club_members (club_id, user_id, role, joined_at, profiles (id, username, first_name, last_name, avatar_url))')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('clubs fetch error:', error)
      setFetchError(error.message)
    }
    setClubs((data ?? []) as ClubWithDetails[])
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

  function isOwner(club: ClubWithDetails): boolean {
    return club.club_members.some(m => m.user_id === userId && m.role === 'owner')
  }

  function isMember(club: ClubWithDetails): boolean {
    return club.club_members.some(m => m.user_id === userId)
  }

  return (
    <View style={[shared.screen]}>
      <Stack.Screen options={{ title: 'Clubs' }} />

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
          contentContainerStyle={shared.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.primary}
              colors={[theme.colors.primary]}
            />
          }
        >
          {/* My Clubs */}
          {myClubs.length > 0 && (
            <>
              <Text style={[shared.subheading, shared.mb_sm]}>My Clubs</Text>
              {myClubs.map(club => (
                <ClubCard
                  key={club.id}
                  club={club}
                  isOwner={isOwner(club)}
                  isMember={isMember(club)}
                  onPress={() => router.push(`/club/${club.id}` as any)}
                />
              ))}
              <View style={[shared.divider, shared.mb_md]} />
            </>
          )}

          {/* Discover */}
          <Text style={[shared.subheading, shared.mb_sm]}>
            {myClubs.length > 0 ? 'Discover' : 'Clubs'}
          </Text>

          {discoverClubs.length === 0 && myClubs.length === 0 ? (
            <View style={[shared.card, { alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.xl }]}>
              <Ionicons name="people-outline" size={48} color={theme.colors.subtext} />
              <Text style={[shared.caption, { textAlign: 'center', maxWidth: 260 }]}>
                No clubs yet. Clubs are created by admins — check back soon!
              </Text>
            </View>
          ) : discoverClubs.length === 0 ? (
            <View style={[shared.card, { alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.xl }]}>
              <Ionicons name="checkmark-circle-outline" size={36} color={theme.colors.success} />
              <Text style={[shared.caption, { textAlign: 'center' }]}>
                You're in all available clubs!
              </Text>
            </View>
          ) : (
            discoverClubs.map(club => (
              <ClubCard
                key={club.id}
                club={club}
                isOwner={false}
                isMember={false}
                onPress={() => router.push(`/club/${club.id}` as any)}
              />
            ))
          )}
        </ScrollView>
      )}
    </View>
  )
}
