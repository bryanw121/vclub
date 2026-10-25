import { readFileSync, readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'
import { theme } from '../constants/theme'

// Issue #43: the smallest text was 7px. 11 is iOS Caption 2 / Material Label
// Small, the smallest size either platform recommends.
const FLOOR = 11
const ROOT = resolve(__dirname, '..')

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })
}

describe('text size floor', () => {
  it('every font size token is at least the floor', () => {
    for (const size of Object.values(theme.font.size)) expect(size).toBeGreaterThanOrEqual(FLOOR)
  })

  it('no hardcoded fontSize in app/, components/ or constants/ is below the floor', () => {
    const offenders: string[] = []
    for (const file of ['app', 'components', 'constants'].flatMap(d => sources(join(ROOT, d)))) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        for (const m of line.matchAll(/fontSize(?::\s*|=\{)(\d+(?:\.\d+)?)/g)) {
          if (Number(m[1]) < FLOOR) offenders.push(`${file.slice(ROOT.length + 1)}:${i + 1} fontSize ${m[1]}`)
        }
      })
    }
    expect(offenders).toEqual([])
  })
})
