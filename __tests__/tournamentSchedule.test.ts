import { generateSchedule, poolLayout, roundRobinRounds, shuffle } from '../lib/tournamentSchedule'
import type { ScheduleConfig, ScheduleInput } from '../types'

const START = new Date('2026-11-01T15:00:00.000Z')
const BASE_CONFIG: ScheduleConfig = { numCourts: 1, matchDuration: 45, breakDuration: 10, gamesPerTeam: null }

const ids = (n: number) => Array.from({ length: n }, (_, i) => `t${i + 1}`)

/** Small deterministic PRNG so pool dealing is reproducible. */
function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

function input(over: Partial<ScheduleInput> & { teamIds: string[] }): ScheduleInput {
  return { format: 'round_robin', startDate: START, config: BASE_CONFIG, random: seeded(7), ...over }
}

function gamesPlayed(matches: { team_a_id: string; team_b_id: string }[]) {
  const counts = new Map<string, number>()
  for (const m of matches) {
    counts.set(m.team_a_id, (counts.get(m.team_a_id) ?? 0) + 1)
    counts.set(m.team_b_id, (counts.get(m.team_b_id) ?? 0) + 1)
  }
  return counts
}

const pairKey = (a: string, b: string) => [a, b].sort().join('|')

describe('poolLayout', () => {
  it.each([
    [2, 1, 2],
    [4, 1, 4],
    [5, 1, 5],
    [6, 2, 3],
    [8, 2, 4],
    [9, 2, 5],
    [10, 3, 4],
    [12, 3, 4],
  ])('%i teams -> %i pool(s) of up to %i', (n, numPools, teamsPerPool) => {
    expect(poolLayout(n)).toEqual({ numPools, teamsPerPool })
  })

  it('has no pools for no teams', () => {
    expect(poolLayout(0)).toEqual({ numPools: 0, teamsPerPool: 0 })
  })
})

describe('shuffle', () => {
  it('returns a permutation without touching the input', () => {
    const src = ids(8)
    const out = shuffle(src, seeded(3))
    expect([...out].sort()).toEqual([...src].sort())
    expect(src).toEqual(ids(8))
  })
})

describe('roundRobinRounds', () => {
  it('has no rounds for fewer than two teams', () => {
    expect(roundRobinRounds([])).toEqual([])
    expect(roundRobinRounds(['solo'])).toEqual([])
  })

  it('even field: n-1 rounds, everyone plays every round, every pair meets once', () => {
    const rounds = roundRobinRounds(ids(6))
    expect(rounds).toHaveLength(5)
    const seen = new Set<string>()
    for (const round of rounds) {
      expect(round).toHaveLength(3)
      const inRound = round.flat()
      expect(new Set(inRound).size).toBe(6)
      for (const [a, b] of round) {
        const k = pairKey(a, b)
        expect(seen.has(k)).toBe(false)
        seen.add(k)
      }
    }
    expect(seen.size).toBe(15)
  })

  it('odd field: n rounds, exactly one bye per team, every pair meets once', () => {
    const teams = ids(5)
    const rounds = roundRobinRounds(teams)
    expect(rounds).toHaveLength(5)
    const byes = new Map<string, number>()
    const seen = new Set<string>()
    for (const round of rounds) {
      expect(round).toHaveLength(2)
      const playing = new Set(round.flat())
      expect(playing.size).toBe(4)
      teams.filter(t => !playing.has(t)).forEach(t => byes.set(t, (byes.get(t) ?? 0) + 1))
      round.forEach(([a, b]) => seen.add(pairKey(a, b)))
    }
    expect(seen.size).toBe(10)
    teams.forEach(t => expect(byes.get(t)).toBe(1))
  })

  it('three teams: three one-match rounds', () => {
    const rounds = roundRobinRounds(ids(3))
    expect(rounds.map(r => r.length)).toEqual([1, 1, 1])
  })
})

