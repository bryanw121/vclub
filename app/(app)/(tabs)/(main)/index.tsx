import React, { useState, useRef, useMemo, useCallback, memo, useEffect, useLayoutEffect } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import { Platform, View, ScrollView, Text, RefreshControl, TouchableOpacity, Pressable, PanResponder, Animated, useWindowDimensions, ActivityIndicator, Modal, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useMonthEvents } from '../../../../hooks/useMonthEvents'
import { useNotifications } from '../../../../hooks/useNotifications'
import { EventCard } from '../../../../components/EventCard'
import { shared, theme } from '../../../../constants'
import { EventWithDetails, type Notification } from '../../../../types'
import { useTabsContext } from '../../../../contexts/tabs'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const TODAY = new Date().toISOString().split('T')[0]
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

const REF_WEEK  = getWeekStart(new Date())
const REF_MONTH = TODAY.substring(0, 7)
const WEEK_CENTER  = 52
const MONTH_CENTER = 24

function weekForIdx(i: number): Date {
  return offsetDate(REF_WEEK, (i - WEEK_CENTER) * 7)
}
function idxForWeek(date: Date): number {
  return WEEK_CENTER + Math.round((date.getTime() - REF_WEEK.getTime()) / (7 * 86400000))
}
function monthForIdx(i: number): string {
  return addMonths(REF_MONTH, i - MONTH_CENTER)
}
function idxForMonth(month: string): number {
  const [ry, rm] = REF_MONTH.split('-').map(Number)
  const [y,  m ] = month.split('-').map(Number)
  return MONTH_CENTER + (y - ry) * 12 + (m - rm)
}

type FilterChip = 'all' | 'open_play' | 'tournament' | 'not_full'

const FILTER_CHIPS: { id: FilterChip; label: string }[] = [
  { id: 'all',        label: 'All'        },
  { id: 'open_play',  label: 'Open Play'  },
  { id: 'tournament', label: 'Tournament' },
  { id: 'not_full',   label: 'Not Full'   },
]

