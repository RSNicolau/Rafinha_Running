import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../src/theme';
import { GlassCard, GlassButton, GlassBadge, GlassHeader } from '../../../src/components/ui';
import { WorkoutCard } from '../../../src/components/workout/WorkoutCard';
import { api } from '../../../src/services/api';
import { formatDate } from '../../../src/utils/date';
import { ptBR } from '../../../src/i18n/pt-BR';

export default function PlanDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const { data: plan } = useQuery({
    queryKey: ['plan', id],
    queryFn: async () => {
      const { data } = await api.get(`/training-plans/${id}`);
      return data;
    },
  });

  if (!plan) return (
    <View style={{ flex: 1, backgroundColor: colors.background }} />
  );

  const statusColors: Record<string, 'success' | 'warning' | 'primary' | 'default'> = {
    ACTIVE: 'success', COMPLETED: 'primary', PAUSED: 'warning', DRAFT: 'default',
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <GlassHeader
        title={plan.name}
        showBack
        onBack={() => router.back()}
      />
      <ScrollView
        contentContainerStyle={{
          padding: 20,
          paddingBottom: insets.bottom + 40,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Plan Header */}
        <View style={{ marginBottom: 24 }}>
          <GlassBadge
            text={(ptBR.plan as any)[plan.status?.toLowerCase()] || plan.status}
            variant={statusColors[plan.status] || 'default'}
          />
          <Text style={{
            fontSize: 13, color: colors.textSecondary, marginTop: 10,
          }}>
            {formatDate(plan.startDate)} - {formatDate(plan.endDate)}
          </Text>
          {plan.description && (
            <Text style={{
              fontSize: 14, color: colors.textSecondary, marginTop: 8, lineHeight: 20,
            }}>
              {plan.description}
            </Text>
          )}
        </View>

        {/* Progress */}
        <GlassCard intensity="medium" shadow="md" padding={20} style={{ marginBottom: 24 }}>
          <Text style={{
            fontSize: 13, fontWeight: '600', color: colors.textTertiary,
            letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 12,
          }}>
            {ptBR.plan.progress}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{
              flex: 1, height: 8, backgroundColor: colors.divider,
              borderRadius: 100, overflow: 'hidden',
            }}>
              <View style={{
                height: '100%',
                width: `${plan.completionPercentage || 0}%`,
                backgroundColor: colors.primary,
                borderRadius: 100,
              }} />
            </View>
            <Text style={{
              fontSize: 16, fontWeight: '700', color: colors.primary,
              minWidth: 44, textAlign: 'right',
            }}>
              {plan.completionPercentage || 0}%
            </Text>
          </View>
        </GlassCard>

        {/* Workouts */}
        <Text style={{
          fontSize: 13, fontWeight: '600', color: colors.textTertiary,
          letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 12,
        }}>
          Treinos ({plan.workouts?.length || 0})
        </Text>
        <View style={{ gap: 10, marginBottom: 20 }}>
          {plan.workouts?.map((workout: any) => (
            <WorkoutCard key={workout.id} workout={workout} onPress={() => {}} />
          ))}
        </View>

        <GlassButton
          title="Adicionar Treino"
          onPress={() => {}}
          variant="secondary"
          fullWidth
          icon={<Ionicons name="add-outline" size={20} color={colors.text} />}
        />
      </ScrollView>
    </View>
  );
}
