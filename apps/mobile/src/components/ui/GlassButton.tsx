import React from 'react';
import { Pressable, Text, StyleSheet, ViewStyle, TextStyle, Platform, View, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../../theme';
import { glass, glassShadow } from '../../theme/liquid-glass';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface GlassButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
  fullWidth?: boolean;
}

export function GlassButton({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  style,
  fullWidth = false,
}: GlassButtonProps) {
  const { colors, isDark } = useTheme();

  const sizeStyles: Record<ButtonSize, { paddingVertical: number; paddingHorizontal: number; fontSize: number }> = {
    sm: { paddingVertical: 8, paddingHorizontal: 16, fontSize: 13 },
    md: { paddingVertical: 14, paddingHorizontal: 24, fontSize: 15 },
    lg: { paddingVertical: 18, paddingHorizontal: 32, fontSize: 17 },
  };

  const getVariantStyles = (): { bg: string; textColor: string; borderColor: string } => {
    switch (variant) {
      case 'primary':
        return {
          bg: colors.primary,
          textColor: colors.textOnPrimary,
          borderColor: 'rgba(255, 255, 255, 0.2)',
        };
      case 'secondary':
        return {
          bg: colors.glass,
          textColor: colors.text,
          borderColor: colors.glassBorder,
        };
      case 'ghost':
        return {
          bg: 'transparent',
          textColor: colors.primary,
          borderColor: 'transparent',
        };
      case 'danger':
        return {
          bg: colors.error,
          textColor: colors.textOnPrimary,
          borderColor: 'rgba(255, 255, 255, 0.2)',
        };
    }
  };

  const variantStyles = getVariantStyles();
  const { paddingVertical, paddingHorizontal, fontSize } = sizeStyles[size];
  const isGlass = variant === 'secondary';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        glass.button,
        glassShadow.sm,
        {
          borderColor: variantStyles.borderColor,
          backgroundColor: isGlass && Platform.OS === 'web' ? variantStyles.bg : variantStyles.bg,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          alignItems: 'center' as const,
          justifyContent: 'center' as const,
          flexDirection: 'row' as const,
          gap: 8,
          paddingVertical,
          paddingHorizontal,
        },
        fullWidth && { width: '100%' as any },
        style,
      ]}
    >
      {isGlass && Platform.OS !== 'web' && (
        <BlurView
          intensity={20}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
      )}
      {loading ? (
        <ActivityIndicator size="small" color={variantStyles.textColor} />
      ) : (
        <>
          {icon}
          <Text
            style={{
              color: variantStyles.textColor,
              fontSize,
              fontWeight: '600',
              letterSpacing: 0.3,
            }}
          >
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}
