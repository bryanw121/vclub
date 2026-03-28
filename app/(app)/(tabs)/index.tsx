import React, { useState, useRef, useMemo, useCallback, memo, useEffect } from 'react'
import { useFocusEffect } from 'expo-router'
import { Platform, View, ScrollView, FlatList, Text, RefreshControl, TouchableOpacity } from 'react-native'
import { Calendar } from 'react-native-calendars'
import { Ionicons } from '@expo/vector-icons'
import { useEvents } from '../../../hooks/useEvents'
import { EventCard } from '../../../components/EventCard'
import { shared, theme } from '../../../constants'
import { EventWithDetails } from '../../../types'
import { useTabsContext } from '../../../contexts/tabs'

const TODAY = new Date().toISOString().split('T')[0]
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

// Stable reference points computed once at module load
const REF_WEEK  = getWeekStart(new Date())
const REF_MONTH = TODAY.substring(0, 7)
const WEEK_CENTER  = 52   // center index in a 105-item array
const MONTH_CENTER = 24   // center index in a 49-item array
const weekData  = Array.from({ length: 105 }, (_, i) => i)
const monthData = Array.from({ length: 49  }, (_, i) => i)

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

type Props = { refreshTick?: number }

export default function EventsScreen({ refreshTick }: Props) {
  const { events, loading, error, refetch } = useEvents()

  // Mobile: refreshTick is incremented by _layout's useFocusEffect when returning
  // from host/event screens. Skip 0 (initial mount; useEvents already fetches).
  useEffect(() => {
    if (refreshTick && refreshTick > 0) refetch()
  }, [refreshTick])

  // Web wide: EventsScreen IS a proper route, so useFocusEffect fires here.
  // Skip the first call (same reason as above).
  const webFocusCount = useRef(0)
  useFocusEffect(useCallback(() => {
    webFocusCount.current += 1
    if (webFocusCount.current > 1) refetch()
  }, []))

  const [selectedDate, setSelectedDate] = useState<string>(TODAY)
  const [mode, setMode] = useState<'week' | 'month'>('week')
  // Measured from the actual container — accounts for sidebar width automatically
  const [SW, setSW] = useState(0)

  const { pagerBlocked, setTabBarHidden } = useTabsContext()

  // Scroll direction → hide/show tab bar on mobile web
  const lastScrollY = useRef(0)
  const handleScroll = useCallback((e: any) => {
    if (Platform.OS !== 'web') return
    const y: number = e.nativeEvent.contentOffset.y
    const diff = y - lastScrollY.current
    lastScrollY.current = y
    if (y <= 60) { setTabBarHidden(false); return }
    if (Math.abs(diff) > 5) setTabBarHidden(diff > 0)
  }, [setTabBarHidden])

  // Prevent the Pager from claiming swipes that start in the calendar header
  const blockPager   = useCallback(() => { pagerBlocked.current = true  }, [pagerBlocked])
  const unblockPager = useCallback(() => { pagerBlocked.current = false }, [pagerBlocked])

  const weekFlatRef  = useRef<FlatList>(null)
  const calFlatRef   = useRef<FlatList>(null)
  const scrollRef    = useRef<ScrollView>(null)
  const sectionYRef  = useRef<Record<string, number>>({})

  const defaultCalendarHeight = 360
  const [calendarHeight, setCalendarHeight] = useState<number>(defaultCalendarHeight)

  // Track current page via ref (avoids re-renders)
  const curWeekPage  = useRef(WEEK_CENTER)
  const curMonthPage = useRef(MONTH_CENTER)

  // Hide the calendar FlatList until it has scrolled to the correct page.
  // On web, initialScrollIndex is unreliable so without this the user would
  // see a flash of the wrong month/week before the scroll fires.
  const [calReady, setCalReady] = useState(false)

  // Scroll to the correct page whenever SW becomes non-zero or mode changes.
  // When mode changes the active FlatList remounts at position 0 — hide it,
  // scroll to the right page, then reveal.
  useEffect(() => {
    if (SW === 0) return
    setCalReady(false)
    const scroll = () => {
      if (mode === 'week') {
        weekFlatRef.current?.scrollToOffset({ offset: curWeekPage.current * SW, animated: false })
      } else {
        calFlatRef.current?.scrollToOffset({ offset: curMonthPage.current * SW, animated: false })
      }
    }
    const id = requestAnimationFrame(() => {
      scroll()
      setCalReady(true)
      // Scroll once more after reveal in case pagingEnabled's CSS snap corrects it
      requestAnimationFrame(scroll)
    })
    return () => cancelAnimationFrame(id)
  }, [SW, mode])

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

    const weekIdx  = idxForWeek(getWeekStart(new Date(dateStr + 'T00:00:00')))
    const monthIdx = idxForMonth(dateStr.substring(0, 7))

    weekFlatRef.current?.scrollToOffset({ offset: weekIdx * SW, animated: false })
    calFlatRef.current?.scrollToOffset({ offset: monthIdx * SW, animated: false })
    curWeekPage.current  = weekIdx
    curMonthPage.current = monthIdx

    const y = sectionYRef.current[dateStr]
    if (y !== undefined) {
      setTimeout(() => scrollRef.current?.scrollTo({ y, animated: true }), 50)
    }
  }, [sections, SW])

  const goPrevWeek = useCallback(() => {
    const t = curWeekPage.current - 1
    weekFlatRef.current?.scrollToOffset({ offset: t * SW, animated: true })
    curWeekPage.current = t
  }, [SW])

  const goNextWeek = useCallback(() => {
    const t = curWeekPage.current + 1
    weekFlatRef.current?.scrollToOffset({ offset: t * SW, animated: true })
    curWeekPage.current = t
  }, [SW])

  const goPrevMonth = useCallback(() => {
    const t = curMonthPage.current - 1
    calFlatRef.current?.scrollToOffset({ offset: t * SW, animated: true })
    curMonthPage.current = t
  }, [SW])

  const goNextMonth = useCallback(() => {
    const t = curMonthPage.current + 1
    calFlatRef.current?.scrollToOffset({ offset: t * SW, animated: true })
    curMonthPage.current = t
  }, [SW])

  // (removed manual drag tracking; use onMomentumScrollEnd for stable snapping)


  const renderWeekItem = useCallback(({ item: i }: { item: number }) => (
    <View style={{ width: SW, paddingHorizontal: theme.spacing.lg }}>
      <WeekStripContent
        weekDays={getWeekDays(weekForIdx(i))}
        selectedDate={selectedDate}
        markedDates={markedDates}
        onSelectDate={selectDate}
        onPrevWeek={goPrevWeek}
        onNextWeek={goNextWeek}
      />
    </View>
  ), [SW, selectedDate, markedDates, selectDate, goPrevWeek, goNextWeek])

  const renderMonthItem = useCallback(({ item: i }: { item: number }) => (
    <View style={{ width: SW, height: calendarHeight }} onLayout={e => {
      // Measure the visible page and lock to its height to avoid jumps
      if (i === curMonthPage.current) {
        const h = e.nativeEvent.layout.height
        if (h && h !== calendarHeight) setCalendarHeight(h)
      }
    }}>
      <Calendar
        current={`${monthForIdx(i)}-01`}
        markedDates={markedDates}
        markingType="dot"
        onDayPress={day => selectDate(day.dateString)}
        onPressArrowLeft={() => goPrevMonth()}
        onPressArrowRight={() => goNextMonth()}
        theme={{
          backgroundColor: theme.colors.background,
          calendarBackground: theme.colors.background,
          selectedDayBackgroundColor: theme.colors.primary,
          selectedDayTextColor: theme.colors.white,
          todayTextColor: theme.colors.primary,
          dayTextColor: theme.colors.text,
          textDisabledColor: theme.colors.border,
          dotColor: theme.colors.primary,
          selectedDotColor: theme.colors.white,
          arrowColor: theme.colors.primary,
          monthTextColor: theme.colors.text,
          textMonthFontWeight: theme.font.weight.semibold,
          textDayFontSize: theme.font.size.md,
          textMonthFontSize: theme.font.size.lg,
          textDayHeaderFontSize: theme.font.size.sm,
          textDayHeaderFontWeight: theme.font.weight.medium,
        }}
      />
    </View>
  ), [SW, calendarHeight, markedDates, selectDate, goPrevMonth, goNextMonth])


  if (error) {
    return <View style={shared.centered}><Text style={shared.errorText}>{error}</Text></View>
  }

  return (
    <View style={shared.screen} onLayout={e => setSW(e.nativeEvent.layout.width)}>

      {/* ── Fixed header — block Pager while touching calendar ── */}
      <View
        onTouchStart={blockPager}
        onTouchEnd={unblockPager}
        onTouchCancel={unblockPager}
      >
        {/* Week / Month toggle */}
        <View style={{ alignItems: 'flex-end', paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.xs }}>
          <View style={{ flexDirection: 'row', borderRadius: theme.radius.md, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.border }}>
            {(['week', 'month'] as const).map(m => (
              <TouchableOpacity
                key={m}
                onPress={() => setMode(m)}
                style={{ paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs, backgroundColor: mode === m ? theme.colors.primary : 'transparent' }}
              >
                <Text style={{ fontSize: theme.font.size.sm, fontWeight: theme.font.weight.medium, color: mode === m ? theme.colors.white : theme.colors.subtext }}>
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ opacity: calReady ? 1 : 0 }}>
          {SW > 0 && mode === 'week' ? (
            <FlatList
              ref={weekFlatRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              data={weekData}
              keyExtractor={String}
              getItemLayout={(_, i) => ({ length: SW, offset: SW * i, index: i })}
              renderItem={renderWeekItem}
              removeClippedSubviews
              maxToRenderPerBatch={1}
              windowSize={3}
              onMomentumScrollEnd={e => {
                curWeekPage.current = Math.round(e.nativeEvent.contentOffset.x / SW)
              }}
            />
          ) : SW > 0 ? (
            <FlatList
              ref={calFlatRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              data={monthData}
              keyExtractor={String}
              getItemLayout={(_, i) => ({ length: SW, offset: SW * i, index: i })}
              initialNumToRender={1}
              renderItem={renderMonthItem}
              onMomentumScrollEnd={e => {
                curMonthPage.current = Math.round(e.nativeEvent.contentOffset.x / SW)
              }}
              removeClippedSubviews
              maxToRenderPerBatch={1}
              windowSize={3}
            />
          ) : null}
        </View>

        <View style={[shared.divider, { marginHorizontal: theme.spacing.lg }]} />
      </View>

      {/* ── Scrollable events list ── */}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={theme.colors.primary} />}
        onScroll={handleScroll}
        scrollEventThrottle={100}
      >
        {sections.length === 0 && !loading ? (
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
    </View>
  )
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
