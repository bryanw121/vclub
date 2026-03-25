import { useState, useRef, useMemo, useLayoutEffect } from 'react'
import { View, SectionList, Text, RefreshControl, TouchableOpacity, PanResponder, Animated, Dimensions, Easing } from 'react-native'
import { Calendar } from 'react-native-calendars'
import { Ionicons } from '@expo/vector-icons'
import { useEvents } from '../../../hooks/useEvents'
import { EventCard } from '../../../components/EventCard'
import { shared, theme } from '../../../constants'
import { EventWithDetails } from '../../../types'

const TODAY = new Date().toISOString().split('T')[0]
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const SCREEN_WIDTH = Dimensions.get('window').width
const SLIDE = { duration: 250, easing: Easing.out(Easing.cubic), useNativeDriver: true } as const

function prevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

type DateSection = { date: string; data: EventWithDetails[] }

export default function EventsScreen() {
  const { events, loading, error, refetch } = useEvents()
  const [selectedDate, setSelectedDate] = useState<string>(TODAY)
  const [mode, setMode] = useState<'week' | 'month'>('week')
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date()))
  const [currentMonth, setCurrentMonth] = useState(() => TODAY.substring(0, 7))

  const sectionListRef = useRef<SectionList>(null)

  // These flags are set just before a state update that triggers a panel content change.
  // useLayoutEffect reads them to reset the animated offset synchronously after React
  // commits the new panel content — so the reset and the content update land in the
  // same display frame and the user never sees the stale middle panel.
  const pendingWeekReset = useRef(false)
  const pendingCalendarReset = useRef(false)

  const sections: DateSection[] = useMemo(() => {
    const sorted = [...events].sort((a, b) => a.event_date.localeCompare(b.event_date))
    const grouped: Record<string, EventWithDetails[]> = {}
    for (const event of sorted) {
      const date = event.event_date.split('T')[0]
      if (!grouped[date]) grouped[date] = []
      grouped[date].push(event)
    }
    for (const date of Object.keys(grouped)) {
      grouped[date].sort((a, b) =>
        (a.profiles?.username ?? '').localeCompare(b.profiles?.username ?? '')
      )
    }
    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, data }))
  }, [events])

  const markedDates = buildMarkedDates(events, selectedDate)

  // Animated values — declared before useLayoutEffect so the effects can reference them
  const calendarOffset = useRef(new Animated.Value(-SCREEN_WIDTH)).current
  const weekOffset = useRef(new Animated.Value(-SCREEN_WIDTH)).current

  // After weekStart re-renders with new panel content, reset the offset in the same frame
  useLayoutEffect(() => {
    if (!pendingWeekReset.current) return
    pendingWeekReset.current = false
    weekOffset.setValue(-SCREEN_WIDTH)
  }, [weekStart])

  useLayoutEffect(() => {
    if (!pendingCalendarReset.current) return
    pendingCalendarReset.current = false
    calendarOffset.setValue(-SCREEN_WIDTH)
  }, [currentMonth])

  // ─── Month calendar 3-panel swipe ──────────────────────────────────────────
  // Capture phase beats react-native-calendars' internal bubble-phase handler.
  const calendarSwipeHandlers = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponderCapture: (_, { dx, dy }) =>
      Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 8,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => { calendarOffset.stopAnimation() },
    onPanResponderMove: (_, { dx }) => calendarOffset.setValue(-SCREEN_WIDTH + dx),
    onPanResponderRelease: (_, { dx, vx }) => {
      const goNext = dx < -40 || vx < -0.5
      const goPrev = dx > 40 || vx > 0.5
      if (goNext) {
        Animated.timing(calendarOffset, { ...SLIDE, toValue: -SCREEN_WIDTH * 2 }).start(({ finished }) => {
          if (!finished) return
          pendingCalendarReset.current = true
          setCurrentMonth(prev => nextMonth(prev))
        })
      } else if (goPrev) {
        Animated.timing(calendarOffset, { ...SLIDE, toValue: 0 }).start(({ finished }) => {
          if (!finished) return
          pendingCalendarReset.current = true
          setCurrentMonth(prev => prevMonth(prev))
        })
      } else {
        Animated.timing(calendarOffset, { ...SLIDE, toValue: -SCREEN_WIDTH }).start()
      }
    },
  })).current

  // ─── Week strip 3-panel swipe ───────────────────────────────────────────────
  // Bubble phase — the week strip is inner to the Pager, so it claims first.
  // Capture phase is intentionally avoided here; it interferes with the Pager after swipes.
  const weekSwipeHandlers = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, { dx, dy }) =>
      Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 8,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => { weekOffset.stopAnimation() },
    onPanResponderMove: (_, { dx }) => weekOffset.setValue(-SCREEN_WIDTH + dx),
    onPanResponderRelease: (_, { dx, vx }) => {
      const goNext = dx < -40 || vx < -0.5
      const goPrev = dx > 40 || vx > 0.5
      if (goNext) {
        Animated.timing(weekOffset, { ...SLIDE, toValue: -SCREEN_WIDTH * 2 }).start(({ finished }) => {
          if (!finished) return
          pendingWeekReset.current = true
          setWeekStart(prev => offsetDate(prev, 7))
        })
      } else if (goPrev) {
        Animated.timing(weekOffset, { ...SLIDE, toValue: 0 }).start(({ finished }) => {
          if (!finished) return
          pendingWeekReset.current = true
          setWeekStart(prev => offsetDate(prev, -7))
        })
      } else {
        Animated.timing(weekOffset, { ...SLIDE, toValue: -SCREEN_WIDTH }).start()
      }
    },
  })).current

  function goToPrevWeek() {
    Animated.timing(weekOffset, { ...SLIDE, toValue: 0 }).start(({ finished }) => {
      if (!finished) return
      pendingWeekReset.current = true
      setWeekStart(prev => offsetDate(prev, -7))
    })
  }

  function goToNextWeek() {
    Animated.timing(weekOffset, { ...SLIDE, toValue: -SCREEN_WIDTH * 2 }).start(({ finished }) => {
      if (!finished) return
      pendingWeekReset.current = true
      setWeekStart(prev => offsetDate(prev, 7))
    })
  }

  function selectDate(dateStr: string) {
    setSelectedDate(dateStr)
    setWeekStart(getWeekStart(new Date(dateStr + 'T00:00:00')))
    setCurrentMonth(dateStr.substring(0, 7))

    const sectionIndex = sections.findIndex(s => s.date === dateStr)
    if (sectionIndex >= 0) {
      // Small delay lets the selection state settle before scrolling,
      // which improves reliability on first tap after data load.
      setTimeout(() => {
        try {
          sectionListRef.current?.scrollToLocation({
            sectionIndex,
            itemIndex: 0,
            animated: true,
            viewPosition: 0,
          })
        } catch {}
      }, 50)
    }
  }

  const weekDays = getWeekDays(weekStart)
  const prevWeekDays = getWeekDays(offsetDate(weekStart, -7))
  const nextWeekDays = getWeekDays(offsetDate(weekStart, 7))

  if (error) {
    return <View style={shared.centered}><Text style={shared.errorText}>{error}</Text></View>
  }

  return (
    <View style={shared.screen}>

      {/* ── Fixed header: calendar/week strip stays visible while events scroll ── */}
      <View>
        {/* Week / Month toggle */}
        <View style={{ alignItems: 'flex-end', paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.xs }}>
          <View style={{ flexDirection: 'row', borderRadius: theme.radius.md, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.border }}>
            <TouchableOpacity
              onPress={() => setMode('week')}
              style={{ paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs, backgroundColor: mode === 'week' ? theme.colors.primary : 'transparent' }}
            >
              <Text style={{ fontSize: theme.font.size.sm, fontWeight: theme.font.weight.medium, color: mode === 'week' ? theme.colors.white : theme.colors.subtext }}>
                Week
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setMode('month')}
              style={{ paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs, backgroundColor: mode === 'month' ? theme.colors.primary : 'transparent' }}
            >
              <Text style={{ fontSize: theme.font.size.sm, fontWeight: theme.font.weight.medium, color: mode === 'month' ? theme.colors.white : theme.colors.subtext }}>
                Month
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {mode === 'week' ? (
          <View style={{ overflow: 'hidden' }}>
            <Animated.View
              style={{ flexDirection: 'row', width: SCREEN_WIDTH * 3, transform: [{ translateX: weekOffset }] }}
              {...weekSwipeHandlers.panHandlers}
            >
              {[prevWeekDays, weekDays, nextWeekDays].map((days, idx) => (
                <View key={idx} style={{ width: SCREEN_WIDTH, paddingHorizontal: theme.spacing.lg }}>
                  <WeekStripContent
                    weekDays={days}
                    selectedDate={selectedDate}
                    markedDates={markedDates}
                    onSelectDate={idx === 1 ? selectDate : () => {}}
                    onPrevWeek={goToPrevWeek}
                    onNextWeek={goToNextWeek}
                    showChevrons={idx === 1}
                  />
                </View>
              ))}
            </Animated.View>
          </View>
        ) : (
          <View style={{ overflow: 'hidden' }}>
            <Animated.View
              style={{ flexDirection: 'row', width: SCREEN_WIDTH * 3, transform: [{ translateX: calendarOffset }] }}
              {...calendarSwipeHandlers.panHandlers}
            >
              {[prevMonth(currentMonth), currentMonth, nextMonth(currentMonth)].map((month, i) => (
                <View key={month} style={{ width: SCREEN_WIDTH }}>
                  <Calendar
                    current={`${month}-01`}
                    markedDates={markedDates}
                    markingType="dot"
                    onDayPress={day => selectDate(day.dateString)}
                    onMonthChange={i === 1 ? m => setCurrentMonth(`${m.year}-${String(m.month).padStart(2, '0')}`) : undefined}
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
              ))}
            </Animated.View>
          </View>
        )}

        <View style={[shared.divider, { marginHorizontal: theme.spacing.lg }]} />
      </View>

      {/* ── Scrollable events list — tapping a date scrolls this, not the header ── */}
      <SectionList
        ref={sectionListRef}
        style={{ flex: 1 }}
        sections={sections}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: theme.spacing.lg }}>
            <EventCard event={item} />
          </View>
        )}
        renderSectionHeader={({ section }) => (
          <View style={[shared.rowBetween, {
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing.md,
            paddingBottom: theme.spacing.xs,
            backgroundColor: theme.colors.background,
          }]}>
            <Text style={shared.subheading}>{formatDayLabel(section.date)}</Text>
            <Text style={shared.caption}>
              {section.data.length} event{section.data.length !== 1 ? 's' : ''}
            </Text>
          </View>
        )}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={theme.colors.primary} />}
        ListEmptyComponent={
          !loading ? (
            <Text style={[shared.caption, { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md }]}>
              no upcoming events — create one!
            </Text>
          ) : null
        }
        stickySectionHeadersEnabled
      />
    </View>
  )
}

// ─── Week Strip Content (pure display, no gesture handling) ──────────────────

type WeekStripContentProps = {
  weekDays: Date[]
  selectedDate: string
  markedDates: Record<string, any>
  onSelectDate: (date: string) => void
  onPrevWeek: () => void
  onNextWeek: () => void
  showChevrons: boolean
}

function WeekStripContent({ weekDays, selectedDate, markedDates, onSelectDate, onPrevWeek, onNextWeek, showChevrons }: WeekStripContentProps) {
  const monthLabel = weekDays[3].toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const chevronWidth = 28

  return (
    <View style={{ paddingBottom: theme.spacing.md }}>
      <Text style={[shared.caption, { textAlign: 'center', marginBottom: theme.spacing.sm }]}>{monthLabel}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {showChevrons ? (
          <TouchableOpacity onPress={onPrevWeek} style={{ padding: theme.spacing.xs }}>
            <Ionicons name="chevron-back" size={20} color={theme.colors.primary} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: chevronWidth }} />
        )}

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

        {showChevrons ? (
          <TouchableOpacity onPress={onNextWeek} style={{ padding: theme.spacing.xs }}>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.primary} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: chevronWidth }} />
        )}
      </View>
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
