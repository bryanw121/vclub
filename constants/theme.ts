export const theme = {
  colors: {
    primary: '#6C47FF',
    background: '#F9F9F9',
    card: '#FFFFFF',
    text: '#1A1A1A',
    subtext: '#6B6B6B',
    border: '#E5E5E5',
    error: '#FF4444',
    success: '#00C853',
    white: '#FFFFFF',
    /** Subtle tint for host announcement bubbles in event discussion. */
    announcementHighlight: '#EDE8FF',
  },
  spacing: {
    xxs: 2,
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  font: {
    size: {
      xs: 11,
      sm: 12,
      md: 14,
      lg: 18,
      xl: 24,
      xxl: 32,
    },
    weight: {
      regular: '400' as const,
      medium: '500' as const,
      semibold: '600' as const,
      bold: '700' as const,
    },
    lineHeight: {
      tight: 20,
      normal: 24,
      relaxed: 30,
    },
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
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