type DateSection = { date: string; data: EventWithDetails[] }
export default function EventsScreen() {
  const router = useRouter()
  const { events, loading, loadMonth, invalidateMonth, loadedMonths, reachedEnd } = useMonthEvents()
  const {
    notifications: notifItems,
    unreadCount,
    refetch: refetchNotifs,
    markRead,
    markAllRead,
    loading: notifLoading,
  } = useNotifications()
  const { pagerBlocked, setTabBarHidden, tabBarHeight, eventsRefreshTick } = useTabsContext()
  const { width: windowWidth } = useWindowDimensions()
  const isMobile = Platform.OS !== 'web' || windowWidth < 768
  const insets = useSafeAreaInsets()

  const [selectedDate, setSelectedDate] = useState<string>(TODAY)
  const [mode, setMode] = useState<'week' | 'month'>('week')
  const [activeFilter, setActiveFilter] = useState<FilterChip>('all')
  const [notifOpen, setNotifOpen] = useState(false)
  const [curWeekPage, setCurWeekPage] = useState(WEEK_CENTER)
  const [curMonthPage, setCurMonthPage] = useState(MONTH_CENTER)

  // Derive which month(s) the calendar is currently showing
  const visibleMonths = useMemo((): string[] => {
    if (mode === 'month') return [monthForIdx(curMonthPage)]
    // Week mode: a week can straddle two months — load both
    const weekStart = weekForIdx(curWeekPage)
    const weekEnd   = new Date(weekStart.getTime() + 6 * 86_400_000)
    const m1 = weekStart.toISOString().substring(0, 7)
    const m2 = weekEnd.toISOString().substring(0, 7)
    return m1 === m2 ? [m1] : [m1, m2]
  }, [mode, curWeekPage, curMonthPage])

  // Load months as the user navigates the calendar
  useEffect(() => {
    visibleMonths.forEach(m => { void loadMonth(m) })
  }, [visibleMonths, loadMonth])

  // Force-reload visible months after create/edit
  useEffect(() => {
    if (eventsRefreshTick > 0) {
      visibleMonths.forEach(m => {
        invalidateMonth(m)
        void loadMonth(m, true)
      })
    }
  }, [eventsRefreshTick]) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-check staleness when the tab regains focus
  const webFocusCount = useRef(0)
  const visibleMonthsRef = useRef(visibleMonths)
  visibleMonthsRef.current = visibleMonths
  useFocusEffect(useCallback(() => {
    webFocusCount.current += 1
    if (webFocusCount.current > 1) {
      visibleMonthsRef.current.forEach(m => { void loadMonth(m) })
    }
  }, [loadMonth]))

  // The month immediately after the last loaded month — what to fetch on scroll-to-bottom
  const nextScrollMonth = useMemo(() => {
    const last = loadedMonths[loadedMonths.length - 1] ?? TODAY.substring(0, 7)
    const [y, m] = last.split('-').map(Number)
    return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  }, [loadedMonths])

  const handleScrollNearBottom = useCallback(() => {
    if (!loading && !reachedEnd) void loadMonth(nextScrollMonth)
  }, [loading, reachedEnd, loadMonth, nextScrollMonth])

  const blockPager   = useCallback(() => { pagerBlocked.current = true  }, [pagerBlocked])
  const unblockPager = useCallback(() => { pagerBlocked.current = false }, [pagerBlocked])

  const scrollRef   = useRef<ScrollView>(null)
  const sectionYRef = useRef<Record<string, number>>({})

  const sections: DateSection[] = useMemo(() => {
    const filtered = events.filter(event => {
      if (activeFilter === 'all') return true
      const tags = event.event_tags?.map(et => et.tags.name.toLowerCase()) ?? []
      if (activeFilter === 'open_play')  return tags.some(t => t.includes('open play') || t.includes('open-play'))
      if (activeFilter === 'tournament') return tags.some(t => t.includes('tournament'))
      if (activeFilter === 'not_full') {
        if (!event.max_attendees) return true
        const count = event.event_attendees_attending?.[0]
          ? Number(event.event_attendees_attending[0].count)
          : 0
        return count < event.max_attendees
      }
      return true
    })
    const grouped: Record<string, EventWithDetails[]> = {}
    for (const event of [...filtered].sort((a, b) => a.event_date.localeCompare(b.event_date))) {
      const date = event.event_date.split('T')[0]
      if (!grouped[date]) grouped[date] = []
      grouped[date].push(event)
    }
    for (const date of Object.keys(grouped)) {
      grouped[date].sort((a, b) => a.event_date.localeCompare(b.event_date))
    }
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([date, data]) => ({ date, data }))
  }, [events, activeFilter])

  const markedDates = useMemo(() => buildMarkedDates(events, selectedDate), [events, selectedDate])

  const selectDate = useCallback((dateStr: string) => {
    setSelectedDate(dateStr)
    setCurWeekPage(idxForWeek(getWeekStart(new Date(dateStr + 'T00:00:00'))))
    setCurMonthPage(idxForMonth(dateStr.substring(0, 7)))
    const y = sectionYRef.current[dateStr]
    if (y !== undefined) {
      setTimeout(() => scrollRef.current?.scrollTo({ y, animated: true }), 50)
    }
  }, [])

  const goPrevWeek  = useCallback(() => setCurWeekPage(p => p - 1), [])
  const goNextWeek  = useCallback(() => setCurWeekPage(p => p + 1), [])
  const goPrevMonth = useCallback(() => setCurMonthPage(p => p - 1), [])
  const goNextMonth = useCallback(() => setCurMonthPage(p => p + 1), [])

  const openNotifItem = useCallback(
    async (item: Notification) => {
      setNotifOpen(false)
      try {
        if (!item.read_at) await markRead(item.id)
      } catch {
        /* ignore */
      }
      const path = item.data?.deep_link
      if (path) {
        router.push(path as any)
        return
      }
      if (item.data?.event_id) {
        router.push(`/event/${item.data.event_id}` as any)
      }
    },
    [markRead, router],
  )

  const toggleNotifPanel = useCallback(() => {
    setNotifOpen(o => {
      if (!o) void refetchNotifs(true)
      return !o
    })
  }, [refetchNotifs])

  return (
    <View style={shared.screen}>
      <View
        onTouchStart={blockPager}
        onTouchEnd={unblockPager}
        onTouchCancel={unblockPager}
      >
        {/* Header: title + bell */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md, paddingBottom: theme.spacing.sm }}>
          <Text style={{ fontSize: theme.font.size.xl, fontWeight: theme.font.weight.bold, color: theme.colors.text }}>
            Events
          </Text>
          <TouchableOpacity
            onPress={toggleNotifPanel}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            accessibilityHint={unreadCount > 0 ? `${unreadCount} unread` : undefined}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: notifOpen ? theme.colors.primary + '14' : theme.colors.border + '60',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View>
              <Ionicons
                name={notifOpen ? 'notifications' : 'notifications-outline'}
                size={20}
                color={notifOpen ? theme.colors.primary : theme.colors.subtext}
              />
              {unreadCount > 0 ? (
                <View
                  style={{
                    position: 'absolute',
                    top: -2,
                    right: -4,
                    minWidth: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: theme.colors.error,
                  }}
                />
              ) : null}
            </View>
          </TouchableOpacity>
        </View>

        {/* Calendar + week/month strip — fixed below header; list scrolls independently */}
        <View>
          {/* Week / Month toggle — desktop only */}
          {!isMobile && (
            <View style={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.sm }}>
              <View style={{ flexDirection: 'row', alignSelf: 'flex-start', borderRadius: theme.radius.md, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.card }}>
                {(['week', 'month'] as const).map(m => (
                  <TouchableOpacity
                    key={m}
                    onPress={() => setMode(m)}
                    style={{ paddingHorizontal: theme.spacing.md, paddingVertical: 6, backgroundColor: mode === m ? theme.colors.primary : 'transparent' }}
                  >
                    <Text style={{ fontSize: theme.font.size.sm, fontWeight: theme.font.weight.medium, color: mode === m ? theme.colors.white : theme.colors.subtext }}>
                      {m.charAt(0).toUpperCase() + m.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {(!isMobile && mode === 'month') ? (
            <MonthPager
              curMonthPage={curMonthPage}
              selectedDate={selectedDate}
              markedDates={markedDates}
              onSelectDate={selectDate}
              onPrevMonth={goPrevMonth}
              onNextMonth={goNextMonth}
            />
          ) : (
            <WeekPager
              curWeekPage={curWeekPage}
              selectedDate={selectedDate}
              markedDates={markedDates}
              onSelectDate={selectDate}
              onPrevWeek={goPrevWeek}
              onNextWeek={goNextWeek}
            />
          )}
          <View style={[shared.divider, { marginHorizontal: theme.spacing.lg, marginBottom: 0 }]} />
        </View>

        {/* Filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.xs, paddingBottom: theme.spacing.sm, gap: theme.spacing.xs }}
          style={{ flexGrow: 0 }}
        >
          {FILTER_CHIPS.map(chip => {
            const active = activeFilter === chip.id
            return (
              <TouchableOpacity
                key={chip.id}
                onPress={() => setActiveFilter(chip.id)}
                style={[feedStyles.chip, active && feedStyles.chipActive]}
              >
                <Text style={[feedStyles.chipLabel, active && feedStyles.chipLabelActive]}>
                  {chip.label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: tabBarHeight + 32 }}
        scrollEventThrottle={200}
        onScroll={({ nativeEvent: { contentOffset, contentSize, layoutMeasurement } }) => {
          if (contentSize.height - contentOffset.y - layoutMeasurement.height < 400) {
            handleScrollNearBottom()
          }
        }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => visibleMonths.forEach(m => { invalidateMonth(m); void loadMonth(m, true) })} tintColor={theme.colors.primary} />}
      >
        {loading && sections.length === 0 ? (
          <ActivityIndicator
            style={{ marginTop: theme.spacing.xl }}
            color={theme.colors.primary}
          />
        ) : sections.length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: theme.spacing.xxl, gap: theme.spacing.sm }}>
            <Ionicons name="calendar-outline" size={36} color={theme.colors.border} />
            <Text style={shared.caption}>
              {activeFilter === 'all' ? 'No upcoming events — create one!' : 'No events match this filter'}
            </Text>
            {activeFilter !== 'all' && (
              <TouchableOpacity onPress={() => setActiveFilter('all')}>
                <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.primary, fontWeight: theme.font.weight.medium }}>
                  Clear filter
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          sections.map(section => (
            <View key={section.date} onLayout={e => { sectionYRef.current[section.date] = e.nativeEvent.layout.y }}>
              <View style={feedStyles.sectionHeader}>
                <Text style={feedStyles.sectionDate}>{formatDayLabel(section.date)}</Text>
                <View style={feedStyles.sectionCount}>
                  <Text style={feedStyles.sectionCountText}>{section.data.length}</Text>
                </View>
              </View>
              <View style={{ paddingHorizontal: theme.spacing.lg }}>
                {section.data.map(item => (
                  <EventCard key={item.id} event={item} />
                ))}
              </View>
            </View>
          ))
        )}
        {/* Bottom load-more spinner — visible while fetching the next month on scroll */}
        {loading && sections.length > 0 && (
          <ActivityIndicator
            style={{ marginVertical: theme.spacing.lg }}
            color={theme.colors.primary}
          />
        )}
      </ScrollView>

      {/* Notification popup */}
      <Modal
        visible={notifOpen}
        transparent
        animationType="none"
        onRequestClose={() => setNotifOpen(false)}
        statusBarTranslucent
      >
        <Pressable
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          onPress={() => setNotifOpen(false)}
        />
        <View
          style={{
            position: 'absolute',
            top: insets.top + 48,
            right: theme.spacing.lg,
            width: Math.min(320, windowWidth - theme.spacing.lg * 2),
            maxHeight: 400,
            backgroundColor: theme.colors.card,
            borderRadius: theme.radius.md,
            borderWidth: 1,
            borderColor: theme.colors.border,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.10,
            shadowRadius: 8,
            elevation: 6,
            overflow: 'hidden',
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
              <Text style={{ fontSize: theme.font.size.md, fontWeight: theme.font.weight.semibold, color: theme.colors.text }}>
                Notifications
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
                {unreadCount > 0 && (
                  <TouchableOpacity onPress={() => void markAllRead()} hitSlop={8}>
                    <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.subtext, fontWeight: theme.font.weight.medium }}>Read all</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => { setNotifOpen(false); router.push('/notifications' as any) }} hitSlop={8}>
                  <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.primary, fontWeight: theme.font.weight.semibold }}>See all</Text>
                </TouchableOpacity>
              </View>
            </View>
            {/* On web, use native CSS overflow scroll to bypass RN Web's JS-based ScrollView
                responder system, which conflicts with the Modal backdrop. On native, ScrollView
                uses the platform's native scroll view and works fine. */}
            {Platform.OS === 'web' ? (
              <View style={{ maxHeight: 320, overflow: 'scroll' } as any}>
                {notifLoading && notifItems.length === 0 ? (
                  <View style={{ padding: theme.spacing.lg, alignItems: 'center' }}>
                    <ActivityIndicator color={theme.colors.primary} />
                  </View>
                ) : notifItems.length === 0 ? (
                  <View style={{ paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.lg, alignItems: 'center', gap: theme.spacing.sm }}>
                    <Ionicons name="notifications-off-outline" size={28} color={theme.colors.subtext} />
                    <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.subtext, textAlign: 'center' }}>
                      You're all caught up
                    </Text>
                  </View>
                ) : (
                  notifItems.slice(0, 15).map(item => (
                    <TouchableOpacity
                      key={item.id}
                      onPress={() => void openNotifItem(item)}
                      style={{
                        paddingHorizontal: theme.spacing.md,
                        paddingVertical: theme.spacing.sm,
                        borderBottomWidth: 1,
                        borderBottomColor: theme.colors.border,
                        opacity: item.read_at ? 0.65 : 1,
                      }}
                    >
                      <Text style={{ fontSize: theme.font.size.sm, fontWeight: theme.font.weight.semibold, color: theme.colors.text }} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={{ fontSize: theme.font.size.xs, color: theme.colors.subtext, marginTop: 2 }} numberOfLines={2}>
                        {item.body}
                      </Text>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                {notifLoading && notifItems.length === 0 ? (
                  <View style={{ padding: theme.spacing.lg, alignItems: 'center' }}>
                    <ActivityIndicator color={theme.colors.primary} />
                  </View>
                ) : notifItems.length === 0 ? (
                  <View style={{ paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.lg, alignItems: 'center', gap: theme.spacing.sm }}>
                    <Ionicons name="notifications-off-outline" size={28} color={theme.colors.subtext} />
                    <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.subtext, textAlign: 'center' }}>
                      You're all caught up
                    </Text>
                  </View>
                ) : (
                  notifItems.slice(0, 15).map(item => (
                    <TouchableOpacity
                      key={item.id}
                      onPress={() => void openNotifItem(item)}
                      style={{
                        paddingHorizontal: theme.spacing.md,
                        paddingVertical: theme.spacing.sm,
                        borderBottomWidth: 1,
                        borderBottomColor: theme.colors.border,
                        opacity: item.read_at ? 0.65 : 1,
                      }}
                    >
                      <Text style={{ fontSize: theme.font.size.sm, fontWeight: theme.font.weight.semibold, color: theme.colors.text }} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={{ fontSize: theme.font.size.xs, color: theme.colors.subtext, marginTop: 2 }} numberOfLines={2}>
                        {item.body}
                      </Text>
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            )}
          </View>
      </Modal>
    </View>
  )
}

// ─── Shared pager logic ───────────────────────────────────────────────────────
//
// useNativeDriver: false so stopAnimation() fires its callback synchronously.
// This guarantees interrupted animations commit their state before the next
// gesture starts, enabling rapid swiping without page-state divergence.

function usePager(
  widthRef: React.MutableRefObject<number>,
  translateX: Animated.Value,
  onPrevRef: React.MutableRefObject<() => void>,
  onNextRef: React.MutableRefObject<() => void>,
) {
  const internalNavRef = useRef(false)

  function snap(toValue: number, onComplete?: () => void) {
    translateX.stopAnimation()
    Animated.spring(translateX, { toValue, useNativeDriver: false, tension: 60, friction: 11 })
      .start(() => {
        if (onComplete) {
          internalNavRef.current = true
          onComplete()
        }
      })
  }

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, { dx, dy }) =>
      Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 8,
    onPanResponderGrant: () => { translateX.stopAnimation() },
    onPanResponderMove: (_, { dx }) => {
      translateX.setValue(-widthRef.current + dx)
    },
    onPanResponderRelease: (_, { dx, vx }) => {
      const w = widthRef.current
      if      (dx < -w * 0.3 || vx < -0.5) snap(-w * 2, () => onNextRef.current())
      else if (dx >  w * 0.3 || vx >  0.5) snap(0,      () => onPrevRef.current())
      else                                   snap(-w)
    },
    onPanResponderTerminate: () => {
      translateX.stopAnimation()
      Animated.spring(translateX, { toValue: -widthRef.current, useNativeDriver: false, tension: 60, friction: 11 }).start()
    },
  })).current

  const snapToNext = useCallback(() => snap(-widthRef.current * 2, () => onNextRef.current()), [])
  const snapToPrev = useCallback(() => snap(0,                      () => onPrevRef.current()), [])

  return { panResponder, snapToNext, snapToPrev, internalNavRef }
}

// ─── Week Strip Content ───────────────────────────────────────────────────────

type WeekStripContentProps = {
  weekDays: Date[]
  selectedDate: string
  markedDates: Record<string, any>
  onSelectDate: (date: string) => void
  onPrevWeek: () => void
  onNextWeek: () => void
}

const WeekStripContent = memo(function WeekStripContent({ weekDays, selectedDate, markedDates, onSelectDate, onPrevWeek, onNextWeek }: WeekStripContentProps) {
  const monthLabel = weekDays[3].toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <View style={{ paddingBottom: theme.spacing.xs }}>
      <Text style={[shared.caption, { textAlign: 'center', marginBottom: theme.spacing.sm }]}>{monthLabel}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TouchableOpacity onPress={onPrevWeek} style={{ padding: theme.spacing.xs }}>
          <Ionicons name="chevron-back" size={20} color={theme.colors.primary} />
        </TouchableOpacity>
        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-around' }}>
          {weekDays.map(day => {
            const dateStr = day.toISOString().split('T')[0]
            const isSelected = dateStr === selectedDate
            const isToday = dateStr === TODAY
            const hasEvent = !!markedDates[dateStr]?.marked
            return (
              <TouchableOpacity key={dateStr} onPress={() => onSelectDate(dateStr)} style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: theme.font.size.xs, color: theme.colors.subtext, fontWeight: theme.font.weight.medium, marginBottom: 4 }}>
                  {DAY_LABELS[day.getDay()]}
                </Text>
                <View style={{
                  width: 34, height: 34, borderRadius: 17,
                  backgroundColor: isSelected ? theme.colors.primary : 'transparent',
                  borderWidth: isToday && !isSelected ? 1 : 0,
                  borderColor: theme.colors.primary,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{
                    fontSize: theme.font.size.md,
                    fontWeight: isSelected || isToday ? theme.font.weight.semibold : theme.font.weight.regular,
                    color: isSelected ? theme.colors.white : isToday ? theme.colors.primary : theme.colors.text,
                  }}>
                    {day.getDate()}
                  </Text>
                </View>
                <View style={{ height: 5, marginTop: 3, alignItems: 'center', justifyContent: 'center' }}>
                  {hasEvent && (
                    <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: theme.colors.primary, opacity: isSelected ? 0.4 : 1 }} />
                  )}
                </View>
              </TouchableOpacity>
            )
          })}
        </View>
        <TouchableOpacity onPress={onNextWeek} style={{ padding: theme.spacing.xs }}>
          <Ionicons name="chevron-forward" size={20} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>
    </View>
  )
})

