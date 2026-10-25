import { Text, TouchableOpacity, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { shared, theme, SURFACE_ACCENTS, SURFACE_LABELS } from '../../constants'
import { Button } from '../Button'
import { CourtGrid } from './CourtGrid'
import { formatFreeSummary, formatRange } from '../../utils/courts'
import { signupHost } from '../../utils/feedItems'
import type { FacilityDay, MinuteRange } from '../../types'

type Props = {
  day: FacilityDay
  span: MinuteRange
  /** Minute of the day in Austin when `day` is today; null otherwise. */
  nowMin: number | null
  onBook: (day: FacilityDay) => void
  onCreateEvent: (day: FacilityDay) => void
}

/**
 * One facility on the chosen day: what it is (surface, city, price, hours),
 * when it is free in one line, the court-by-court hour grid, and the way out
 * to the venue's own booking page. Booking never happens in vteam.
 */
export function FacilityCard({ day, span, nowMin, onBook, onCreateEvent }: Props) {
  const { facility, venue } = day
  const accent = SURFACE_ACCENTS[facility.surface] ?? theme.colors.subtext
  const host = signupHost(venue.calendar)
  const showGrid = day.open && day.covered && day.lanes.length > 0
  const summary = !day.covered
    ? 'No court data for this day yet'
    : !day.open
      ? 'Closed this day'
      : formatFreeSummary(day.freeSummary, nowMin)
  const summaryTone = day.covered && day.open && day.freeSummary.length ? shared.bookSummaryFree : shared.bookSummaryNone

  return (
    <View style={shared.bookFacility} testID={`book-facility-${facility.id}`}>
      <View style={shared.bookFacilityHead}>
        <Text style={shared.bookFacilityName} accessibilityRole="header">{facility.name}</Text>
        <View style={shared.bookMetaRow}>
          <View style={[shared.bookPill, { backgroundColor: accent + '22' }]}>
            <Text style={[shared.bookPillText, { color: accent }]}>{SURFACE_LABELS[facility.surface] ?? facility.surface}</Text>
          </View>
          {day.price ? (
            <View style={[shared.bookPill, shared.bookPillPrice]}>
              <Text style={[shared.bookPillText, shared.bookPillPriceText]}>{day.price}</Text>
            </View>
          ) : null}
          {venue.stale ? (
            <View style={[shared.bookPill, shared.bookPillWarn]}>
              <Text style={[shared.bookPillText, shared.bookPillWarnText]}>Last good copy</Text>
            </View>
          ) : null}
          <Text style={shared.bookMetaText} numberOfLines={1}>
            {[day.city, day.open ? `Open ${formatRange([day.openMin, day.closeMin])}` : null].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>

      <Text style={[shared.bookSummary, summaryTone]} testID="book-facility-summary">{summary}</Text>

      {showGrid ? <CourtGrid day={day} span={span} nowMin={nowMin} /> : null}

      <View style={shared.bookActions}>
        <Button
          label={`Book at ${facility.name}`}
          icon="open-outline"
          size="touch"
          fullWidth={false}
          onPress={() => onBook(day)}
          accessibilityLabel={`Book at ${facility.name} on ${host} (opens in your browser)`}
          testID="book-facility-book"
        />
        <Text style={shared.bookNote}>
          Booking happens on {host}. Some venues only rent to members or teams, or approve requests first.
        </Text>
        <TouchableOpacity
          onPress={() => onCreateEvent(day)}
          accessibilityRole="button"
          style={shared.bookFollowUp}
          testID="book-facility-create-event"
        >
          <Ionicons name="add-circle-outline" size={16} color={theme.colors.primary} />
          <Text style={shared.bookFollowUpText}>Already booked? Create a vteam event for it</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}
