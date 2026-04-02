import React from 'react';
import {
  View, Text, ScrollView, Pressable, Alert, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../src/theme';
import { GlassCard, GlassButton, GlassAvatar, StatCard, GlassBadge } from '../../../src/components/ui';
import { api } from '../../../src/services/api';
import { ptBR } from '../../../src/i18n/pt-BR';

const LEVEL_BADGES: Record<string, { label: string; variant: 'success' | 'info' | 'warning' | 'primary' }> = {
  BEGINNER: { label: 'Iniciante', variant: 'success' },
  INTERMEDIATE: { label: 'Intermediário', variant: 'info' },
  ADVANCED: { label: 'Avançado', variant: 'warning' },
  ELITE: { label: 'Elite', variant: 'primary' },
};

function formatDate(dateStr: string) {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDistance(meters: number) {
  if (!meters) return '0 km';
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(seconds: number) {
  if (!seconds) return '--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h${m.toString().padStart(2, '0')}min`;
  return `${m}min`;
}

export default function AthleteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['user', id],
    queryFn: async () => {
      const { data } = await api.get(`/users/${id}`);
      return data;
    },
  });

  const { data: workoutHistory } = useQuery({
    queryKey: ['athleteWorkouts', id],
    queryFn: async () => {
      const { data } = await api.get(`/workouts/history`, { params: { athleteId: id, limit: 5 } });
      return data;
    },
    enabled: !!id,
  });

  const { data: athleteStats } = useQuery({
    queryKey: ['athleteStats', id],
    queryFn: async () => {
      const { data } = await api.get(`/workouts/stats`, { params: { athleteId: id } });
      return data;
    },
    enabled: !!id,
  });

  const feedbackMutation = useMutation({
    mutationFn: async (message: string) => {
      const { data } = await api.post('/conversations', {
        participantId: id,
        message,
      });
      return data;
    },
    onSuccess: (data) => {
      const convId = data?.id || data?.conversationId;
      if (convId) {
        router.push(`/(coach)/chat/${convId}`);
      } else {
        router.push('/(coach)/chat');
      }
    },
    onError: () => {
      Alert.alert('Erro', 'Falha ao iniciar conversa');
    },
  });

  const handleSendFeedback = () => {
    Alert.prompt(
      ptBR.coach.sendFeedback,
      'Envie uma mensagem ou feedback ao atleta:',
      [
        { text: ptBR.common.cancel, style: 'cancel' },
        {
          text: 'Enviar',
          onPress: (text) => {
            if (text?.trim()) {
              feedbackMutation.mutate(text.trim());
            } else {
              router.push('/(coach)/chat');
            }
          },
        },
      ],
      'plain-text',
    );
  };

  const handleCreatePlan = () => {
    router.push('/(coach)/plans/create');
  };

  const handleExportReport = () => {
    Alert.alert(
      ptBR.coach.exportReport,
      'O relatório do atleta será gerado e exportado.',
      [
        { text: ptBR.common.cancel, style: 'cancel' },
        {
          text: 'Exportar',
          onPress: async () => {
            try {
              await api.post(`/users/${id}/export-report`);
              Alert.alert('Sucesso', 'Relatório gerado com sucesso!');
            } catch {
              Alert.alert('Exportação', 'Funcionalidade de exportação em desenvolvimento.');
            }
          },
        },
      ],
    );
  };

  if (userLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.textTertiary} />
        <Text style={{ color: colors.textSecondary, fontSize: 16, marginTop: 12 }}>
          Atleta não encontrado
        </Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 20, padding: 12 }}>
          <Text style={{ color: colors.primary, fontWeight: '600' }}>Voltar</Text>
        </Pressable>
      </View>
    );
  }

  const profile = user.athleteProfile;
  const levelInfo = LEVEL_BADGES[profile?.level] || { label: profile?.level || 'Iniciante', variant: 'default' as any };
  const recentWorkouts: any[] = workoutHistory?.data || workoutHistory || [];

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
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, flex: 1, letterSpacing: -0.3 }}>
          Perfil do Atleta
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 60 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Header */}
        <GlassCard intensity="strong" shadow="lg" padding={24} style={{ marginBottom: 20, alignItems: 'center' }}>
          <GlassAvatar name={user.name} size={80} showBorder style={{ marginBottom: 14 }} />
          <Text style={{ fontSize: 24, fontWeight: '700', letterSpacing: -0.3, color: colors.text, marginBottom: 4 }}>
            {user.name}
          </Text>
          <Text style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 12 }}>
            {user.email}
          </Text>
          <GlassBadge label={levelInfo.label} variant={levelInfo.variant} size="md" />
        </GlassCard>

        {/* Stats Row */}
        {athleteStats && (
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
            <StatCard
              icon={<Ionicons name="footsteps-outline" size={18} color={colors.primary} />}
              value={athleteStats.totalKm ? `${Number(athleteStats.totalKm).toFixed(0)}km` : '0km'}
              label="Total"
              compact
              style={{ flex: 1 }}
            />
            <StatCard
              icon={<Ionicons name="fitness-outline" size={18} color={colors.success} />}
              value={String(athleteStats.totalWorkouts || 0)}
              label="Treinos"
              compact
              style={{ flex: 1 }}
            />
            <StatCard
              icon={<Ionicons name="speedometer-outline" size={18} color={colors.info} />}
              value={athleteStats.avgPace || '--'}
              label="Pace"
              compact
              style={{ flex: 1 }}
            />
          </View>
        )}

        {/* Athlete Data */}
        {profile && (
          <View style={{ marginBottom: 20 }}>
            <Text style={{
              fontSize: 13, fontWeight: '600', color: colors.textTertiary,
              letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 12,
            }}>
              Dados do Atleta
            </Text>
            <GlassCard intensity="medium" shadow="sm" padding={16}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {profile.weight && (
                  <View style={{ flex: 1, minWidth: '45%' }}>
                    <Text style={{ fontSize: 11, color: colors.textTertiary, marginBottom: 3 }}>
                      {ptBR.profile.weight}
                    </Text>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>
                      {profile.weight} kg
                    </Text>
                  </View>
                )}
                {profile.height && (
                  <View style={{ flex: 1, minWidth: '45%' }}>
                    <Text style={{ fontSize: 11, color: colors.textTertiary, marginBottom: 3 }}>
                      {ptBR.profile.height}
                    </Text>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>
                      {profile.height} cm
                    </Text>
                  </View>
                )}
                {profile.vo2max && (
                  <View style={{ flex: 1, minWidth: '45%' }}>
                    <Text style={{ fontSize: 11, color: colors.textTertiary, marginBottom: 3 }}>
                      {ptBR.profile.vo2max}
                    </Text>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>
                      {profile.vo2max} ml/kg/min
                    </Text>
                  </View>
                )}
                {profile.restingHR && (
                  <View style={{ flex: 1, minWidth: '45%' }}>
                    <Text style={{ fontSize: 11, color: colors.textTertiary, marginBottom: 3 }}>
                      {ptBR.profile.restingHR}
                    </Text>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>
                      {profile.restingHR} bpm
                    </Text>
                  </View>
                )}
                {profile.maxHR && (
                  <View style={{ flex: 1, minWidth: '45%' }}>
                    <Text style={{ fontSize: 11, color: colors.textTertiary, marginBottom: 3 }}>
                      {ptBR.profile.maxHR}
                    </Text>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>
                      {profile.maxHR} bpm
                    </Text>
                  </View>
                )}
                {profile.weeklyGoalKm && (
                  <View style={{ flex: 1, minWidth: '45%' }}>
                    <Text style={{ fontSize: 11, color: colors.textTertiary, marginBottom: 3 }}>
                      {ptBR.profile.weeklyGoal}
                    </Text>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>
                      {profile.weeklyGoalKm} km/sem
                    </Text>
                  </View>
                )}
              </View>
            </GlassCard>
          </View>
        )}

        {/* Recent Workouts */}
        {recentWorkouts.length > 0 && (
          <View style={{ marginBottom: 20 }}>
            <Text style={{
              fontSize: 13, fontWeight: '600', color: colors.textTertiary,
              letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 12,
            }}>
              Treinos Recentes
            </Text>
            <GlassCard intensity="medium" shadow="sm" padding={0}>
              {recentWorkouts.slice(0, 5).map((w: any, i: number) => (
                <React.Fragment key={w.id}>
                  {i > 0 && <View style={{ height: 1, backgroundColor: colors.divider, marginHorizontal: 16 }} />}
                  <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 }}>
                    <View style={{
                      width: 36, height: 36, borderRadius: 10,
                      backgroundColor: w.status === 'COMPLETED' ? colors.success + '15' : colors.primary + '15',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Ionicons
                        name={w.status === 'COMPLETED' ? 'checkmark-circle-outline' : 'time-outline'}
                        size={18}
                        color={w.status === 'COMPLETED' ? colors.success : colors.primary}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }} numberOfLines={1}>
                        {w.title || 'Treino'}
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 1 }}>
                        {formatDate(w.scheduledDate || w.completedAt)}
                        {w.result ? ` · ${formatDistance(w.result.distanceMeters)}` : ''}
                        {w.result?.durationSeconds ? ` · ${formatDuration(w.result.durationSeconds)}` : ''}
                      </Text>
                    </View>
                    <GlassBadge
                      label={w.status === 'COMPLETED' ? 'Feito' : 'Planejado'}
                      variant={w.status === 'COMPLETED' ? 'success' : 'default'}
                      size="sm"
                    />
                  </View>
                </React.Fragment>
              ))}
            </GlassCard>
          </View>
        )}

        {/* Actions */}
        <Text style={{
          fontSize: 13, fontWeight: '600', color: colors.textTertiary,
          letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 12,
        }}>
          Ações
        </Text>
        <View style={{ gap: 10 }}>
          <GlassButton
            title={ptBR.plan.create}
            onPress={handleCreatePlan}
            fullWidth
            icon={<Ionicons name="clipboard-outline" size={18} color="#FFF" />}
          />
          <GlassButton
            title={ptBR.coach.sendFeedback}
            onPress={handleSendFeedback}
            loading={feedbackMutation.isPending}
            variant="secondary"
            fullWidth
            icon={<Ionicons name="chatbubble-outline" size={18} color={colors.text} />}
          />
          <GlassButton
            title={ptBR.coach.exportReport}
            onPress={handleExportReport}
            variant="ghost"
            fullWidth
            icon={<Ionicons name="download-outline" size={18} color={colors.primary} />}
          />
        </View>
      </ScrollView>
    </View>
  );
}