// ─── Month Grid Content ───────────────────────────────────────────────────────
// Custom month calendar built from plain Views — no third-party library,
// no remounting, no loading flash. Same interaction model as WeekStripContent.

type MonthGridContentProps = {
  month: string  // "YYYY-MM"
  selectedDate: string
  markedDates: Record<string, any>
  onSelectDate: (date: string) => void
  onPrevMonth: () => void
  onNextMonth: () => void
}

const MonthGridContent = memo(function MonthGridContent({ month, selectedDate, markedDates, onSelectDate, onPrevMonth, onNextMonth }: MonthGridContentProps) {
  const [year, mon] = month.split('-').map(Number)
  const monthLabel  = new Date(year, mon - 1, 15).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const startOffset = new Date(year, mon - 1, 1).getDay()
  const daysInMonth = new Date(year, mon, 0).getDate()

  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length < 42) cells.push(null)
  const rows: (number | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))

  return (
    <View style={{ backgroundColor: theme.colors.background, paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.sm }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing.sm }}>
        <TouchableOpacity onPress={onPrevMonth} style={{ padding: theme.spacing.xs }}>
          <Ionicons name="chevron-back" size={20} color={theme.colors.primary} />
        </TouchableOpacity>
        <Text style={{ flex: 1, textAlign: 'center', fontSize: theme.font.size.lg, fontWeight: theme.font.weight.semibold, color: theme.colors.text }}>
          {monthLabel}
        </Text>
        <TouchableOpacity onPress={onNextMonth} style={{ padding: theme.spacing.xs }}>
          <Ionicons name="chevron-forward" size={20} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>
      {/* Day-of-week labels */}
      <View style={{ flexDirection: 'row', marginBottom: 2 }}>
        {DAY_LABELS.map(d => (
          <Text key={d} style={{ flex: 1, textAlign: 'center', fontSize: theme.font.size.sm, fontWeight: theme.font.weight.medium, color: theme.colors.subtext }}>
            {d}
          </Text>
        ))}
      </View>
      {/* Day grid */}
      {rows.map((row, ri) => (
        <View key={ri} style={{ flexDirection: 'row' }}>
          {row.map((day, di) => {
            if (day === null) return <View key={di} style={{ flex: 1, height: 44 }} />
            const dateStr   = `${month}-${String(day).padStart(2, '0')}`
            const isSelected = dateStr === selectedDate
            const isToday    = dateStr === TODAY
            const hasEvent   = !!markedDates[dateStr]?.marked
            return (
              <TouchableOpacity
                key={di}
                onPress={() => onSelectDate(dateStr)}
                style={{ flex: 1, alignItems: 'center', paddingVertical: 3 }}
              >
                <View style={{
                  width: 34, height: 34, borderRadius: 17,
                  backgroundColor: isSelected ? theme.colors.primary : 'transparent',
                  borderWidth: isToday && !isSelected ? 1 : 0,
                  borderColor: theme.colors.primary,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{
                    fontSize: theme.font.size.md,
                    fontWeight: isSelected || isToday ? theme.font.weight.semibold : theme.font.weight.regular,
                    color: isSelected ? theme.colors.white : isToday ? theme.colors.primary : theme.colors.text,
                  }}>
                    {day}
                  </Text>
                </View>
                <View style={{ height: 5, marginTop: 1, alignItems: 'center', justifyContent: 'center' }}>
                  {hasEvent && (
                    <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: isSelected ? theme.colors.white : theme.colors.primary, opacity: isSelected ? 0.6 : 1 }} />
                  )}
                </View>
              </TouchableOpacity>
            )
          })}
        </View>
      ))}
    </View>
  )
})

