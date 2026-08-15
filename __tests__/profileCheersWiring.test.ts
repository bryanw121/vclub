import fs from 'fs'
import path from 'path'

const profile = fs.readFileSync(
  path.join(__dirname, '../app/(app)/(tabs)/(main)/profile/index.tsx'),
  'utf8',
)

describe('own profile wires its Cheers stat to the received count', () => {
  it('requests an exact, head-only count for the signed-in receiver', () => {
    expect(profile).toMatch(
      /from\('cheers'\)\.select\('id', \{ count: 'exact', head: true \}\)\.eq\('receiver_id', userId\)/,
    )
  })

  it('applies the result through failure-safe count resolution', () => {
    expect(profile).toMatch(/setTotalCheers\(previous => resolveReceivedCheersCount\(cheersRes, previous\)\)/)
  })

  it('renders the live count in a stable browser-test target', () => {
    expect(profile).toMatch(/testID=\{s\.l === 'Cheers' \? 'profile-cheers-count'/)
    expect(profile).toMatch(/\{ n: totalCheers, l: 'Cheers' \}/)
  })

  it('refreshes profile data and badges together', () => {
    expect(profile).toMatch(/Promise\.all\(\[fetchProfile\(\), fetchBadges\(true\)\]\)/)
  })
})
