import { StyleSheet } from 'react-native'
import { theme } from './theme'

const { colors, spacing, font, radius, shadow } = theme

export const shared = StyleSheet.create({

  // ─── Layout ───────────────────────────────────────────────
  screen:        { flex: 1, backgroundColor: colors.background },
  screenPadded:  { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  centered:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row:           { flexDirection: 'row', alignItems: 'center' },
  rowBetween:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  scrollContent: { padding: spacing.lg },
  /** Stack subpages (settings, etc.): less space under the nav header than full scrollContent. */
  scrollContentSubpage: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.xxs,
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
  heading:      { fontSize: font.size.xl,  fontWeight: font.weight.bold,     color: colors.text },
  subheading:   { fontSize: font.size.lg,  fontWeight: font.weight.semibold,  color: colors.text },
  body:         { fontSize: font.size.md,  fontWeight: font.weight.regular,   color: colors.text, lineHeight: font.lineHeight.normal },
  caption:      { fontSize: font.size.sm,  fontWeight: font.weight.regular,   color: colors.subtext },
  label:        { fontSize: font.size.sm,  fontWeight: font.weight.medium,    color: colors.subtext, marginBottom: spacing.xs },
  primaryText:  { fontSize: font.size.md,  fontWeight: font.weight.medium,    color: colors.primary },
  errorText:    { fontSize: font.size.sm,  color: colors.error, marginTop: spacing.xs },

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
  inputMultiline:  { height: 100, textAlignVertical: 'top' },
  inputError:      { borderColor: colors.error },
  inputErrorText:  { fontSize: font.size.sm, color: colors.error, marginTop: spacing.xs },
  inputContainer:  { marginBottom: spacing.md },

  // ─── Buttons ──────────────────────────────────────────────
  buttonBase:         { padding: spacing.md, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  buttonPrimary:      { backgroundColor: colors.primary },
  buttonSecondary:    { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.primary },
  buttonDanger:       { backgroundColor: colors.error },
  buttonDisabled:     { opacity: 0.5 },
  buttonLabelPrimary: { color: colors.white,   fontSize: font.size.md, fontWeight: font.weight.semibold },
  buttonLabelSecondary: { color: colors.primary, fontSize: font.size.md, fontWeight: font.weight.semibold },

  // ─── Badges ───────────────────────────────────────────────
  badge:     { backgroundColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  badgeFull: { backgroundColor: colors.error },
  badgeText: { color: colors.white, fontSize: font.size.sm, fontWeight: font.weight.semibold },

  // ─── Auth ─────────────────────────────────────────────────
  authBackground: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  authCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 400,
    ...shadow.md,
  },
  authTitle:    { fontSize: font.size.xxl, fontWeight: font.weight.bold, color: colors.primary, marginBottom: spacing.xs, textAlign: 'center' },
  authSubtitle: { fontSize: font.size.md, color: colors.subtext, marginBottom: spacing.xl, textAlign: 'center' },
  authLink:     { marginTop: spacing.md, alignItems: 'center' },
  authLinkText: { color: colors.primary, fontSize: font.size.md },

  // ─── Divider ──────────────────────────────────────────────
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },

  // ─── Pickers (create event) ───────────────────────────────
  pickerBox: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  pickerRow:     { flexDirection: 'row', alignItems: 'center' },
  pickerItem:    { alignItems: 'flex-start', gap: spacing.xs },
  pickerLabel:   { fontSize: font.size.xs, fontWeight: font.weight.medium, color: colors.subtext },
  pickerDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },

  // ─── Stepper (create event) ───────────────────────────────
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  stepperBtn:         { width: 56, height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  stepperBtnDisabled: { opacity: 0.3 },
  stepperBtnText:     { fontSize: font.size.xl, color: colors.primary, fontWeight: font.weight.medium },
  stepperValue:       { flex: 1, textAlign: 'center', fontSize: font.size.md, fontWeight: font.weight.medium, color: colors.text },

  // ─── Attendee row (event detail) ──────────────────────────
  attendeeRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  removeButton:   { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.error },
  removeText:     { color: colors.error, fontSize: font.size.sm, fontWeight: font.weight.medium },

  // ─── Event card ───────────────────────────────────────────
  eventCardTitle: { flex: 1, marginRight: spacing.sm },
  eventCard:      { marginBottom: spacing.md },

  // ─── Tags ─────────────────────────────────────────────────
  tag:     { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full, backgroundColor: colors.primary + '18', borderWidth: 1, borderColor: colors.primary + '40' },
  tagText: { fontSize: font.size.xs, fontWeight: font.weight.medium, color: colors.primary },

  // ─── Floating actions ─────────────────────────────────────
  floatingButtonWrap: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
  },
  scrollContentWithFloatingButton: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl + spacing.xl,
  },

  // ─── Modal ────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: 320,
    width: '85%',
    ...shadow.md,
  },
  modalEmoji:    { fontSize: 48 },
  modalTitle:    { fontSize: font.size.lg, fontWeight: font.weight.bold,   color: colors.text,    textAlign: 'center' },
  modalBody:     { fontSize: font.size.sm, fontWeight: font.weight.regular, color: colors.subtext, textAlign: 'center' },
  modalButton: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  modalButtonText: { color: colors.white, fontWeight: font.weight.medium, fontSize: font.size.md },

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