// ─── Week Pager ──────────────────────────────────────────────────────────────

type WeekPagerProps = {
  curWeekPage: number
  selectedDate: string
  markedDates: Record<string, any>
  onSelectDate: (date: string) => void
  onPrevWeek: () => void
  onNextWeek: () => void
}

function WeekPager({ curWeekPage, selectedDate, markedDates, onSelectDate, onPrevWeek, onNextWeek }: WeekPagerProps) {
  const [width, setWidth] = useState(0)
  const widthRef = useRef(0)
  const translateX = useRef(new Animated.Value(0)).current
  const onPrevRef = useRef(onPrevWeek)
  const onNextRef = useRef(onNextWeek)
  onPrevRef.current = onPrevWeek
  onNextRef.current = onNextWeek

  const { panResponder, snapToPrev, snapToNext, internalNavRef } = usePager(widthRef, translateX, onPrevRef, onNextRef)

  useLayoutEffect(() => {
    const fromSwipe = internalNavRef.current
    internalNavRef.current = false
    if (!fromSwipe) translateX.stopAnimation()
    if (widthRef.current > 0) translateX.setValue(-widthRef.current)
  }, [curWeekPage])

  return (
    <View
      style={{ overflow: 'hidden' }}
      onLayout={e => {
        const w = e.nativeEvent.layout.width
        widthRef.current = w
        if (w !== width) { setWidth(w); translateX.setValue(-w) }
      }}
      {...panResponder.panHandlers}
    >
      {width > 0 && (
        <Animated.View style={{ flexDirection: 'row', width: width * 3, transform: [{ translateX }] }}>
          {([-1, 0, 1] as const).map(offset => (
            <View key={offset} style={{ width, paddingHorizontal: theme.spacing.lg }}>
              <WeekStripContent
                weekDays={getWeekDays(weekForIdx(curWeekPage + offset))}
                selectedDate={selectedDate}
                markedDates={markedDates}
                onSelectDate={onSelectDate}
                onPrevWeek={snapToPrev}
                onNextWeek={snapToNext}
              />
            </View>
          ))}
        </Animated.View>
      )}
    </View>
  )
}

