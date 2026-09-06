/**
 * RecoveryBadge
 *
 * Displays a Garmin-style recovery / readiness indicator with a traffic-light
 * colour (green / yellow / red) and an optional HRV + sleep value pair.
 *
 * Usage:
 *   <RecoveryBadge hrv={62} sleepScore={78} />
 *   <RecoveryBadge status="good" />
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme';

export type RecoveryStatus = 'good' | 'moderate' | 'poor';

interface RecoveryBadgeProps {
  /** Explicit status — derived automatically from hrv when omitted */
  status?: RecoveryStatus;
  /** Heart-rate variability in ms */
  hrv?: number;
  /** Sleep score 0–100 */
  sleepScore?: number;
  /** Training Stress Balance (TSB) — positive = fresh, negative = fatigued */
  tsb?: number;
  size?: 'sm' | 'md' | 'lg';
}

function deriveStatus(hrv?: number, tsb?: number): RecoveryStatus {
  if (tsb !== undefined) {
    if (tsb >= 5) return 'good';
    if (tsb >= -10) return 'moderate';
    return 'poor';
  }
  if (hrv !== undefined) {
    if (hrv >= 60) return 'good';
    if (hrv >= 40) return 'moderate';
    return 'poor';
  }
  return 'moderate';
}

const STATUS_CONFIG: Record<
  RecoveryStatus,
  { emoji: string; label: string; color: string; bg: string }
> = {
  good: {
    emoji: '🟢',
    label: 'Pronto',
    color: '#10B981',
    bg: 'rgba(16, 185, 129, 0.12)',
  },
  moderate: {
    emoji: '🟡',
    label: 'Moderado',
    color: '#F59E0B',
    bg: 'rgba(245, 158, 11, 0.12)',
  },
  poor: {
    emoji: '🔴',
    label: 'Recuperar',
    color: '#EF4444',
    bg: 'rgba(239, 68, 68, 0.12)',
  },
};

export function RecoveryBadge({
  status,
  hrv,
  sleepScore,
  tsb,
  size = 'md',
}: RecoveryBadgeProps) {
  const { colors } = useTheme();
  const resolved = status ?? deriveStatus(hrv, tsb);
  const cfg = STATUS_CONFIG[resolved];

  const isSmall = size === 'sm';
  const isLarge = size === 'lg';

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: cfg.bg,
          borderColor: cfg.color + '33',
          paddingHorizontal: isSmall ? 8 : isLarge ? 16 : 12,
          paddingVertical: isSmall ? 4 : isLarge ? 10 : 6,
          gap: isSmall ? 4 : 6,
        },
      ]}
    >
      {/* Traffic-light dot */}
      <View
        style={[
          styles.dot,
          {
            width: isSmall ? 8 : isLarge ? 14 : 10,
            height: isSmall ? 8 : isLarge ? 14 : 10,
            borderRadius: isSmall ? 4 : isLarge ? 7 : 5,
            backgroundColor: cfg.color,
          },
        ]}
      />

      <Text
        style={[
          styles.label,
          {
            color: cfg.color,
            fontSize: isSmall ? 11 : isLarge ? 15 : 13,
            fontWeight: isLarge ? '700' : '600',
          },
        ]}
      >
        {cfg.label}
      </Text>

      {/* Optional HRV chip */}
      {hrv !== undefined && !isSmall && (
        <View style={[styles.chip, { backgroundColor: cfg.color + '18' }]}>
          <Ionicons name="heart-outline" size={10} color={cfg.color} />
          <Text style={[styles.chipText, { color: cfg.color }]}>
            {hrv} ms
          </Text>
        </View>
      )}

      {/* Optional sleep chip */}
      {sleepScore !== undefined && !isSmall && (
        <View style={[styles.chip, { backgroundColor: cfg.color + '18' }]}>
          <Ionicons name="moon-outline" size={10} color={cfg.color} />
          <Text style={[styles.chipText, { color: cfg.color }]}>
            {sleepScore}%
          </Text>
        </View>
      )}

      {/* Optional TSB chip */}
      {tsb !== undefined && !isSmall && (
        <View style={[styles.chip, { backgroundColor: cfg.color + '18' }]}>
          <Ionicons name="trending-up-outline" size={10} color={cfg.color} />
          <Text style={[styles.chipText, { color: cfg.color }]}>
            TSB {tsb > 0 ? '+' : ''}{tsb}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  dot: {
    // size set inline
  },
  label: {
    letterSpacing: 0.1,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  chipText: {
    fontSize: 10,
    fontWeight: '600',
  },
});
