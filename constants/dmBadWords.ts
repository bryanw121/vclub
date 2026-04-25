/**
 * DM moderation: words and short phrases to flag for an unsportsmanlike-conduct prompt.
 * Case-insensitive. Entries without spaces use whole-word matching; entries with spaces use substring match.
 * Contains explicit language by design — extend or replace with remote config as needed.
 */
export const DM_BAD_WORD_PATTERNS: string[] = [
  // Unsportsmanlike / insult (non-profanity)
  'cheat',
  'cheater',
  'trash',
  'loser',
  'idiot',
  'stupid',
  'hate you',
  'shut up',

  // Common profanity & vulgar insults (whole-word unless phrase)
  'arse',
  'arsehole',
  'ass',
  'asshat',
  'asshole',
  'bastard',
  'bitch',
  'bitchy',
  'blowjob',
  'bollocks',
  'boner',
  'bullshit',
  'clusterfuck',
  'cock',
  'cocksucker',
  'crap',
  'cum',
  'cunt',
  'damn',
  'dick',
  'dickhead',
  'dipshit',
  'douche',
  'douchebag',
  'dumbass',
  'fuck',
  'fucked',
  'fucker',
  'fucking',
  'goddamn',
  'goddamned',
  'hell',
  'jackass',
  'jackshit',
  'jerkoff',
  'motherfucker',
  'nutsack',
  'piss',
  'pissed',
  'prick',
  'pussy',
  'shit',
  'shithead',
  'shitty',
  'skank',
  'slut',
  'slutty',
  'twat',
  'wanker',
  'whore',

  // Multi-word (substring match)
  'fuck off',
  'fuck you',
  'go fuck',
  'go to hell',
  'piss off',
  'screw you',
  'suck my',
]

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** True if `content` matches any entry in {@link DM_BAD_WORD_PATTERNS}. */
export function dmMessageContainsBadWord(content: string | null | undefined): boolean {
  if (!content?.trim()) return false
  const lower = content.toLowerCase()
  for (const raw of DM_BAD_WORD_PATTERNS) {
    const p = raw.trim().toLowerCase()
    if (!p) continue
    if (p.includes(' ')) {
      if (lower.includes(p)) return true
    } else {
      const re = new RegExp(`\\b${escapeRegExp(p)}\\b`, 'i')
      if (re.test(content)) return true
    }
  }
  return false
}