// ─── Month Pager ─────────────────────────────────────────────────────────────

type MonthPagerProps = {
  curMonthPage: number
  selectedDate: string
  markedDates: Record<string, any>
  onSelectDate: (date: string) => void
  onPrevMonth: () => void
  onNextMonth: () => void
}

function MonthPager({ curMonthPage, selectedDate, markedDates, onSelectDate, onPrevMonth, onNextMonth }: MonthPagerProps) {
  const [width, setWidth] = useState(0)
  const widthRef = useRef(0)
  const translateX = useRef(new Animated.Value(0)).current
  const onPrevRef = useRef(onPrevMonth)
  const onNextRef = useRef(onNextMonth)
  onPrevRef.current = onPrevMonth
  onNextRef.current = onNextMonth

  const { panResponder, snapToPrev, snapToNext, internalNavRef } = usePager(widthRef, translateX, onPrevRef, onNextRef)

  useLayoutEffect(() => {
    const fromSwipe = internalNavRef.current
    internalNavRef.current = false
    if (!fromSwipe) translateX.stopAnimation()
    if (widthRef.current > 0) translateX.setValue(-widthRef.current)
  }, [curMonthPage])

  return (
    <View
      style={{ overflow: 'hidden' }}
      onLayout={e => {
        const w = e.nativeEvent.layout.width
        widthRef.current = w
        if (w !== width) { setWidth(w); translateX.setValue(-w) }
      }}
      {...panResponder.panHandlers}
    >
      {width > 0 && (
        <Animated.View style={{ flexDirection: 'row', width: width * 3, transform: [{ translateX }] }}>
          {([-1, 0, 1] as const).map(offset => (
            <View key={offset} style={{ width }}>
              <MonthGridContent
                month={monthForIdx(curMonthPage + offset)}
                selectedDate={selectedDate}
                markedDates={markedDates}
                onSelectDate={onSelectDate}
                onPrevMonth={snapToPrev}
                onNextMonth={snapToNext}
              />
            </View>
          ))}
        </Animated.View>
      )}
    </View>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getWeekStart(date: Date): Date {
  const d = new Date(date)
  d.setDate(d.getDate() - d.getDay())
  d.setHours(0, 0, 0, 0)
  return d
}

function getWeekDays(start: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

function offsetDate(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const total = (m - 1) + n
  const newY = y + Math.floor(total / 12)
  const newM = ((total % 12) + 12) % 12 + 1
  return `${newY}-${String(newM).padStart(2, '0')}`
}

function buildMarkedDates(events: EventWithDetails[], selectedDate: string) {
  const marks: Record<string, { marked?: boolean; dotColor?: string; selected?: boolean; selectedColor?: string; selectedDotColor?: string }> = {}
  for (const event of events) {
    const day = event.event_date.split('T')[0]
    marks[day] = { marked: true, dotColor: theme.colors.primary }
  }
  marks[selectedDate] = {
    ...marks[selectedDate],
    selected: true,
    selectedColor: theme.colors.primary,
    selectedDotColor: theme.colors.white,
  }
  return marks
}

const feedStyles = StyleSheet.create({
  chip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
  },
  chipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  chipLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: theme.font.weight.medium,
    color: theme.colors.subtext,
  },
  chipLabelActive: {
    color: theme.colors.white,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.xs,
  },
  sectionDate: {
    fontSize: theme.font.size.md,
    fontWeight: theme.font.weight.bold,
    color: theme.colors.text,
    letterSpacing: -0.2,
  },
  sectionCount: {
    backgroundColor: theme.colors.primary + '18',
    borderRadius: theme.radius.full,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  sectionCountText: {
    fontSize: 10,
    fontWeight: theme.font.weight.semibold,
    color: theme.colors.primary,
  },
})

function formatDayLabel(dateString: string): string {
  if (dateString === TODAY) return 'Today'
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (dateString === tomorrow.toISOString().split('T')[0]) return 'Tomorrow'
  return new Date(dateString + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
