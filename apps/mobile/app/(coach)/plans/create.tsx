import React, { useState } from 'react';
import { View, Text, ScrollView, Alert, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../src/theme';
import { GlassCard, GlassButton, GlassInput, GlassHeader, GlassBadge } from '../../../src/components/ui';
import { api } from '../../../src/services/api';
import { ptBR } from '../../../src/i18n/pt-BR';

const AI_GOALS = [
  { value: 'BASE_BUILDING', label: 'Base aeróbica', icon: 'fitness-outline' as const },
  { value: 'RACE_PREP_5K', label: 'Preparação 5K', icon: 'flag-outline' as const },
  { value: 'RACE_PREP_10K', label: 'Preparação 10K', icon: 'flag-outline' as const },
  { value: 'RACE_PREP_HALF', label: 'Meia maratona', icon: 'trophy-outline' as const },
  { value: 'RACE_PREP_MARATHON', label: 'Maratona', icon: 'trophy-outline' as const },
  { value: 'IMPROVE_PACE', label: 'Melhora de pace', icon: 'speedometer-outline' as const },
  { value: 'WEIGHT_LOSS', label: 'Emagrecimento', icon: 'body-outline' as const },
  { value: 'RECOVERY', label: 'Recuperação', icon: 'leaf-outline' as const },
];

export default function CreatePlanScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'manual' | 'ai'>('manual');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [frequency, setFrequency] = useState('4');
  const [athleteId, setAthleteId] = useState('');

  // AI fields
  const [aiGoal, setAiGoal] = useState('RACE_PREP_10K');
  const [aiWeeks, setAiWeeks] = useState('8');

  const mutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/training-plans', {
        athleteId,
        name,
        description,
        startDate,
        endDate,
        weeklyFrequency: parseInt(frequency),
      });
      return data;
    },
    onSuccess: () => {
      Alert.alert('Sucesso', 'Plano de treino criado!');
      router.back();
    },
    onError: () => {
      Alert.alert('Erro', 'Erro ao criar plano de treino');
    },
  });

  const aiMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/ai-training/generate', {
        athleteId,
        weeks: parseInt(aiWeeks),
        goal: aiGoal,
        startDate: startDate || undefined,
      });
      return data;
    },
    onSuccess: (data) => {
      Alert.alert(
        'Plano gerado! 🎯',
        `${data.planName}\n\n${data.generatedWorkouts} treinos criados para ${data.weeks} semanas.\n\nPace médio: ${data.analysis?.avgPace || '--'} /km`,
      );
      router.back();
    },
    onError: () => {
      Alert.alert('Erro', 'Falha ao gerar plano com IA. Verifique o ID do atleta.');
    },
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <GlassHeader
        title="Criar Plano"
        leftIcon={<Ionicons name="arrow-back" size={24} color={colors.text} />}
        onLeftPress={() => router.back()}
      />
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Mode Toggle */}
        <View style={{
          flexDirection: 'row', gap: 8, marginBottom: 20,
          backgroundColor: colors.text + '06',
          borderRadius: 14, padding: 4,
        }}>
          {(['manual', 'ai'] as const).map((m) => (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              style={{
                flex: 1, paddingVertical: 10, borderRadius: 11,
                alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6,
                backgroundColor: mode === m ? colors.surface : 'transparent',
                shadowColor: mode === m ? '#000' : 'transparent',
                shadowOpacity: 0.06,
                shadowRadius: 8,
              }}
            >
              <Ionicons
                name={m === 'ai' ? 'sparkles' : 'create-outline'}
                size={16}
                color={mode === m ? (m === 'ai' ? colors.primary : colors.text) : colors.textTertiary}
              />
              <Text style={{
                fontSize: 13, fontWeight: '600',
                color: mode === m ? (m === 'ai' ? colors.primary : colors.text) : colors.textTertiary,
              }}>
                {m === 'ai' ? 'Gerar com IA' : 'Manual'}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Athlete ID (shared) */}
        <GlassCard intensity="subtle" padding={16} style={{ marginBottom: 16 }}>
          <GlassInput
            label="ID do Atleta"
            value={athleteId}
            onChangeText={setAthleteId}
            placeholder="UUID do atleta"
            icon={<Ionicons name="person-outline" size={18} color={colors.textTertiary} />}
          />
        </GlassCard>

        {mode === 'ai' ? (
          /* ── AI Mode ── */
          <GlassCard intensity="strong" shadow="lg" padding={24}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <View style={{
                width: 40, height: 40, borderRadius: 12,
                backgroundColor: colors.primaryGhost,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name="sparkles" size={20} color={colors.primary} />
              </View>
              <View>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>IA de Treinos</Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary }}>Plano personalizado baseado nos dados do atleta</Text>
              </View>
            </View>

            {/* Goal selector */}
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
              Objetivo
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
              {AI_GOALS.map((g) => (
                <Pressable
                  key={g.value}
                  onPress={() => setAiGoal(g.value)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    paddingHorizontal: 14, paddingVertical: 8,
                    borderRadius: 100,
                    borderWidth: 1.5,
                    borderColor: aiGoal === g.value ? colors.primary : colors.glassBorder,
                    backgroundColor: aiGoal === g.value ? colors.primaryGhost : 'transparent',
                  }}
                >
                  <Ionicons name={g.icon} size={14} color={aiGoal === g.value ? colors.primary : colors.textTertiary} />
                  <Text style={{
                    fontSize: 13, fontWeight: '500',
                    color: aiGoal === g.value ? colors.primary : colors.textSecondary,
                  }}>
                    {g.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
              <View style={{ flex: 1 }}>
                <GlassInput
                  label="Semanas"
                  value={aiWeeks}
                  onChangeText={setAiWeeks}
                  keyboardType="numeric"
                  placeholder="8"
                  icon={<Ionicons name="calendar-outline" size={18} color={colors.textTertiary} />}
                />
              </View>
              <View style={{ flex: 1 }}>
                <GlassInput
                  label="Início (opcional)"
                  value={startDate}
                  onChangeText={setStartDate}
                  placeholder="2026-04-07"
                  icon={<Ionicons name="today-outline" size={18} color={colors.textTertiary} />}
                />
              </View>
            </View>

            <GlassButton
              title="Gerar Plano com IA"
              onPress={() => aiMutation.mutate()}
              loading={aiMutation.isPending}
              fullWidth
              size="lg"
              icon={<Ionicons name="sparkles" size={18} color="#FFF" />}
            />
          </GlassCard>
        ) : (
          /* ── Manual Mode ── */
          <GlassCard intensity="strong" shadow="lg" padding={24}>
            <Text style={{
              fontSize: 20, fontWeight: '700', letterSpacing: -0.3,
              color: colors.text, marginBottom: 24,
            }}>
              Novo Plano de Treino
            </Text>

            <GlassInput
              label={ptBR.plan.name}
              value={name}
              onChangeText={setName}
              placeholder="Ex: Preparação 10km"
              icon={<Ionicons name="clipboard-outline" size={18} color={colors.textTertiary} />}
              containerStyle={{ marginBottom: 16 }}
            />
            <GlassInput
              label={ptBR.plan.description}
              value={description}
              onChangeText={setDescription}
              placeholder="Descrição do plano"
              icon={<Ionicons name="document-text-outline" size={18} color={colors.textTertiary} />}
              containerStyle={{ marginBottom: 16 }}
            />
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
              <View style={{ flex: 1 }}>
                <GlassInput
                  label={ptBR.plan.startDate}
                  value={startDate}
                  onChangeText={setStartDate}
                  placeholder="2026-03-01"
                  icon={<Ionicons name="calendar-outline" size={18} color={colors.textTertiary} />}
                />
              </View>
              <View style={{ flex: 1 }}>
                <GlassInput
                  label={ptBR.plan.endDate}
                  value={endDate}
                  onChangeText={setEndDate}
                  placeholder="2026-06-01"
                  icon={<Ionicons name="calendar-outline" size={18} color={colors.textTertiary} />}
                />
              </View>
            </View>
            <GlassInput
              label={ptBR.plan.frequency}
              value={frequency}
              onChangeText={setFrequency}
              keyboardType="numeric"
              icon={<Ionicons name="repeat-outline" size={18} color={colors.textTertiary} />}
              containerStyle={{ marginBottom: 28 }}
            />
            <GlassButton
              title={ptBR.plan.create}
              onPress={() => mutation.mutate()}
              loading={mutation.isPending}
              fullWidth
              size="lg"
            />
          </GlassCard>
        )}
      </ScrollView>
    </View>
  );
}
