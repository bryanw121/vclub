import { Platform, StyleSheet } from 'react-native'
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
  heading:      { fontFamily: theme.fonts.display,       fontSize: font.size.xl,  color: colors.text },
  subheading:   { fontFamily: theme.fonts.displaySemiBold, fontSize: font.size.lg,  color: colors.text },
  body:         { fontFamily: theme.fonts.body,           fontSize: font.size.md,  color: colors.text, lineHeight: font.lineHeight.normal },
  caption:      { fontFamily: theme.fonts.body,           fontSize: font.size.sm,  color: colors.subtext },
  label:        { fontFamily: theme.fonts.bodyMedium,     fontSize: font.size.sm,  color: colors.subtext, marginBottom: spacing.xs },
  primaryText:  { fontFamily: theme.fonts.bodyMedium,     fontSize: font.size.md,  color: colors.primary },
  errorText:    { fontFamily: theme.fonts.body,           fontSize: font.size.sm,  color: colors.error, marginTop: spacing.xs },

  // ─── Inputs ───────────────────────────────────────────────
  input: {
    fontFamily: theme.fonts.body,
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
  buttonLabelPrimary: { fontFamily: theme.fonts.bodySemiBold, color: colors.white,   fontSize: font.size.md },
  buttonLabelSecondary: { fontFamily: theme.fonts.bodySemiBold, color: colors.primary, fontSize: font.size.md },

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
  authLinkSubtle: { color: colors.subtext, fontSize: font.size.md },

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
    backgroundColor: colors.overlay,
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

  // ─── Team / player grid (shared by the event People & Cheers tabs) ───────
  playerGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  playerCell: { width: Platform.OS === 'web' ? '33.33%' : '50%', padding: 3 },
  teamHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  teamDot: { width: 8, height: 8, borderRadius: 4 },
  teamHeading: { fontSize: font.size.sm, fontWeight: font.weight.semibold },
  /** One bordered player/guest row (drag card in People, cheer card in Cheers). */
  playerCardShell: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    gap: spacing.xs,
  },
  playerCardAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerCardAvatarInitial: {
    fontSize: 13,
    fontWeight: font.weight.bold,
    letterSpacing: 0.5,
  },
  playerCardName: {
    fontSize: font.size.md,
    fontWeight: font.weight.medium,
    color: colors.text,
  },

  // ─── Update required screen ───────────────────────────────────────────────
  // ── External session card (Schelagg sessions in the Events feed) ─────────
  externalCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 20,
    padding: 14,
    marginBottom: theme.spacing.sm,
    flexDirection: 'row',
    gap: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
  },
  externalDateBlock: {
    width: 56,
    flexShrink: 0,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  externalDay: {
    fontFamily: theme.fonts.bodySemiBold,
    fontSize: 10,
    letterSpacing: 1,
  },
  externalDate: {
    fontFamily: theme.fonts.display,
    fontSize: 28,
    lineHeight: 30,
    letterSpacing: -1.2,
  },
  externalBody: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  externalKicker: {
    fontFamily: theme.fonts.bodySemiBold,
    fontSize: theme.font.size.xs,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: theme.colors.subtext,
  },
  externalTitle: {
    fontFamily: theme.fonts.displaySemiBold,
    fontSize: theme.font.size.lg,
    color: theme.colors.text,
  },
  externalMeta: {
    fontFamily: theme.fonts.body,
    fontSize: theme.font.size.sm,
    color: theme.colors.subtext,
  },
  externalSignup: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: theme.spacing.xs,
    minHeight: 32,
    paddingHorizontal: theme.spacing.sm + 2,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primarySoft,
  },
  externalSignupLabel: {
    fontFamily: theme.fonts.bodySemiBold,
    fontSize: theme.font.size.sm,
    color: theme.colors.text,
  },
  // ── Guest mode (SignInPrompt, SignInButton) ──────────────────────────────
  signInPromptContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
    backgroundColor: theme.colors.background,
  },
  signInPromptIcon: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.xs,
  },
  signInPromptTitle: {
    fontFamily: theme.fonts.display,
    fontSize: theme.font.size.xl,
    color: theme.colors.text,
    textAlign: 'center',
  },
  signInPromptBody: {
    fontFamily: theme.fonts.body,
    fontSize: theme.font.size.md,
    lineHeight: theme.font.lineHeight.tight,
    color: theme.colors.subtext,
    textAlign: 'center',
    maxWidth: 320,
  },
  signInPromptActions: {
    width: '100%',
    maxWidth: 320,
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  signInButton: {
    minHeight: 38,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signInButtonLabel: {
    fontFamily: theme.fonts.bodySemiBold,
    fontSize: theme.font.size.md,
    color: theme.colors.white,
  },
  updateRequiredContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
    backgroundColor: theme.colors.background,
    gap: theme.spacing.sm,
  },
  updateRequiredTitle: {
    fontFamily: theme.fonts.display,
    fontSize: theme.font.size.xl,
    color: theme.colors.text,
    textAlign: 'center',
  },
  updateRequiredBody: {
    fontFamily: theme.fonts.body,
    fontSize: theme.font.size.md,
    color: theme.colors.text,
    textAlign: 'center',
    maxWidth: 360,
  },
  updateRequiredVersion: {
    fontFamily: theme.fonts.body,
    fontSize: theme.font.size.sm,
    color: theme.colors.subtext,
  },

  // ═══ UI primitives (components/ui) ═══════════════════════════════════════
  // Values are lifted from the hand-built versions in the screens so adopting
  // a primitive in Phase B does not change how anything looks.

  // ── Button extensions ─────────────────────────────────────
  buttonGhost:        { backgroundColor: 'transparent' },
  buttonSm:           { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, minHeight: 36 },
  /** Toolbar button: sm padding, ≥44pt touch target (CLAUDE.md UI rule). */
  buttonTouch:        { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, minHeight: 44 },
  buttonAuto:         { alignSelf: 'flex-start' },
  buttonWithIcon:     { flexDirection: 'row', gap: spacing.xs + 2 },
  buttonLabelSm:      { fontSize: font.size.smd },

  // ── Chip (feed filter chips) ──────────────────────────────
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipActive:      { backgroundColor: colors.primary, borderColor: colors.primary },
  /** Clubs-style active state: 14% primary wash instead of a solid fill. */
  chipActiveTint:  { backgroundColor: colors.primary + '24', borderColor: colors.primary },
  chipLabel: {
    fontFamily: theme.fonts.bodySemiBold,
    fontSize: 12.5,
    fontWeight: font.weight.semibold,
    color: colors.subtext,
  },
  chipLabelActive:     { color: colors.onPrimary },
  chipLabelActiveTint: { color: colors.primary },

  // ── IconButton (notifications bell, etc.) ─────────────────
  iconButton: {
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonDot: {
    position: 'absolute',
    top: -2,
    right: -3,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.hot,
    borderWidth: 1.5,
    borderColor: colors.card,
  },

  // ── ScreenHeader ──────────────────────────────────────────
  screenHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md + 4,
    paddingBottom: spacing.sm,
  },
  screenHeaderText:  { flexShrink: 1 },
  screenHeaderKicker: {
    fontFamily: theme.fonts.bodySemiBold,
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold,
    letterSpacing: 1.2,
    color: colors.subtext,
    textTransform: 'uppercase',
  },
  screenHeaderTitle: {
    fontFamily: theme.fonts.display,
    fontSize: 34,
    lineHeight: 34,
    letterSpacing: -1.2,
    color: colors.text,
    marginTop: 2,
  },
  screenHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingBottom: spacing.xs },
  screenHeaderBack:  { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start', marginLeft: spacing.lg, marginTop: spacing.sm },
  screenHeaderBackLabel: { fontFamily: theme.fonts.body, fontSize: font.size.sm, color: colors.primary },

  // ── EmptyState / ScreenState ──────────────────────────────
  emptyState:       { alignItems: 'center', paddingTop: spacing.xxl, paddingHorizontal: spacing.lg, gap: spacing.sm },
  emptyStateBody:   { textAlign: 'center', maxWidth: 320 },
  emptyStateAction: { fontSize: font.size.sm, color: colors.primary, fontWeight: font.weight.medium },
  screenStateCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  screenStateSpinner: { marginTop: spacing.xl },

  // ── ConfirmDialog ─────────────────────────────────────────
  /** Centering wrapper; the scrim is a sibling Pressable (see ConfirmDialog) so it can be tapped to dismiss. */
  modalOverlayPlain: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  dialogCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.xl,
    width: 320,
    maxWidth: '92%',
    gap: spacing.md,
    zIndex: 1,
  },
  dialogTitle:   { fontSize: font.size.lg, fontWeight: font.weight.semibold, color: colors.text },
  dialogBody:    { fontSize: font.size.sm, color: colors.subtext },
  dialogActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  dialogAction:  { flex: 1 },

  // ── BottomSheet ───────────────────────────────────────────
  sheetRoot:     { flex: 1, justifyContent: 'flex-end' },
  sheetCard: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: 20,
  },
  sheetTitle: {
    fontFamily: theme.fonts.displaySemiBold,
    fontSize: font.size.lg,
    color: colors.text,
    marginBottom: spacing.md,
  },
  /** One tappable row in an action sheet (People-tab ⋯ menu). 44pt minimum. */
  sheetOption: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  sheetOptionActive:      { backgroundColor: colors.background },
  sheetOptionText:        { fontSize: font.size.md, fontWeight: font.weight.medium, color: colors.text },
  sheetOptionDestructive: { color: colors.error },
  /** Glyph-only corner trigger on a roster card (⋯): the icon stays small, the hit area is 44pt. */
  rowMenuTrigger: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Wrapping row of Chips (forms) ─────────────────────────
  chipRowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs, marginTop: theme.spacing.xs, marginBottom: theme.spacing.xs },

  // ── Events feed: refresh failed, showing older events ─────
  feedStaleNotice: {
    minHeight: 44,
    justifyContent: 'center',
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.warning,
    backgroundColor: theme.colors.card,
  },
  /** Mobile: the notice sits outside the padded list column. */
  feedStaleNoticeMobile: { marginHorizontal: theme.spacing.lg },
  feedStaleNoticeText: { color: theme.colors.warning, fontSize: theme.font.size.sm, fontFamily: theme.fonts.bodyMedium },

  // ── ScreenContainer ───────────────────────────────────────
  screenContainerWide:  { flex: 1, alignItems: 'center' },
  screenContainerInner: { flex: 1, width: '100%' },
})
