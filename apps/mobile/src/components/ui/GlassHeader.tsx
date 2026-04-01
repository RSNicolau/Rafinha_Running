import React from 'react';
import { View, Text, StyleSheet, Platform, Pressable } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';
import { glass } from '../../theme/liquid-glass';

interface GlassHeaderProps {
  title: string;
  subtitle?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  onLeftPress?: () => void;
  onRightPress?: () => void;
  transparent?: boolean;
}

export function GlassHeader({
  title,
  subtitle,
  leftIcon,
  rightIcon,
  onLeftPress,
  onRightPress,
  transparent = false,
}: GlassHeaderProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        glass.header,
        {
          borderBottomColor: transparent ? 'transparent' : colors.glassBorder,
          backgroundColor: transparent
            ? 'transparent'
            : Platform.OS === 'web'
              ? colors.headerBackground
              : 'transparent',
          paddingTop: insets.top + 8,
          paddingBottom: 12,
          paddingHorizontal: 20,
        },
      ]}
    >
      {!transparent && Platform.OS !== 'web' && (
        <BlurView
          intensity={60}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 1 }}>
        <View style={{ width: 40 }}>
          {leftIcon && (
            <Pressable onPress={onLeftPress} hitSlop={12}>
              {leftIcon}
            </Pressable>
          )}
        </View>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text
            style={{
              color: colors.text,
              fontSize: 17,
              fontWeight: '600',
              letterSpacing: -0.2,
            }}
            numberOfLines={1}
          >
            {title}
          </Text>
          {subtitle && (
            <Text
              style={{
                color: colors.textSecondary,
                fontSize: 12,
                marginTop: 2,
              }}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          )}
        </View>
        <View style={{ width: 40, alignItems: 'flex-end' }}>
          {rightIcon && (
            <Pressable onPress={onRightPress} hitSlop={12}>
              {rightIcon}
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}
