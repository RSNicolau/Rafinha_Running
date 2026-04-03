import React from 'react';
import { View, Text, ViewStyle } from 'react-native';
import { GlassCard } from './GlassCard';
import { useTheme } from '../../theme';

interface StatCardProps {
  icon?: React.ReactNode;
  value: string | number;
  label: string;
  trend?: { value: string; positive: boolean };
  style?: ViewStyle;
  compact?: boolean;
}

export function StatCard({ icon, value, label, trend, style, compact = false }: StatCardProps) {
  const { colors } = useTheme();

  return (
    <GlassCard
      intensity="subtle"
      shadow="sm"
      padding={compact ? 14 : 18}
      style={{ alignItems: 'center', ...style }}
    >
      {icon && (
        <View
          style={{
            width: compact ? 32 : 40,
            height: compact ? 32 : 40,
            borderRadius: compact ? 9 : 12,
            backgroundColor: colors.primaryGhost,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: compact ? 8 : 12,
          }}
        >
          {icon}
        </View>
      )}
      <Text
        style={{
          color: colors.text,
          fontSize: compact ? 20 : 26,
          fontWeight: '700',
          letterSpacing: -0.5,
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          color: colors.textTertiary,
          fontSize: compact ? 11 : 12,
          fontWeight: '500',
          marginTop: 4,
          textTransform: 'lowercase',
        }}
      >
        {label}
      </Text>
      {trend && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: 6,
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 6,
            backgroundColor: trend.positive
              ? 'rgba(16, 185, 129, 0.1)'
              : 'rgba(239, 68, 68, 0.1)',
          }}
        >
          <Text
            style={{
              fontSize: 11,
              fontWeight: '600',
              color: trend.positive ? colors.success : colors.error,
            }}
          >
            {trend.positive ? '↑' : '↓'} {trend.value}
          </Text>
        </View>
      )}
    </GlassCard>
  );
}
