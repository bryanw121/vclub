export const theme = {
  colors: {
    // Brand
    primary:      '#7C4DFF',   // slightly brighter violet — pops on dark bg
    primaryDark:  '#5A2BFF',
    primarySoft:  '#2A1F6B',   // dark violet tint for soft chip bgs
    // Accent — electric sky blue
    accent:       '#3DC9F5',
    accentInk:    '#002A36',
    // Surfaces
    background:   '#13111F',   // dark violet-black (~Instagram/Spotify level)
    card:         '#1E1B2E',   // elevated dark surface
    /** Create-menu pills: hair lighter than `card` so they read over a blurred feed */
    fabMenuChip:       '#26243A',
    fabMenuChipBorder: '#3A365C',
    /** Washes over `BlurView` so content recedes without going flat black */
    fabMenuBackdropDim: 'rgba(19, 17, 31, 0.42)',
    // Text
    text:         '#EDEAFF',   // near-white with violet tint
    subtext:      '#7A7699',   // muted lavender-grey
    // Borders
    border:       '#2C2848',   // dark purple border
    borderSoft:   '#211D3A',   // very subtle
    // Signal palette
    warm:         '#FF6B3D',
    hot:          '#FF2D6F',
    cool:         '#00D6B4',
    // Status
    error:        '#FF5555',
    warning:      '#FFA040',
    success:      '#00D26A',
    white:        '#FFFFFF',
    // Misc
    announcementHighlight: '#2A1F6B',
  },
  /** Font family names registered via @expo-google-fonts (native + web). */
  fonts: {
    display:         'SpaceGrotesk_700Bold',
    displaySemiBold: 'SpaceGrotesk_600SemiBold',
    displayMedium:   'SpaceGrotesk_500Medium',
    body:            'Inter_400Regular',
    bodyMedium:      'Inter_500Medium',
    bodySemiBold:    'Inter_600SemiBold',
    bodyBold:        'Inter_700Bold',
  },
  spacing: {
    xxs: 2,
    xs:  4,
    sm:  8,
    md:  16,
    lg:  24,
    xl:  32,
    xxl: 48,
  },
  font: {
    size: {
      xs:  11,
      sm:  12,
      md:  14,
      lg:  18,
      xl:  24,
      xxl: 32,
    },
    weight: {
      regular:  '400' as const,
      medium:   '500' as const,
      semibold: '600' as const,
      bold:     '700' as const,
    },
    lineHeight: {
      tight:   20,
      normal:  24,
      relaxed: 30,
    },
  },
  radius: {
    sm:   8,
    md:   12,
    lg:   16,
    xl:   20,
    xxl:  28,
    full: 999,
  },
  shadow: {
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 1,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 3,
    },
  },
}

export type Theme = typeof theme
