import { Platform, ViewStyle } from 'react-native';

export const glassIntensity = {
  subtle: 20,
  medium: 40,
  strong: 60,
  ultra: 80,
} as const;

export const glass = {
  card: {
    overflow: 'hidden' as const,
    borderWidth: 0.5,
    borderRadius: 20,
    ...(Platform.OS === 'web' ? {
      backdropFilter: 'blur(20px) saturate(180%)',
      WebkitBackdropFilter: 'blur(20px) saturate(180%)',
    } : {}),
  } satisfies ViewStyle,

  cardSmall: {
    overflow: 'hidden' as const,
    borderWidth: 0.5,
    borderRadius: 14,
    ...(Platform.OS === 'web' ? {
      backdropFilter: 'blur(16px) saturate(160%)',
      WebkitBackdropFilter: 'blur(16px) saturate(160%)',
    } : {}),
  } satisfies ViewStyle,

  button: {
    overflow: 'hidden' as const,
    borderWidth: 0.5,
    borderRadius: 14,
    ...(Platform.OS === 'web' ? {
      backdropFilter: 'blur(12px) saturate(150%)',
      WebkitBackdropFilter: 'blur(12px) saturate(150%)',
    } : {}),
  } satisfies ViewStyle,

  input: {
    overflow: 'hidden' as const,
    borderWidth: 0.5,
    borderRadius: 12,
    ...(Platform.OS === 'web' ? {
      backdropFilter: 'blur(10px) saturate(140%)',
      WebkitBackdropFilter: 'blur(10px) saturate(140%)',
    } : {}),
  } satisfies ViewStyle,

  header: {
    overflow: 'hidden' as const,
    borderBottomWidth: 0.5,
    ...(Platform.OS === 'web' ? {
      backdropFilter: 'blur(24px) saturate(180%)',
      WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    } : {}),
  } satisfies ViewStyle,

  tabBar: {
    overflow: 'hidden' as const,
    borderTopWidth: 0.5,
    ...(Platform.OS === 'web' ? {
      backdropFilter: 'blur(24px) saturate(180%)',
      WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    } : {}),
  } satisfies ViewStyle,

  modal: {
    overflow: 'hidden' as const,
    borderWidth: 0.5,
    borderRadius: 28,
    ...(Platform.OS === 'web' ? {
      backdropFilter: 'blur(30px) saturate(200%)',
      WebkitBackdropFilter: 'blur(30px) saturate(200%)',
    } : {}),
  } satisfies ViewStyle,

  badge: {
    overflow: 'hidden' as const,
    borderWidth: 0.5,
    borderRadius: 10,
    ...(Platform.OS === 'web' ? {
      backdropFilter: 'blur(8px) saturate(140%)',
      WebkitBackdropFilter: 'blur(8px) saturate(140%)',
    } : {}),
  } satisfies ViewStyle,
} as const;

export const glassShadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  glow: (color: string) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  }),
} as const;
