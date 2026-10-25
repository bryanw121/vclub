import { formatVenueDisplay } from '../utils'
import type { GooglePlacePrediction } from '../types'

function prediction(
  main: string,
  secondary: string,
  types?: string[],
): GooglePlacePrediction {
  return {
    place_id: 'p1',
    description: `${main}, ${secondary}`,
    types,
    structured_formatting: { main_text: main, secondary_text: secondary },
  }
}

describe('formatVenueDisplay', () => {
  // Live events store the bare establishment name. Changing that would rewrite
  // how every existing venue reads on the feed, so it must stay untouched.
  it('leaves a named establishment as its main text alone', () => {
    expect(
      formatVenueDisplay(prediction('Gregory Gymnasium', 'Speedway, Austin, TX, USA', ['establishment', 'point_of_interest'])),
    ).toBe('Gregory Gymnasium')
  })

  it('treats a point_of_interest without the establishment tag as a named place', () => {
    expect(
      formatVenueDisplay(prediction('Zilker Park', 'Barton Springs Road, Austin, TX, USA', ['point_of_interest'])),
    ).toBe('Zilker Park')
  })

  // The reason this function exists: dropping `types=establishment` from the
  // proxy lets street addresses through, and a bare street line saved into the
  // single `location` column is ambiguous.
  it('appends the city to a street address', () => {
    expect(
      formatVenueDisplay(prediction('1100 Congress Ave', 'Austin, TX, USA', ['street_address', 'geocode'])),
    ).toBe('1100 Congress Ave, Austin')
  })

  it('appends only the city, never the state or country', () => {
    const out = formatVenueDisplay(prediction('500 E Cesar Chavez St', 'Austin, TX, USA', ['geocode']))
    expect(out).toBe('500 E Cesar Chavez St, Austin')
    expect(out).not.toMatch(/TX|USA/)
  })

  it('does not repeat a locality that main text already ends with', () => {
    expect(
      formatVenueDisplay(prediction('Somewhere In Austin', 'Austin, TX, USA', ['geocode'])),
    ).toBe('Somewhere In Austin')
  })

  it('matches an already-present locality regardless of case', () => {
    expect(
      formatVenueDisplay(prediction('123 Main St, austin', 'Austin, TX, USA', ['geocode'])),
    ).toBe('123 Main St, austin')
  })

  it('falls back to main text when there is no secondary text', () => {
    expect(formatVenueDisplay(prediction('1100 Congress Ave', '', ['geocode']))).toBe('1100 Congress Ave')
  })

  // Google omits `types` on some predictions; the picker must not crash or
  // produce "undefined" in a venue name that gets written to the database.
  it('handles a prediction with no types array', () => {
    expect(formatVenueDisplay(prediction('1100 Congress Ave', 'Austin, TX, USA'))).toBe('1100 Congress Ave, Austin')
  })

  it('returns an empty string rather than a stray comma when main text is blank', () => {
    expect(formatVenueDisplay(prediction('', 'Austin, TX, USA', ['geocode']))).toBe('')
  })

  it('trims surrounding whitespace from both parts', () => {
    expect(
      formatVenueDisplay(prediction('  1100 Congress Ave  ', '  Austin , TX, USA', ['geocode'])),
    ).toBe('1100 Congress Ave, Austin')
  })
})

/**
 * These type arrays are not invented — they are what the deployed places-proxy
 * actually returned when called with these queries after `types=establishment`
 * was removed. The original test set used ['street_address', 'geocode'], a
 * shape Google did not send for the headline example, which is how `premise`
 * got mistaken for a named-building marker and slipped through.
 */
describe('formatVenueDisplay against shapes observed from the live Places API', () => {
  it('appends the city to a geocode+premise address — the most common address shape', () => {
    expect(
      formatVenueDisplay(prediction('1100 Congress Avenue', 'Austin, TX, USA', ['geocode', 'premise'])),
    ).toBe('1100 Congress Avenue, Austin')
  })

  it('appends the city to a geocode+subpremise address', () => {
    expect(
      formatVenueDisplay(prediction('1100 South Congress Avenue', 'Austin, TX, USA', ['geocode', 'subpremise'])),
    ).toBe('1100 South Congress Avenue, Austin')
  })

  it('leaves a real establishment alone even with extra category types', () => {
    expect(
      formatVenueDisplay(prediction('Gregory Gym', 'Speedway, Austin, TX, USA', ['establishment', 'gym', 'health'])),
    ).toBe('Gregory Gym')
  })

  // A building that Google classifies as geocode rather than establishment now
  // picks up the city. That is acceptable and unambiguous — the failure mode
  // being guarded is a bare street number, not a slightly longer venue name.
  it('appends the city to a named building Google classifies as a geocode', () => {
    expect(
      formatVenueDisplay(prediction('Gregory Gymnasium', 'Austin, TX, USA', ['geocode', 'premise'])),
    ).toBe('Gregory Gymnasium, Austin')
  })
})
