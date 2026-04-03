export const palette = {
  red50: '#FEF2F2',
  red100: '#FEE2E2',
  red200: '#FECACA',
  red300: '#FCA5A5',
  red400: '#F87171',
  red500: '#EF4444',
  red600: '#DC2626',
  red700: '#B91C1C',
  red800: '#991B1B',
  red900: '#7F1D1D',

  gray50: '#F9FAFB',
  gray100: '#F3F4F6',
  gray200: '#E5E7EB',
  gray300: '#D1D5DB',
  gray400: '#9CA3AF',
  gray500: '#6B7280',
  gray600: '#4B5563',
  gray700: '#374151',
  gray800: '#1F2937',
  gray900: '#111827',
  gray950: '#030712',

  white: '#FFFFFF',
  black: '#000000',

  green500: '#10B981',
  green100: '#D1FAE5',
  amber500: '#F59E0B',
  amber100: '#FEF3C7',
  blue500: '#3B82F6',
  blue100: '#DBEAFE',
  cyan500: '#06B6D4',
  purple500: '#8B5CF6',
  indigo500: '#6366F1',
  orange500: '#F97316',
} as const;

export const lightTheme = {
  primary: palette.red600,
  primaryDark: palette.red700,
  primaryLight: palette.red500,
  primaryFaded: palette.red100,
  primaryGhost: 'rgba(220, 38, 38, 0.08)',

  background: '#F2F2F7',
  backgroundSecondary: palette.gray100,
  surface: palette.white,
  surfaceElevated: palette.white,

  // Glass tokens
  glass: 'rgba(255, 255, 255, 0.65)',
  glassBorder: 'rgba(255, 255, 255, 0.35)',
  glassHighlight: 'rgba(255, 255, 255, 0.9)',
  glassShadow: 'rgba(0, 0, 0, 0.08)',
  glassOverlay: 'rgba(255, 255, 255, 0.45)',

  text: palette.gray900,
  textSecondary: palette.gray500,
  textTertiary: palette.gray400,
  textInverse: palette.white,
  textOnPrimary: palette.white,

  border: palette.gray200,
  borderLight: palette.gray100,
  divider: 'rgba(0, 0, 0, 0.06)',

  success: palette.green500,
  successLight: palette.green100,
  warning: palette.amber500,
  warningLight: palette.amber100,
  error: palette.red500,
  errorLight: palette.red100,
  info: palette.blue500,
  infoLight: palette.blue100,

  tabBarBackground: 'rgba(255, 255, 255, 0.75)',
  tabBarBorder: 'rgba(0, 0, 0, 0.06)',
  headerBackground: 'rgba(242, 242, 247, 0.85)',

  skeleton: palette.gray200,
  skeletonHighlight: palette.gray100,
} as const;

export const darkTheme = {
  primary: palette.red500,
  primaryDark: palette.red600,
  primaryLight: palette.red400,
  primaryFaded: 'rgba(220, 38, 38, 0.2)',
  primaryGhost: 'rgba(220, 38, 38, 0.12)',

  background: '#000000',
  backgroundSecondary: '#1C1C1E',
  surface: '#1C1C1E',
  surfaceElevated: '#2C2C2E',

  // Glass tokens
  glass: 'rgba(44, 44, 46, 0.65)',
  glassBorder: 'rgba(255, 255, 255, 0.12)',
  glassHighlight: 'rgba(255, 255, 255, 0.08)',
  glassShadow: 'rgba(0, 0, 0, 0.3)',
  glassOverlay: 'rgba(44, 44, 46, 0.55)',

  text: palette.gray50,
  textSecondary: palette.gray400,
  textTertiary: palette.gray500,
  textInverse: palette.gray900,
  textOnPrimary: palette.white,

  border: 'rgba(255, 255, 255, 0.1)',
  borderLight: 'rgba(255, 255, 255, 0.06)',
  divider: 'rgba(255, 255, 255, 0.08)',

  success: '#34D399',
  successLight: 'rgba(16, 185, 129, 0.2)',
  warning: '#FBBF24',
  warningLight: 'rgba(245, 158, 11, 0.2)',
  error: palette.red400,
  errorLight: 'rgba(239, 68, 68, 0.2)',
  info: '#60A5FA',
  infoLight: 'rgba(59, 130, 246, 0.2)',

  tabBarBackground: 'rgba(28, 28, 30, 0.75)',
  tabBarBorder: 'rgba(255, 255, 255, 0.08)',
  headerBackground: 'rgba(0, 0, 0, 0.85)',

  skeleton: 'rgba(255, 255, 255, 0.08)',
  skeletonHighlight: 'rgba(255, 255, 255, 0.12)',
} as const;

// Workout type colors (shared)
export const workoutColors = {
  easyRun: palette.green500,
  tempo: palette.amber500,
  interval: palette.red500,
  longRun: palette.purple500,
  recovery: palette.cyan500,
  race: palette.red600,
  crossTraining: palette.indigo500,
  rest: palette.gray400,
} as const;

// Heart rate zone colors (shared)
export const hrZoneColors = {
  z1: palette.cyan500,
  z2: palette.green500,
  z3: palette.amber500,
  z4: palette.orange500,
  z5: palette.red500,
} as const;

export type ThemeColors = typeof lightTheme | typeof darkTheme;

// Legacy compatibility
export const colors = lightTheme;
export type Colors = ThemeColors;
