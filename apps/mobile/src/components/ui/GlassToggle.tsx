import React from 'react';
import { View, Text, Switch, ViewStyle } from 'react-native';
import { useTheme } from '../../theme';

interface GlassToggleProps {
  label: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  icon?: React.ReactNode;
  style?: ViewStyle;
}

export function GlassToggle({ label, subtitle, value, onValueChange, icon, style }: GlassToggleProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 14,
          paddingHorizontal: 4,
          gap: 14,
        },
        style,
      ]}
    >
      {icon && (
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            backgroundColor: colors.primaryGhost,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>
          {label}
        </Text>
        {subtitle && (
          <Text style={{ color: colors.textTertiary, fontSize: 12, marginTop: 2 }}>
            {subtitle}
          </Text>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor={colors.textInverse === '#FFFFFF' ? '#FFFFFF' : '#111827'}
        ios_backgroundColor={colors.border}
      />
    </View>
  );
}
