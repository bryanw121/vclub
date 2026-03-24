import { StyleSheet } from 'react-native'
import { theme } from './theme'

const { colors, spacing, font, radius, shadow } = theme

export const shared = StyleSheet.create({

  // ─── Layout ───────────────────────────────────────────────
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screenPadded: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scrollContent: {
    padding: spacing.lg,
  },

  // ─── Cards ────────────────────────────────────────────────
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },

  // ─── Typography ───────────────────────────────────────────
  heading: {
    fontSize: font.size.xl,
    fontWeight: font.weight.bold,
    color: colors.text,
  },
  subheading: {
    fontSize: font.size.lg,
    fontWeight: font.weight.semibold,
    color: colors.text,
  },
  body: {
    fontSize: font.size.md,
    fontWeight: font.weight.regular,
    color: colors.text,
    lineHeight: font.lineHeight.normal,
  },
  caption: {
    fontSize: font.size.sm,
    fontWeight: font.weight.regular,
    color: colors.subtext,
  },
  label: {
    fontSize: font.size.sm,
    fontWeight: font.weight.medium,
    color: colors.subtext,
    marginBottom: spacing.xs,
  },
  primaryText: {
    fontSize: font.size.md,
    fontWeight: font.weight.medium,
    color: colors.primary,
  },
  errorText: {
    fontSize: font.size.sm,
    color: colors.error,
    marginTop: spacing.xs,
  },

  // ─── Inputs ───────────────────────────────────────────────
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: font.size.md,
    color: colors.text,
  },
  inputMultiline: {
    height: 100,
    textAlignVertical: 'top',
  },
  inputContainer: {
    marginBottom: spacing.md,
  },

  // ─── Buttons ──────────────────────────────────────────────
  buttonBase: {
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: {
    backgroundColor: colors.primary,
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  buttonDanger: {
    backgroundColor: colors.error,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonLabelPrimary: {
    color: colors.white,
    fontSize: font.size.md,
    fontWeight: font.weight.semibold,
  },
  buttonLabelSecondary: {
    color: colors.primary,
    fontSize: font.size.md,
    fontWeight: font.weight.semibold,
  },

  // ─── Badges ───────────────────────────────────────────────
  badge: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  badgeFull: {
    backgroundColor: colors.error,
  },
  badgeText: {
    color: colors.white,
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold,
  },

  // ─── Auth screens ─────────────────────────────────────────
  authContainer: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  authTitle: {
    fontSize: font.size.xxl,
    fontWeight: font.weight.bold,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  authSubtitle: {
    fontSize: font.size.md,
    color: colors.subtext,
    marginBottom: spacing.xl,
  },
  authLink: {
    marginTop: spacing.md,
    alignItems: 'center',
  },
  authLinkText: {
    color: colors.primary,
    fontSize: font.size.md,
  },

  // ─── Dividers ─────────────────────────────────────────────
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },

  // ─── Spacing helpers ──────────────────────────────────────
  mb_xs: { marginBottom: spacing.xs },
  mb_sm: { marginBottom: spacing.sm },
  mb_md: { marginBottom: spacing.md },
  mb_lg: { marginBottom: spacing.lg },
  mb_xl: { marginBottom: spacing.xl },
  mt_xs: { marginTop: spacing.xs },
  mt_sm: { marginTop: spacing.sm },
  mt_md: { marginTop: spacing.md },
  mt_lg: { marginTop: spacing.lg },
  mt_xl: { marginTop: spacing.xl },
})
