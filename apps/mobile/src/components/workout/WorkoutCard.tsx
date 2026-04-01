import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography, shadow } from '../../theme';
import { Badge } from '../ui/Badge';
import { formatDistance, formatDuration, formatPace } from '../../utils/pace';
import { ptBR } from '../../i18n/pt-BR';

interface WorkoutCardProps {
  workout: {
    id: string;
    type: string;
    title: string;
    status: string;
    targetDistanceMeters?: number;
    targetDurationSeconds?: number;
    targetPace?: string;
    heartRateZone?: string;
    result?: {
      distanceMeters: number;
      durationSeconds: number;
      avgPace?: string;
    };
  };
  onPress: () => void;
  compact?: boolean;
}

const typeIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
  EASY_RUN: 'walk-outline',
  TEMPO: 'speedometer-outline',
  INTERVAL: 'flash-outline',
  LONG_RUN: 'trail-sign-outline',
  RECOVERY: 'heart-outline',
  RACE: 'trophy-outline',
  CROSS_TRAINING: 'fitness-outline',
  REST: 'bed-outline',
};

const typeColors: Record<string, string> = {
  EASY_RUN: colors.easyRun,
  TEMPO: colors.tempo,
  INTERVAL: colors.interval,
  LONG_RUN: colors.longRun,
  RECOVERY: colors.recovery,
  RACE: colors.race,
  CROSS_TRAINING: colors.crossTraining,
  REST: colors.rest,
};

const statusVariant: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  COMPLETED: 'success',
  SCHEDULED: 'default',
  SKIPPED: 'warning',
  MISSED: 'error',
};

export function WorkoutCard({ workout, onPress, compact = false }: WorkoutCardProps) {
  const typeColor = typeColors[workout.type] || colors.textSecondary;
  const icon = typeIcons[workout.type] || 'fitness-outline';
  const typeLabel = (ptBR.workout.types as any)[workout.type] || workout.type;
  const statusLabel = (ptBR.workout.status as any)[workout.status] || workout.status;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={[styles.card, shadow.sm]}>
      <View style={[styles.typeIndicator, { backgroundColor: typeColor }]} />
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.typeRow}>
            <Ionicons name={icon} size={18} color={typeColor} />
            <Text style={[styles.typeText, { color: typeColor }]}>{typeLabel}</Text>
          </View>
          <Badge text={statusLabel} variant={statusVariant[workout.status]} />
        </View>

        <Text style={styles.title} numberOfLines={1}>{workout.title}</Text>

        {!compact && (
          <View style={styles.metrics}>
            {workout.targetDistanceMeters && (
              <View style={styles.metric}>
                <Ionicons name="map-outline" size={14} color={colors.textSecondary} />
                <Text style={styles.metricText}>
                  {formatDistance(workout.result?.distanceMeters || workout.targetDistanceMeters)}
                </Text>
              </View>
            )}
            {workout.targetDurationSeconds && (
              <View style={styles.metric}>
                <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
                <Text style={styles.metricText}>
                  {formatDuration(workout.result?.durationSeconds || workout.targetDurationSeconds)}
                </Text>
              </View>
            )}
            {(workout.result?.avgPace || workout.targetPace) && (
              <View style={styles.metric}>
                <Ionicons name="speedometer-outline" size={14} color={colors.textSecondary} />
                <Text style={styles.metricText}>
                  {formatPace(workout.result?.avgPace || workout.targetPace)}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  typeIndicator: {
    width: 4,
  },
  content: {
    flex: 1,
    padding: spacing.base,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  typeText: {
    ...typography.captionMedium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: {
    ...typography.bodyMedium,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  metrics: {
    flexDirection: 'row',
    gap: spacing.base,
  },
  metric: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metricText: {
    ...typography.bodySm,
    color: colors.textSecondary,
  },
});
