import type { VolleyballPosition, VolleyballSkillLevel } from '../../types'

export const VOLLEYBALL_POSITION_OPTIONS: { value: VolleyballPosition; label: string }[] = [
  { value: 'setter', label: 'Setter' },
  { value: 'libero', label: 'Libero' },
  { value: 'outside_hitter', label: 'Outside Hitter (OH)' },
  { value: 'middle_blocker', label: 'Middle Blocker (MB)' },
  { value: 'defensive_specialist', label: 'Defensive Specialist (DS)' },
  { value: 'opposite_hitter', label: 'Opposite Hitter (OPP)' },
]

export const VOLLEYBALL_SKILL_LEVEL_OPTIONS: { value: VolleyballSkillLevel; label: string }[] = [
  { value: 'd',       label: 'D (Newbie)' },
  { value: 'c',       label: 'C' },
  { value: 'b',       label: 'B' },
  { value: 'bb',      label: 'BB' },
  { value: 'a',       label: 'A' },
  { value: 'aa_plus', label: 'AA+' },
]

/**
 * "Outside Hitter (OH)" → "OH": the compact label used on the hero's position
 * chips. (The old inline version replaced the name but kept the suffix and
 * rendered "OH (OH)".)
 */
export function shortPositionLabel(position: VolleyballPosition): string {
  const label = VOLLEYBALL_POSITION_OPTIONS.find(o => o.value === position)?.label ?? position
  return label.match(/\(([A-Z]+)\)$/)?.[1] ?? label
}
