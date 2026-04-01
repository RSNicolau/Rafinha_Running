import React from 'react';
import { View, Text, Platform, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../../theme';
import { glass } from '../../theme/liquid-glass';

type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info';

interface GlassBadgeProps {
  label: string;
  variant?: BadgeVariant;
  icon?: React.ReactNode;
  size?: 'sm' | 'md';
}

export function GlassBadge({ label, variant = 'default', icon, size = 'md' }: GlassBadgeProps) {
  const { colors, isDark } = useTheme();

  const getColors = (): { bg: string; text: string; border: string } => {
    switch (variant) {
      case 'primary':
        return { bg: 'rgba(220, 38, 38, 0.12)', text: colors.primary, border: 'rgba(220, 38, 38, 0.2)' };
      case 'success':
        return { bg: 'rgba(16, 185, 129, 0.12)', text: colors.success, border: 'rgba(16, 185, 129, 0.2)' };
      case 'warning':
        return { bg: 'rgba(245, 158, 11, 0.12)', text: colors.warning, border: 'rgba(245, 158, 11, 0.2)' };
      case 'error':
        return { bg: 'rgba(239, 68, 68, 0.12)', text: colors.error, border: 'rgba(239, 68, 68, 0.2)' };
      case 'info':
        return { bg: 'rgba(59, 130, 246, 0.12)', text: colors.info, border: 'rgba(59, 130, 246, 0.2)' };
      default:
        return { bg: colors.glassOverlay, text: colors.textSecondary, border: colors.glassBorder };
    }
  };

  const badgeColors = getColors();
  const isSmall = size === 'sm';

  return (
    <View
      style={[
        glass.badge,
        {
          borderColor: badgeColors.border,
          backgroundColor: badgeColors.bg,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingHorizontal: isSmall ? 8 : 12,
          paddingVertical: isSmall ? 3 : 5,
          alignSelf: 'flex-start',
        },
      ]}
    >
      {icon}
      <Text
        style={{
          color: badgeColors.text,
          fontSize: isSmall ? 11 : 12,
          fontWeight: '600',
          letterSpacing: 0.2,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
