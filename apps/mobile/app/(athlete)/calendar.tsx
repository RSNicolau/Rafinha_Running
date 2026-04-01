import React, { useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../src/theme';
import { spacing, typography, borderRadius } from '../../src/theme';
import { GlassCard, GlassBadge } from '../../src/components/ui';
import { WorkoutCard } from '../../src/components/workout/WorkoutCard';
import { workoutService } from '../../src/services/workout.service';
import { getWeekStart, getWeekDays, getDayName, formatDateShort, isToday } from '../../src/utils/date';

const WORKOUT_TYPE_BORDER: Record<string, string> = {
  easy: '#22c55e',
  interval: '#ef4444',
  long: '#a855f7',
  rest: 'transparent',
};

const WORKOUT_TYPE_BADGE: Record<string, 'success' | 'error' | 'primary' | 'default'> = {
  easy: 'success',
  interval: 'error',
  long: 'primary',
  rest: 'default',
};

function getWorkoutType(workout: any): string {
  const t = (workout?.type || '').toLowerCase();
  if (t.includes('interval') || t.includes('tiro')) return 'interval';
  if (t.includes('long') || t.includes('longo')) return 'long';
  if (t.includes('rest') || t.includes('descanso')) return 'rest';
  return 'easy';
}

export default function CalendarScreen() {
  const { colors, isDark } = useTheme();
  const [selectedWeek, setSelectedWeek] = useState(getWeekStart());
  const [selectedDay, setSelectedDay] = useState(new Date());

  const weekStart = selectedWeek.toISOString().split('T')[0];
  const weekDays = getWeekDays(selectedWeek);

  const { data: weekData, isLoading } = useQuery({
    queryKey: ['weeklyWorkouts', weekStart],
    queryFn: () => workoutService.getWeekly(weekStart),
  });

  const dayWorkouts = weekData?.workouts?.filter(
    (w: any) => new Date(w.scheduledDate).toDateString() === selectedDay.toDateString()
  ) || [];

  const navigateWeek = (direction: number) => {
    const newWeek = new Date(selectedWeek);
    newWeek.setDate(newWeek.getDate() + direction * 7);
    setSelectedWeek(newWeek);
    setSelectedDay(newWeek);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Week Navigation */}
      <GlassCard intensity="subtle" shadow="sm" padding={0} style={styles.weekNavCard}>
        <View style={styles.weekNav}>
          <TouchableOpacity onPress={() => navigateWeek(-1)} style={styles.navButton}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.weekLabel, { color: colors.text }]}>
            {formatDateShort(weekDays[0])} - {formatDateShort(weekDays[6])}
          </Text>
          <TouchableOpacity onPress={() => navigateWeek(1)} style={styles.navButton}>
            <Ionicons name="chevron-forward" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
      </GlassCard>

      {/* Day Selector */}
      <View style={[styles.daySelector, { borderBottomColor: colors.borderLight }]}>
        {weekDays.map((day) => {
          const isSelected = day.toDateString() === selectedDay.toDateString();
          const dayWorkoutItems = weekData?.workouts?.filter(
            (w: any) => new Date(w.scheduledDate).toDateString() === day.toDateString()
          ) || [];
          const hasWorkout = dayWorkoutItems.length > 0;
          const dayIsToday = isToday(day);
          const firstWorkoutType = dayWorkoutItems[0] ? getWorkoutType(dayWorkoutItems[0]) : 'easy';
          const borderColor = hasWorkout ? WORKOUT_TYPE_BORDER[firstWorkoutType] : 'transparent';

          return (
            <TouchableOpacity
              key={day.toISOString()}
              onPress={() => setSelectedDay(day)}
              style={[
                styles.dayItem,
                isSelected && { backgroundColor: colors.primary },
                hasWorkout && !isSelected && {
                  borderWidth: 1.5,
                  borderColor,
                },
              ]}
            >
              <Text style={[
                styles.dayName,
                { color: isSelected ? colors.textInverse : colors.textSecondary },
              ]}>
                {getDayName(day)}
              </Text>
              <Text style={[
                styles.dayNumber,
                { color: isSelected ? colors.textInverse : colors.text },
                dayIsToday && !isSelected && { color: colors.primary, fontWeight: '700' },
              ]}>
                {day.getDate()}
              </Text>
              {hasWorkout && (
                <View style={[
                  styles.dot,
                  { backgroundColor: isSelected ? colors.textInverse : borderColor },
                ]} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Day Workouts */}
      <ScrollView contentContainerStyle={styles.scroll}>
        {isLoading ? (
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : dayWorkouts.length > 0 ? (
          <View style={styles.workoutList}>
            {dayWorkouts.map((workout: any) => {
              const wType = getWorkoutType(workout);
              return (
                <GlassCard
                  key={workout.id}
                  intensity="medium"
                  shadow="sm"
                  padding={0}
                  style={{ borderWidth: 1.5, borderColor: WORKOUT_TYPE_BORDER[wType] }}
                >
                  <View style={{ padding: spacing.sm }}>
                    <View style={styles.workoutHeader}>
                      <GlassBadge
                        label={workout.type || wType}
                        variant={WORKOUT_TYPE_BADGE[wType]}
                        size="sm"
                      />
                    </View>
                    <WorkoutCard
                      workout={workout}
                      onPress={() => router.push(`/(athlete)/workout/${workout.id}`)}
                    />
                  </View>
                </GlassCard>
              );
            })}
          </View>
        ) : (
          <GlassCard intensity="subtle" shadow="none" style={styles.emptyCard}>
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={48} color={colors.textTertiary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                Nenhum treino neste dia
              </Text>
            </View>
          </GlassCard>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  weekNavCard: { marginHorizontal: spacing.base, marginTop: spacing.sm, marginBottom: spacing.xs },
  weekNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingVertical: spacing.sm,
  },
  navButton: { padding: spacing.sm },
  weekLabel: { ...typography.bodyMedium },
  daySelector: {
    flexDirection: 'row',
    paddingHorizontal: spacing.sm, paddingBottom: spacing.base, paddingTop: spacing.xs,
    borderBottomWidth: 1,
  },
  dayItem: {
    flex: 1, alignItems: 'center', paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg, marginHorizontal: 2,
  },
  dayName: { ...typography.caption, marginBottom: spacing.xs },
  dayNumber: { ...typography.bodyMedium },
  dot: {
    width: 5, height: 5, borderRadius: 3,
    marginTop: spacing.xs,
  },
  scroll: { padding: spacing.base },
  workoutList: { gap: spacing.sm },
  workoutHeader: { marginBottom: spacing.xs },
  emptyCard: { marginTop: spacing['2xl'] },
  emptyState: { alignItems: 'center', paddingVertical: spacing['3xl'] },
  emptyText: { ...typography.body, marginTop: spacing.base },
});
