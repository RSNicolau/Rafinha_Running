import React, { useState } from 'react';
import {
  View, Text, ScrollView, Pressable, Alert, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../src/theme';
import { GlassCard, GlassButton, GlassBadge } from '../../../src/components/ui';
import { WorkoutCard } from '../../../src/components/workout/WorkoutCard';
import { api } from '../../../src/services/api';
import { formatDate } from '../../../src/utils/date';
import { ptBR } from '../../../src/i18n/pt-BR';

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'primary' | 'default'> = {
  ACTIVE: 'success',
  COMPLETED: 'primary',
  PAUSED: 'warning',
  DRAFT: 'default',
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Ativo',
  COMPLETED: 'Concluído',
  PAUSED: 'Pausado',
  DRAFT: 'Rascunho',
};

export default function PlanDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [addingWorkout, setAddingWorkout] = useState(false);

  const { data: plan, isLoading } = useQuery({
    queryKey: ['plan', id],
    queryFn: async () => {
      const { data } = await api.get(`/training-plans/${id}`);
      return data;
    },
  });

  const addWorkoutMutation = useMutation({
    mutationFn: async (workoutData: any) => {
      const { data } = await api.post('/workouts', { ...workoutData, planId: id });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plan', id] });
      Alert.alert('Sucesso', 'Treino adicionado ao plano!');
    },
    onError: () => {
      Alert.alert('Erro', 'Falha ao adicionar treino');
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      const { data } = await api.patch(`/training-plans/${id}`, { status });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plan', id] });
    },
    onError: () => {
      Alert.alert('Erro', 'Falha ao atualizar status');
    },
  });

  const handleAddWorkout = () => {
    Alert.alert(
      'Adicionar Treino',
      'Escolha o tipo de treino:',
      [
        {
          text: 'Corrida Leve',
          onPress: () => addWorkoutMutation.mutate({
            title: 'Corrida Leve',
            type: 'EASY_RUN',
            scheduledDate: new Date().toISOString(),
            athleteId: plan?.athleteId,
          }),
        },
        {
          text: 'Treino Intervalado',
          onPress: () => addWorkoutMutation.mutate({
            title: 'Treino Intervalado',
            type: 'INTERVAL',
            scheduledDate: new Date().toISOString(),
            athleteId: plan?.athleteId,
          }),
        },
        {
          text: 'Longão',
          onPress: () => addWorkoutMutation.mutate({
            title: 'Longão',
            type: 'LONG_RUN',
            scheduledDate: new Date().toISOString(),
            athleteId: plan?.athleteId,
          }),
        },
        { text: ptBR.common.cancel, style: 'cancel' },
      ],
    );
  };

  const handleChangeStatus = () => {
    const options = Object.entries(STATUS_LABELS)
      .filter(([key]) => key !== plan?.status)
      .map(([key, label]) => ({
        text: label,
        onPress: () => updateStatusMutation.mutate(key),
      }));

    Alert.alert(
      'Alterar Status',
      `Status atual: ${STATUS_LABELS[plan?.status] || plan?.status}`,
      [
        ...options,
        { text: ptBR.common.cancel, style: 'cancel' },
      ],
    );
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!plan) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.textTertiary} />
        <Text style={{ color: colors.textSecondary, fontSize: 16, marginTop: 12 }}>
          Plano não encontrado
        </Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 20, padding: 12 }}>
          <Text style={{ color: colors.primary, fontWeight: '600' }}>Voltar</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{
        paddingTop: insets.top + 8,
        paddingHorizontal: 20,
        paddingBottom: 12,
        borderBottomWidth: 0.5,
        borderBottomColor: colors.glassBorder,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}>
        <Pressable
          onPress={() => router.back()}
          style={{
            width: 38, height: 38, borderRadius: 12,
            backgroundColor: colors.glass,
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 0.5, borderColor: colors.glassBorder,
          }}
        >
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </Pressable>
        <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text, flex: 1, letterSpacing: -0.2 }} numberOfLines={1}>
          {plan.name}
        </Text>
        <Pressable onPress={handleChangeStatus} style={{ padding: 6 }}>
          <Ionicons name="ellipsis-vertical" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Plan Header */}
        <GlassCard intensity="medium" shadow="md" padding={20} style={{ marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={{ fontSize: 20, fontWeight: '700', letterSpacing: -0.3, color: colors.text, marginBottom: 6 }}>
                {plan.name}
              </Text>
              {plan.description && (
                <Text style={{ fontSize: 14, color: colors.textSecondary, lineHeight: 20 }}>
                  {plan.description}
                </Text>
              )}
            </View>
            <GlassBadge
              label={STATUS_LABELS[plan.status] || plan.status}
              variant={STATUS_VARIANTS[plan.status] || 'default'}
            />
          </View>

          {(plan.startDate || plan.endDate) && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="calendar-outline" size={14} color={colors.textTertiary} />
              <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                {formatDate(plan.startDate)} — {formatDate(plan.endDate)}
              </Text>
            </View>
          )}
        </GlassCard>

        {/* Progress */}
        <GlassCard intensity="medium" shadow="md" padding={20} style={{ marginBottom: 20 }}>
          <Text style={{
            fontSize: 13, fontWeight: '600', color: colors.textTertiary,
            letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 12,
          }}>
            {ptBR.plan.progress}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <View style={{
              flex: 1, height: 8, backgroundColor: colors.divider,
              borderRadius: 100, overflow: 'hidden',
            }}>
              <View style={{
                height: '100%',
                width: `${plan.completionPercentage || 0}%`,
                backgroundColor: plan.completionPercentage >= 100 ? colors.success : colors.primary,
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

          {/* Workout counts */}
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <View style={{ flex: 1, alignItems: 'center', padding: 10, backgroundColor: colors.glass, borderRadius: 10, borderWidth: 0.5, borderColor: colors.glassBorder }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>
                {plan.workouts?.filter((w: any) => w.status === 'COMPLETED').length || 0}
              </Text>
              <Text style={{ fontSize: 11, color: colors.success, fontWeight: '600', marginTop: 2 }}>Concluídos</Text>
            </View>
            <View style={{ flex: 1, alignItems: 'center', padding: 10, backgroundColor: colors.glass, borderRadius: 10, borderWidth: 0.5, borderColor: colors.glassBorder }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>
                {plan.workouts?.filter((w: any) => w.status === 'SCHEDULED').length || 0}
              </Text>
              <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '600', marginTop: 2 }}>Planejados</Text>
            </View>
            <View style={{ flex: 1, alignItems: 'center', padding: 10, backgroundColor: colors.glass, borderRadius: 10, borderWidth: 0.5, borderColor: colors.glassBorder }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>
                {plan.workouts?.length || 0}
              </Text>
              <Text style={{ fontSize: 11, color: colors.textTertiary, fontWeight: '600', marginTop: 2 }}>Total</Text>
            </View>
          </View>
        </GlassCard>

        {/* Workouts */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <Text style={{
            fontSize: 13, fontWeight: '600', color: colors.textTertiary,
            letterSpacing: 0.5, textTransform: 'uppercase',
          }}>
            Treinos ({plan.workouts?.length || 0})
          </Text>
        </View>

        <View style={{ gap: 10, marginBottom: 20 }}>
          {plan.workouts?.length > 0 ? (
            plan.workouts.map((workout: any) => (
              <WorkoutCard key={workout.id} workout={workout} onPress={() => {}} />
            ))
          ) : (
            <GlassCard intensity="subtle" shadow="sm" padding={32}>
              <View style={{ alignItems: 'center' }}>
                <Ionicons name="fitness-outline" size={40} color={colors.textTertiary} />
                <Text style={{ fontSize: 15, color: colors.textSecondary, marginTop: 12, textAlign: 'center' }}>
                  Nenhum treino neste plano ainda.
                </Text>
              </View>
            </GlassCard>
          )}
        </View>

        <GlassButton
          title={addWorkoutMutation.isPending ? 'Adicionando...' : 'Adicionar Treino'}
          onPress={handleAddWorkout}
          loading={addWorkoutMutation.isPending}
          variant="secondary"
          fullWidth
          icon={<Ionicons name="add-outline" size={20} color={colors.text} />}
        />
      </ScrollView>
    </View>
  );
}
