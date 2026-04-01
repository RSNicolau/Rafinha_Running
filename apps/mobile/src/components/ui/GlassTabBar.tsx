import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';
import { glass } from '../../theme/liquid-glass';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

export function GlassTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        glass.tabBar,
        {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          borderTopColor: colors.tabBarBorder,
          backgroundColor: Platform.OS === 'web' ? colors.tabBarBackground : 'transparent',
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 8,
        },
      ]}
    >
      {Platform.OS !== 'web' && (
        <BlurView
          intensity={80}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
      )}
      <View style={{ flexDirection: 'row', zIndex: 1 }}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;

          if (options.href === null) return null;

          const label = options.tabBarLabel ?? options.title ?? route.name;
          const icon = options.tabBarIcon;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 4,
                gap: 3,
              }}
            >
              {icon?.({
                focused: isFocused,
                color: isFocused ? colors.primary : colors.textTertiary,
                size: 22,
              })}
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: isFocused ? '600' : '400',
                  color: isFocused ? colors.primary : colors.textTertiary,
                  letterSpacing: 0.1,
                }}
              >
                {typeof label === 'string' ? label : route.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
