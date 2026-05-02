import { Platform } from 'react-native'

/**
 * DM moderation: words and short phrases to flag for an unsportsmanlike-conduct prompt.
 * Case-insensitive. Entries without spaces use whole-word matching; entries with spaces use substring match.
 * Contains explicit language by design — extend or replace with remote config as needed.
 */

/** Min time between unsportsmanlike report prompts for the same DM conversation. */
export const DM_BAD_WORD_PROMPT_COOLDOWN_MS = 60 * 60 * 1000

const DM_BAD_WORD_PROMPT_AT_KEY = 'vclub:dmBadWordPromptAt:'

export function dmBadWordPromptStorageKey(conversationId: string): string {
  return DM_BAD_WORD_PROMPT_AT_KEY + conversationId
}

/** Last time (epoch ms) we showed the bad-word report prompt for this conversation; 0 if never. */
export async function loadDmBadWordPromptAt(conversationId: string): Promise<number> {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage === 'undefined') return 0
      const raw = localStorage.getItem(dmBadWordPromptStorageKey(conversationId))
      const n = raw ? Number(raw) : 0
      return Number.isFinite(n) && n > 0 ? n : 0
    }
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default
    const raw = await AsyncStorage.getItem(dmBadWordPromptStorageKey(conversationId))
    const n = raw ? Number(raw) : 0
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

export async function saveDmBadWordPromptAt(conversationId: string, ts: number): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage === 'undefined') return
      localStorage.setItem(dmBadWordPromptStorageKey(conversationId), String(ts))
      return
    }
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default
    await AsyncStorage.setItem(dmBadWordPromptStorageKey(conversationId), String(ts))
  } catch {
    // Non-critical
  }
}

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
