import { useState, useRef } from 'react'
import { View, FlatList, Text, RefreshControl, TouchableOpacity, PanResponder, Animated } from 'react-native'
import { Calendar } from 'react-native-calendars'
import { Ionicons } from '@expo/vector-icons'
import { useEvents } from '../../../hooks/useEvents'
import { EventCard } from '../../../components/EventCard'
import { shared, theme } from '../../../constants'
import { EventWithDetails } from '../../../types'

const TODAY = new Date().toISOString().split('T')[0]
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

export default function EventsScreen() {
  const { events, loading, error, refetch } = useEvents()
  const [selectedDate, setSelectedDate] = useState<string>(TODAY)
  const [mode, setMode] = useState<'week' | 'month'>('week')
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date()))

  const markedDates = buildMarkedDates(events, selectedDate)
  const eventsForDay = events.filter(e => e.event_date.startsWith(selectedDate))

  // Absorbs horizontal swipes in the month calendar area so they don't bubble up to the tab Pager.
  // The Calendar's own internal PanResponder fires first (it's more inner), so month-swiping still works.
  // This absorber only claims gestures the Calendar itself didn't want.
  const calendarSwipeAbsorber = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, { dx, dy }) =>
      Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 8,
    onPanResponderTerminationRequest: () => false, // don't yield to the outer Pager once claimed
  })).current

  // Selecting a date also keeps the week strip in sync (e.g. when tapping in month view)
  function selectDate(dateStr: string) {
    setSelectedDate(dateStr)
    setWeekStart(getWeekStart(new Date(dateStr + 'T00:00:00')))
  }

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return d
  })

  if (error) {
    return <View style={shared.centered}><Text style={shared.errorText}>{error}</Text></View>
  }

  return (
    <FlatList
      style={shared.screen}
      data={eventsForDay}
      keyExtractor={item => item.id}
      renderItem={({ item }) => <EventCard event={item} />}
      contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={theme.colors.primary} />}
      ListHeaderComponent={
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

          {mode === 'week'
            ? <WeekStrip
                weekDays={weekDays}
                selectedDate={selectedDate}
                markedDates={markedDates}
                onSelectDate={selectDate}
                onPrevWeek={() => setWeekStart(prev => offsetDate(prev, -7))}
                onNextWeek={() => setWeekStart(prev => offsetDate(prev, 7))}
              />
            : <View {...calendarSwipeAbsorber.panHandlers}>
                <Calendar
                  current={selectedDate}
                  markedDates={markedDates}
                  markingType="dot"
                  enableSwipeMonths
                  onDayPress={day => selectDate(day.dateString)}
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
          }

          {/* Divider + label above event list */}
          <View style={[shared.divider, { marginHorizontal: theme.spacing.lg }]} />
          <View style={[shared.rowBetween, { paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md }]}>
            <Text style={shared.subheading}>{formatDayLabel(selectedDate)}</Text>
            <Text style={shared.caption}>
              {eventsForDay.length === 0 ? 'no events' : `${eventsForDay.length} event${eventsForDay.length > 1 ? 's' : ''}`}
            </Text>
          </View>
        </View>
      }
      ListEmptyComponent={
        !loading ? (
          <Text style={[shared.caption, { paddingHorizontal: theme.spacing.lg }]}>
            nothing planned — tap another day or create an event
          </Text>
        ) : null
      }
    />
  )
}

// ─── Week Strip ───────────────────────────────────────────────────────────────

type WeekStripProps = {
  weekDays: Date[]
  selectedDate: string
  markedDates: Record<string, any>
  onSelectDate: (date: string) => void
  onPrevWeek: () => void
  onNextWeek: () => void
}

function WeekStrip({ weekDays, selectedDate, markedDates, onSelectDate, onPrevWeek, onNextWeek }: WeekStripProps) {
  const monthLabel = weekDays[3].toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const translateX = useRef(new Animated.Value(0)).current
  const callbacks = useRef({ onPrevWeek, onNextWeek })
  callbacks.current = { onPrevWeek, onNextWeek }

  const swipeHandlers = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    // Bubble phase (inner→outer): fires before the outer Pager's handler, so a swipe here
    // claims the gesture and prevents the tab from switching.
    onMoveShouldSetPanResponder: (_, { dx, dy }) =>
      Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 8,
    onPanResponderTerminationRequest: () => false, // don't yield to the outer Pager once claimed
    onPanResponderMove: (_, { dx }) => translateX.setValue(dx),
    onPanResponderRelease: (_, { dx, vx }) => {
      const goNext = dx < -40 || vx < -0.5
      const goPrev = dx > 40 || vx > 0.5

      if (goNext || goPrev) {
        const direction = goNext ? -1 : 1
        // Slide current week off screen, then swap content and slide new week in
        Animated.timing(translateX, { toValue: direction * 400, duration: 150, useNativeDriver: true }).start(() => {
          goNext ? callbacks.current.onNextWeek() : callbacks.current.onPrevWeek()
          translateX.setValue(-direction * 400)
          Animated.timing(translateX, { toValue: 0, duration: 150, useNativeDriver: true }).start()
        })
      } else {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start()
      }
    },
  })).current.panHandlers

  return (
    <View style={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.md, overflow: 'hidden' }}>
      <Text style={[shared.caption, { textAlign: 'center', marginBottom: theme.spacing.sm }]}>{monthLabel}</Text>
      <Animated.View style={{ flexDirection: 'row', alignItems: 'center', transform: [{ translateX }] }} {...swipeHandlers}>
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
      </Animated.View>
    </View>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWeekStart(date: Date): Date {
  const d = new Date(date)
  d.setDate(d.getDate() - d.getDay())
  d.setHours(0, 0, 0, 0)
  return d
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
