import React from 'react';
import {
  View, Text, ScrollView, Alert, Pressable, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../src/theme';
import { GlassCard, GlassButton, GlassBadge } from '../../../src/components/ui';
import { workoutService } from '../../../src/services/workout.service';
import { formatDistance, formatDuration, formatPace, formatHeartRate } from '../../../src/utils/pace';
import { formatDateFull, getDayName } from '../../../src/utils/date';
import { ptBR } from '../../../src/i18n/pt-BR';

export default function WorkoutDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { data: workout, isLoading } = useQuery({
    queryKey: ['workout', id],
    queryFn: () => workoutService.getById(id),
  });

  const completeMutation = useMutation({
    mutationFn: () => workoutService.markComplete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workout', id] });
      queryClient.invalidateQueries({ queryKey: ['weeklyWorkouts'] });
      Alert.alert('Parabéns! 🎉', 'Treino marcado como concluído!');
    },
  });

  if (isLoading || !workout) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.textSecondary, fontSize: 14, marginTop: 12 }}>
          {ptBR.common.loading}
        </Text>
      </View>
    );
  }

  const typeLabel = (ptBR.workout.types as any)[workout.type] || workout.type;
  const statusLabel = (ptBR.workout.status as any)[workout.status] || workout.status;

  const MetricBox = ({ icon, value, label, iconColor }: { icon: string; value: string; label: string; iconColor: string }) => (
    <View style={{ flex: 1, minWidth: '40%' }}>
      <GlassCard intensity="subtle" shadow="sm" padding={16}>
        <View style={{ alignItems: 'center', gap: 6 }}>
          <View style={{
            width: 36, height: 36, borderRadius: 10,
            backgroundColor: `${iconColor}15`,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Ionicons name={icon as any} size={18} color={iconColor} />
          </View>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', letterSpacing: -0.3 }}>
            {value}
          </Text>
          <Text style={{ color: colors.textTertiary, fontSize: 11, fontWeight: '500' }}>
            {label}
          </Text>
        </View>
      </GlassCard>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{
        paddingTop: insets.top + 8,
        paddingHorizontal: 20,
        paddingBottom: 16,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <Pressable
            onPress={() => router.back()}
            style={{
              width: 38, height: 38, borderRadius: 12,
              backgroundColor: colors.primaryGhost,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Ionicons name="chevron-back" size={20} color={colors.primary} />
          </Pressable>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', flex: 1, letterSpacing: -0.2 }}>
            Detalhes do Treino
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Title + Badges */}
        <View style={{ marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            <GlassBadge label={typeLabel} variant="primary" size="sm" />
            <GlassBadge
              label={statusLabel}
              variant={workout.status === 'COMPLETED' ? 'success' : 'default'}
              size="sm"
            />
          </View>
          <Text style={{ color: colors.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5, marginBottom: 4 }}>
            {workout.title}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
            {getDayName(workout.scheduledDate)}, {formatDateFull(workout.scheduledDate)}
          </Text>
        </View>

        {/* Description */}
        {workout.description && (
          <GlassCard intensity="medium" shadow="md" padding={20} style={{ marginBottom: 16 }}>
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700', marginBottom: 10 }}>
              Descrição
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 22 }}>
              {workout.description}
            </Text>
          </GlassCard>
        )}

        {/* Targets */}
        <GlassCard intensity="medium" shadow="md" padding={20} style={{ marginBottom: 16 }}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700', marginBottom: 14 }}>
            {ptBR.workout.target}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {workout.targetDistanceMeters && (
              <MetricBox
                icon="map-outline"
                value={formatDistance(workout.targetDistanceMeters)}
                label={ptBR.workout.distance}
                iconColor={colors.primary}
              />
            )}
            {workout.targetDurationSeconds && (
              <MetricBox
                icon="time-outline"
                value={formatDuration(workout.targetDurationSeconds)}
                label={ptBR.workout.duration}
                iconColor={colors.info}
              />
            )}
            {workout.targetPace && (
              <MetricBox
                icon="speedometer-outline"
                value={formatPace(workout.targetPace)}
                label={ptBR.workout.pace}
                iconColor={colors.warning}
              />
            )}
            {workout.heartRateZone && (
              <MetricBox
                icon="heart-outline"
                value={workout.heartRateZone}
                label={ptBR.workout.heartRate}
                iconColor={colors.error}
              />
            )}
          </View>
        </GlassCard>

        {/* Results */}
        {workout.result && (
          <GlassCard intensity="medium" shadow="md" padding={20} style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>
                {ptBR.workout.result}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              <MetricBox
                icon="map-outline"
                value={formatDistance(workout.result.distanceMeters)}
                label={ptBR.workout.distance}
                iconColor={colors.success}
              />
              <MetricBox
                icon="time-outline"
                value={formatDuration(workout.result.durationSeconds)}
                label={ptBR.workout.duration}
                iconColor={colors.success}
              />
              {workout.result.avgPace && (
                <MetricBox
                  icon="speedometer-outline"
                  value={formatPace(workout.result.avgPace)}
                  label={ptBR.workout.pace}
                  iconColor={colors.success}
                />
              )}
              {workout.result.avgHeartRate && (
                <MetricBox
                  icon="heart-outline"
                  value={formatHeartRate(workout.result.avgHeartRate)}
                  label={ptBR.workout.heartRate}
                  iconColor={colors.success}
                />
              )}
            </View>
          </GlassCard>
        )}

        {/* Coach Notes */}
        {workout.coachNotes && (
          <GlassCard intensity="strong" shadow="md" padding={20} style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <View style={{
                width: 28, height: 28, borderRadius: 8,
                backgroundColor: 'rgba(139, 92, 246, 0.1)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name="chatbubble-ellipses-outline" size={14} color="#8B5CF6" />
              </View>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>
                {ptBR.workout.coachNotes}
              </Text>
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 22, fontStyle: 'italic' }}>
              {workout.coachNotes}
            </Text>
          </GlassCard>
        )}

        {/* Action Button */}
        {workout.status === 'SCHEDULED' && (
          <View style={{ marginTop: 8 }}>
            <GlassButton
              title={ptBR.workout.markComplete}
              onPress={() => completeMutation.mutate()}
              loading={completeMutation.isPending}
              fullWidth
              size="lg"
              icon={<Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" />}
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}
