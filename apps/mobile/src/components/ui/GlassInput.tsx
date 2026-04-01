import React, { useState } from 'react';
import { View, TextInput, Text, StyleSheet, Platform, TextInputProps, ViewStyle, Pressable } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../../theme';
import { glass } from '../../theme/liquid-glass';

interface GlassInputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  onRightIconPress?: () => void;
  containerStyle?: ViewStyle;
}

export function GlassInput({
  label,
  error,
  icon,
  rightIcon,
  onRightIconPress,
  containerStyle,
  ...inputProps
}: GlassInputProps) {
  const { colors, isDark } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={[{ gap: 6 }, containerStyle]}>
      {label && (
        <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '500', marginLeft: 4 }}>
          {label}
        </Text>
      )}
      <View
        style={[
          glass.input,
          {
            borderColor: error
              ? colors.error
              : focused
                ? colors.primary
                : isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)',
            backgroundColor: error
              ? colors.error + '06'
              : focused
                ? colors.primary + '06'
                : isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.035)',
            borderWidth: focused ? 1.5 : 1,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            minHeight: 52,
            ...(Platform.OS === 'web' ? {
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
            } as any : {}),
          },
        ]}
      >
        {Platform.OS !== 'web' && (
          <BlurView
            intensity={15}
            tint={isDark ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />
        )}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glass }]} />
        {icon && <View style={{ marginRight: 12, zIndex: 1 }}>{icon}</View>}
        <TextInput
          {...inputProps}
          onFocus={(e) => {
            setFocused(true);
            inputProps.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            inputProps.onBlur?.(e);
          }}
          placeholderTextColor={colors.textTertiary}
          style={{
            flex: 1,
            color: colors.text,
            fontSize: 16,
            paddingVertical: 14,
            zIndex: 1,
            ...(Platform.OS === 'web' ? { outline: 'none' } as any : {}),
          }}
        />
        {rightIcon && (
          <Pressable onPress={onRightIconPress} style={{ marginLeft: 12, zIndex: 1 }}>
            {rightIcon}
          </Pressable>
        )}
      </View>
      {error && (
        <Text style={{ color: colors.error, fontSize: 12, marginLeft: 4 }}>
          {error}
        </Text>
      )}
    </View>
  );
}
