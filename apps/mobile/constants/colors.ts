/**
 * constants/colors.ts
 *
 * Brand colour tokens for Rafinha Running.
 * For full light/dark theme tokens use `src/theme/colors.ts`.
 */

export const primaryRed = '#DC2626';
export const primaryRedDark = '#B91C1C';
export const primaryRedLight = '#EF4444';
export const primaryRedGhost = 'rgba(220, 38, 38, 0.08)';
export const primaryRedFaded = '#FEE2E2';

export const bgDefault = '#F9FAFB';
export const bgCard = '#FFFFFF';
export const bgInput = '#F3F4F6';

export const textPrimary = '#111827';
export const textSecondary = '#6B7280';
export const textTertiary = '#9CA3AF';

export const success = '#10B981';
export const warning = '#F59E0B';
export const error = '#EF4444';
export const info = '#3B82F6';

export const borderDefault = '#E5E7EB';
export const borderLight = '#F3F4F6';

export const shadowColor = '#000000';

/** Convenience object — matches the spec's expected export shape. */
const Colors = {
  primaryRed,
  primaryRedDark,
  primaryRedLight,
  primaryRedGhost,
  primaryRedFaded,
  bgDefault,
  bgCard,
  bgInput,
  textPrimary,
  textSecondary,
  textTertiary,
  success,
  warning,
  error,
  info,
  borderDefault,
  borderLight,
  shadowColor,
} as const;

export default Colors;
