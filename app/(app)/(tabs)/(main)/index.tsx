import React, { useState, useRef, useMemo, useCallback, memo, useEffect } from 'react'
import { useFocusEffect } from 'expo-router'
import { Platform, View, ScrollView, Text, RefreshControl, TouchableOpacity, Pressable, PanResponder, Animated, useWindowDimensions, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useEvents } from '../../../../hooks/useEvents'
import { EventCard } from '../../../../components/EventCard'
import { shared, theme } from '../../../../constants'
import { EventWithDetails } from '../../../../types'
import { useTabsContext } from '../../../../contexts/tabs'

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

type DateSection = { date: string; data: EventWithDetails[] }
export default function EventsScreen() {
  const { events, loading, error, refetch } = useEvents()
  const { pagerBlocked, setTabBarHidden, tabBarHeight, eventsRefreshTick } = useTabsContext()
  const { width: windowWidth } = useWindowDimensions()
  const isMobile = Platform.OS !== 'web' || windowWidth < 768

  useEffect(() => {
    if (eventsRefreshTick > 0) refetch(true) // force after creating/editing an event
  }, [eventsRefreshTick, refetch])

  const webFocusCount = useRef(0)
  useFocusEffect(useCallback(() => {
    webFocusCount.current += 1
    if (webFocusCount.current > 1) refetch() // respects 60s staleness window
  }, [refetch]))

  const [selectedDate, setSelectedDate] = useState<string>(TODAY)
  const [mode, setMode] = useState<'week' | 'month'>('week')
  const [notifOpen, setNotifOpen] = useState(false)
  const [curWeekPage, setCurWeekPage] = useState(WEEK_CENTER)
  const [curMonthPage, setCurMonthPage] = useState(MONTH_CENTER)

  const lastScrollY = useRef(0)
  const scrollDelta = useRef(0)
  const calendarAnim = useRef(new Animated.Value(1)).current
  const calendarCollapsed = useRef(false)
  const [calendarNaturalHeight, setCalendarNaturalHeight] = useState(300)

  function collapseCalendar() {
    if (!isMobile || calendarCollapsed.current) return
    calendarCollapsed.current = true
    Animated.timing(calendarAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start()
  }
  function expandCalendar() {
    if (!calendarCollapsed.current) return
    calendarCollapsed.current = false
    Animated.timing(calendarAnim, { toValue: 1, duration: 220, useNativeDriver: false }).start()
  }

  const handleScroll = useCallback((e: any) => {
    const y: number = e.nativeEvent.contentOffset.y
    const contentHeight: number = e.nativeEvent.contentSize.height
    const visibleHeight: number = e.nativeEvent.layoutMeasurement.height
    const diff = y - lastScrollY.current
    lastScrollY.current = y

    // At the bottom — stop reacting to oscillation
    if (y + visibleHeight >= contentHeight - 60) {
      scrollDelta.current = 0
      return
    }

    if (y < 80) {
      scrollDelta.current = 0
      expandCalendar()
      return
    }

    // Reset accumulator when direction reverses
    if ((diff > 0 && scrollDelta.current < 0) || (diff < 0 && scrollDelta.current > 0)) {
      scrollDelta.current = 0
    }
    scrollDelta.current += diff

    if (scrollDelta.current > 50) {
      scrollDelta.current = 0
      collapseCalendar()
    } else if (scrollDelta.current < -50) {
      scrollDelta.current = 0
      expandCalendar()
    }
  }, [isMobile])

  const blockPager   = useCallback(() => { pagerBlocked.current = true  }, [pagerBlocked])
  const unblockPager = useCallback(() => { pagerBlocked.current = false }, [pagerBlocked])

  const scrollRef   = useRef<ScrollView>(null)
  const sectionYRef = useRef<Record<string, number>>({})

  const sections: DateSection[] = useMemo(() => {
    const grouped: Record<string, EventWithDetails[]> = {}
    for (const event of [...events].sort((a, b) => a.event_date.localeCompare(b.event_date))) {
      const date = event.event_date.split('T')[0]
      if (!grouped[date]) grouped[date] = []
      grouped[date].push(event)
    }
    for (const date of Object.keys(grouped)) {
      grouped[date].sort((a, b) => (a.profiles?.username ?? '').localeCompare(b.profiles?.username ?? ''))
    }
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([date, data]) => ({ date, data }))
  }, [events])

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

  if (error) {
    return <View style={shared.centered}><Text style={shared.errorText}>{error}</Text></View>
  }

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
            onPress={() => setNotifOpen(o => !o)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: notifOpen ? theme.colors.primary + '14' : theme.colors.border + '60',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons
              name={notifOpen ? 'notifications' : 'notifications-outline'}
              size={20}
              color={notifOpen ? theme.colors.primary : theme.colors.subtext}
            />
          </TouchableOpacity>
        </View>

        {/* Collapsible calendar area */}
        <Animated.View style={{
          overflow: 'hidden',
          opacity: calendarAnim,
          maxHeight: calendarAnim.interpolate({ inputRange: [0, 1], outputRange: [0, calendarNaturalHeight] }),
        }}>
          <View onLayout={e => setCalendarNaturalHeight(e.nativeEvent.layout.height)}>
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
        </Animated.View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: tabBarHeight + 32 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => refetch(true)} tintColor={theme.colors.primary} />}
        onScroll={handleScroll}
        scrollEventThrottle={100}
      >
        {loading && sections.length === 0 ? (
          <ActivityIndicator
            style={{ marginTop: theme.spacing.xl }}
            color={theme.colors.primary}
          />
        ) : sections.length === 0 ? (
          <Text style={[shared.caption, { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md }]}>
            no upcoming events — create one!
          </Text>
        ) : (
          sections.map(section => (
            <View key={section.date} onLayout={e => { sectionYRef.current[section.date] = e.nativeEvent.layout.y }}>
              <View style={[shared.rowBetween, {
                paddingHorizontal: theme.spacing.lg,
                paddingTop: theme.spacing.md,
                paddingBottom: theme.spacing.xs,
              }]}>
                <Text style={shared.subheading}>{formatDayLabel(section.date)}</Text>
                <Text style={shared.caption}>{section.data.length} event{section.data.length !== 1 ? 's' : ''}</Text>
              </View>
              {section.data.map(item => (
                <View key={item.id} style={{ paddingHorizontal: theme.spacing.lg }}>
                  <EventCard event={item} />
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>

      {/* Notification popup */}
      {notifOpen && (
        <>
          <Pressable
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            onPress={() => setNotifOpen(false)}
          />
          <View style={{
            position: 'absolute',
            top: 48,
            right: theme.spacing.lg,
            width: 260,
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
            <View style={{ paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
              <Text style={{ fontSize: theme.font.size.md, fontWeight: theme.font.weight.semibold, color: theme.colors.text }}>
                Notifications
              </Text>
            </View>
            <View style={{ paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.lg, alignItems: 'center', gap: theme.spacing.sm }}>
              <Ionicons name="notifications-off-outline" size={28} color={theme.colors.subtext} />
              <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.subtext, textAlign: 'center' }}>
                Notifications coming soon
              </Text>
            </View>
          </View>
        </>
      )}
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
        translateX.setValue(-widthRef.current)
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
    <View style={{ paddingBottom: theme.spacing.md }}>
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

  useEffect(() => {
    if (internalNavRef.current) { internalNavRef.current = false; return }
    translateX.stopAnimation()
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

  useEffect(() => {
    if (internalNavRef.current) { internalNavRef.current = false; return }
    translateX.stopAnimation()
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

function formatDayLabel(dateString: string): string {
  if (dateString === TODAY) return 'Today'
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (dateString === tomorrow.toISOString().split('T')[0]) return 'Tomorrow'
  return new Date(dateString + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