describe('generateSchedule', () => {
  it('returns nothing for fewer than two teams', () => {
    expect(generateSchedule(input({ teamIds: ['a'] }))).toEqual({ pools: [], matches: [] })
    expect(generateSchedule(input({ teamIds: [] }))).toEqual({ pools: [], matches: [] })
  })

  describe('round robin (no pools)', () => {
    it('schedules every pair once, one slot per match on one court', () => {
      const { pools, matches } = generateSchedule(input({ teamIds: ids(4) }))
      expect(pools).toEqual([])
      expect(matches).toHaveLength(6)
      matches.forEach(m => {
        expect(m.stage).toBe('round_robin')
        expect(m.pool_key).toBeNull()
        expect(m.court).toBe('Main Court')
        expect(m.status).toBe('scheduled')
      })
      expect(new Set(matches.map(m => pairKey(m.team_a_id, m.team_b_id))).size).toBe(6)
      // slot = 45 min match + 10 min break
      const offsets = matches.map(m => (new Date(m.scheduled_at).getTime() - START.getTime()) / 60_000)
      expect(offsets).toEqual([0, 55, 110, 165, 220, 275])
    })

    it('odd team count: nobody plays twice at once, byes spread evenly', () => {
      const { matches } = generateSchedule(input({ teamIds: ids(5), config: { ...BASE_CONFIG, numCourts: 2 } }))
      expect(matches).toHaveLength(10)
      const games = gamesPlayed(matches)
      ids(5).forEach(t => expect(games.get(t)).toBe(4))
      assertNoDoubleBooking(matches)
    })

    it('multiple courts: parallel matches in one slot never share a team or a court', () => {
      const { matches } = generateSchedule(input({ teamIds: ids(8), config: { ...BASE_CONFIG, numCourts: 3 } }))
      expect(matches).toHaveLength(28)
      assertNoDoubleBooking(matches)
      const courts = new Set(matches.map(m => m.court))
      expect(courts).toEqual(new Set(['Court 1', 'Court 2', 'Court 3']))
      // 4 matches per round on 3 courts = 2 slots per round
      const slots = new Set(matches.map(m => m.scheduled_at))
      expect(slots.size).toBe(7 * 2)
    })

    it('sorting by (round, match_number) is chronological', () => {
      const { matches } = generateSchedule(input({ teamIds: ids(7), config: { ...BASE_CONFIG, numCourts: 2 } }))
      const sorted = [...matches].sort((a, b) => a.round - b.round || a.match_number - b.match_number)
      const times = sorted.map(m => new Date(m.scheduled_at).getTime())
      expect(times).toEqual([...times].sort((a, b) => a - b))
    })

    it('treats a nonsensical court count as one court', () => {
      const { matches } = generateSchedule(input({ teamIds: ids(4), config: { ...BASE_CONFIG, numCourts: 0 } }))
      expect(new Set(matches.map(m => m.court))).toEqual(new Set(['Main Court']))
    })
  })

  describe('bracket-only format', () => {
    it('labels matches "bracket" and keeps registration order (no shuffle)', () => {
      const random = jest.fn(() => 0.5)
      const { pools, matches } = generateSchedule(input({ format: 'bracket', teamIds: ['a', 'b', 'c', 'd'], random }))
      expect(random).not.toHaveBeenCalled()
      expect(pools).toEqual([])
      matches.forEach(m => expect(m.stage).toBe('bracket'))
      // Round 1 pairs the first seat with the last: a-d, b-c.
      expect(matches.slice(0, 2).map(m => [m.team_a_id, m.team_b_id])).toEqual([['a', 'd'], ['b', 'c']])
      expect(matches.slice(0, 2).every(m => m.round === 1)).toBe(true)
    })
  })

  describe('pool play', () => {
    it('9 teams: pools of 5 and 4, each team in exactly one pool', () => {
      const { pools, matches } = generateSchedule(input({ format: 'pool_play', teamIds: ids(9) }))
      expect(pools.map(p => p.name)).toEqual(['Pool A', 'Pool B'])
      expect(pools.map(p => p.display_order)).toEqual([0, 1])
      expect(pools.map(p => p.team_ids.length).sort()).toEqual([4, 5])
      expect(pools.flatMap(p => p.team_ids).sort()).toEqual(ids(9).sort())

      matches.forEach(m => expect(m.stage).toBe('pool_play'))
      const byPool = new Map<string, typeof matches>()
      matches.forEach(m => byPool.set(m.pool_key as string, [...(byPool.get(m.pool_key as string) ?? []), m]))
      for (const pool of pools) {
        const own = byPool.get(pool.key) ?? []
        const n = pool.team_ids.length
        expect(own).toHaveLength((n * (n - 1)) / 2)
        own.forEach(m => {
          expect(pool.team_ids).toContain(m.team_a_id)
          expect(pool.team_ids).toContain(m.team_b_id)
        })
      }
      assertNoDoubleBooking(matches)
    })

    it('10 teams: three balanced pools (4, 3, 3)', () => {
      const { pools } = generateSchedule(input({ format: 'pool_bracket', teamIds: ids(10) }))
      expect(pools.map(p => p.team_ids.length).sort()).toEqual([3, 3, 4])
    })

    it('shares courts between pools: a round of each pool runs together', () => {
      const { matches } = generateSchedule(input({
        format: 'pool_play', teamIds: ids(8), config: { ...BASE_CONFIG, numCourts: 2 },
      }))
      // Two pools of 4 -> 2 matches per pool per round, 4 per round on 2 courts.
      const round1 = matches.filter(m => m.round === 1)
      expect(round1).toHaveLength(4)
      expect(new Set(round1.map(m => m.pool_key))).toEqual(new Set(['A', 'B']))
      expect(new Set(round1.map(m => m.scheduled_at)).size).toBe(2)
    })

    it('is reproducible with the same random source', () => {
      const a = generateSchedule(input({ format: 'pool_play', teamIds: ids(9), random: seeded(11) }))
      const b = generateSchedule(input({ format: 'pool_play', teamIds: ids(9), random: seeded(11) }))
      expect(a).toEqual(b)
    })

    it('different draws can deal different pools', () => {
      const a = generateSchedule(input({ format: 'pool_play', teamIds: ids(8), random: seeded(1) }))
      const b = generateSchedule(input({ format: 'pool_play', teamIds: ids(8), random: seeded(99) }))
      expect(a.pools.map(p => p.team_ids)).not.toEqual(b.pools.map(p => p.team_ids))
    })
  })

  describe('games per team cap', () => {
    it('even field: every team plays exactly the cap', () => {
      const { matches } = generateSchedule(input({ teamIds: ids(6), config: { ...BASE_CONFIG, gamesPerTeam: 2 } }))
      expect(matches).toHaveLength(6)
      const games = gamesPlayed(matches)
      ids(6).forEach(t => expect(games.get(t)).toBe(2))
      expect(new Set(matches.map(m => pairKey(m.team_a_id, m.team_b_id))).size).toBe(6)
    })

    it('odd field: nobody exceeds the cap and nobody is more than one game short', () => {
      const { matches } = generateSchedule(input({ teamIds: ids(5), config: { ...BASE_CONFIG, gamesPerTeam: 3 } }))
      const games = gamesPlayed(matches)
      ids(5).forEach(t => {
        expect(games.get(t)).toBeLessThanOrEqual(3)
        expect(games.get(t)).toBeGreaterThanOrEqual(2)
      })
    })

    it('a cap above what is possible gives the full round robin', () => {
      const { matches } = generateSchedule(input({ teamIds: ids(4), config: { ...BASE_CONFIG, gamesPerTeam: 5 } }))
      expect(matches).toHaveLength(6)
    })

    it('applies per pool', () => {
      const { matches, pools } = generateSchedule(input({
        format: 'pool_play', teamIds: ids(10), config: { ...BASE_CONFIG, gamesPerTeam: 2 },
      }))
      const games = gamesPlayed(matches)
      pools.flatMap(p => p.team_ids).forEach(t => expect(games.get(t)).toBeLessThanOrEqual(2))
    })
  })
})

function assertNoDoubleBooking(matches: { scheduled_at: string; court: string; team_a_id: string; team_b_id: string }[]) {
  const bySlot = new Map<string, typeof matches>()
  matches.forEach(m => bySlot.set(m.scheduled_at, [...(bySlot.get(m.scheduled_at) ?? []), m]))
  for (const group of bySlot.values()) {
    const teams = group.flatMap(m => [m.team_a_id, m.team_b_id])
    expect(new Set(teams).size).toBe(teams.length)
    const courts = group.map(m => m.court)
    expect(new Set(courts).size).toBe(courts.length)
  }
}
