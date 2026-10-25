import type {
  GeneratedSchedule, ScheduleInput, ScheduleMatch, SchedulePool,
} from '../types'

/**
 * Pure schedule generator for the tournament organizer ("Generate Schedule").
 * No I/O: the screen passes registered team ids + settings and sends the result to
 * the `replace_tournament_schedule` RPC.
 *
 * Pairings use the circle method, so within a round every team plays at most once
 * (an odd team count gives each team exactly one bye). The old inline generator
 * walked the pair list in order, which scheduled team 0 on two courts in the same
 * time slot.
 */

/** Pool count / size for `n` registered teams: aims for pools of about four. */
export function poolLayout(n: number): { numPools: number; teamsPerPool: number } {
  if (n < 1) return { numPools: 0, teamsPerPool: 0 }
  const teamsPerPool = Math.ceil(n / Math.max(1, Math.round(n / 4)))
  return { numPools: Math.ceil(n / teamsPerPool), teamsPerPool }
}

/** Fisher-Yates shuffle into a new array. */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Round-robin rounds via the circle method: `n - 1` rounds for even `n`, `n` rounds
 * for odd `n` (one bye each). Every pair meets exactly once across all rounds.
 */
export function roundRobinRounds(teamIds: readonly string[]): [string, string][][] {
  if (teamIds.length < 2) return []
  const ring: (string | null)[] = teamIds.length % 2 === 1 ? [...teamIds, null] : [...teamIds]
  const n = ring.length
  const rounds: [string, string][][] = []
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = []
    for (let i = 0; i < n / 2; i++) {
      const a = ring[i]
      const b = ring[n - 1 - i]
      if (a !== null && b !== null) pairs.push([a, b])
    }
    rounds.push(pairs)
    // Rotate everything but the first seat one step.
    ring.splice(1, 0, ring.pop() as string | null)
  }
  return rounds
}

export function generateSchedule(input: ScheduleInput): GeneratedSchedule {
  const { format, startDate, teamIds, config } = input
  if (teamIds.length < 2) return { pools: [], matches: [] }

  const random = input.random ?? Math.random
  const usePools = format === 'pool_play' || format === 'pool_bracket'
  const numCourts = Math.max(1, Math.floor(config.numCourts) || 1)
  const slotMs = (config.matchDuration + config.breakDuration) * 60_000
  const cap = config.gamesPerTeam && config.gamesPerTeam > 0 ? config.gamesPerTeam : null

  // Who plays whom, grouped: one group per pool, or a single group for the whole field.
  const pools: SchedulePool[] = []
  const groups: { poolKey: string | null; rounds: [string, string][][] }[] = []
  if (usePools) {
    const { numPools } = poolLayout(teamIds.length)
    const dealt: string[][] = Array.from({ length: numPools }, () => [])
    shuffle(teamIds, random).forEach((id, i) => dealt[i % numPools].push(id))
    dealt.forEach((members, i) => {
      const key = String.fromCharCode(65 + i)
      pools.push({ key, name: `Pool ${key}`, display_order: i, team_ids: members })
      groups.push({ poolKey: key, rounds: roundRobinRounds(members) })
    })
  } else {
    groups.push({ poolKey: null, rounds: roundRobinRounds(teamIds) })
  }

  // "Games per team" = opponents faced: each round is one game per team, so keep the first N rounds.
  if (cap) groups.forEach(g => { g.rounds = g.rounds.slice(0, cap) })

  const stage: ScheduleMatch['stage'] = usePools ? 'pool_play' : format === 'round_robin' ? 'round_robin' : 'bracket'
  const totalRounds = Math.max(...groups.map(g => g.rounds.length))
  const matches: ScheduleMatch[] = []
  let slot = 0

  // Round r of every pool runs together (pools share the courts), then round r + 1 starts
  // in a later slot, so a team never plays twice in one slot.
  for (let r = 0; r < totalRounds; r++) {
    const entries = groups.flatMap(g => (g.rounds[r] ?? []).map(pair => ({ poolKey: g.poolKey, pair })))
    entries.forEach(({ poolKey, pair }, pos) => {
      const court = pos % numCourts
      matches.push({
        pool_key: poolKey,
        stage,
        round: r + 1,
        match_number: pos + 1,
        team_a_id: pair[0],
        team_b_id: pair[1],
        court: numCourts > 1 ? `Court ${court + 1}` : 'Main Court',
        scheduled_at: new Date(startDate.getTime() + (slot + Math.floor(pos / numCourts)) * slotMs).toISOString(),
        status: 'scheduled',
      })
    })
    slot += Math.ceil(entries.length / numCourts)
  }

  return { pools, matches }
}
