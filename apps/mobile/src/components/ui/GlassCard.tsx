import React from 'react';
import { View, StyleSheet, ViewStyle, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../../theme';
import { glass, glassShadow } from '../../theme/liquid-glass';

interface GlassCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  intensity?: 'subtle' | 'medium' | 'strong';
  shadow?: 'sm' | 'md' | 'lg' | 'none';
  padding?: number;
}

export function GlassCard({
  children,
  style,
  intensity = 'medium',
  shadow = 'md',
  padding = 20,
}: GlassCardProps) {
  const { colors, isDark } = useTheme();

  const blurAmount = { subtle: 15, medium: 25, strong: 40 }[intensity];
  const shadowStyle = shadow !== 'none' ? glassShadow[shadow] : {};

  return (
    <View
      style={[
        glass.card,
        shadowStyle,
        {
          borderColor: colors.glassBorder,
          backgroundColor: Platform.OS === 'web' ? colors.glass : 'transparent',
        },
        style,
      ]}
    >
      {Platform.OS !== 'web' && (
        <BlurView
          intensity={blurAmount}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
      )}
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: colors.glass },
        ]}
      />
      <View style={{ padding, position: 'relative' }}>
        {children}
      </View>
    </View>
  );
}
