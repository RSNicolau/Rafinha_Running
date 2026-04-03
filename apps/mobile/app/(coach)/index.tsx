import React from 'react';
import {
  View, Text, ScrollView, Pressable,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme';
import { GlassCard, GlassAvatar, StatCard, GlassBadge } from '../../src/components/ui';
import { api } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/auth.store';
import { ptBR } from '../../src/i18n/pt-BR';

export default function CoachDashboard() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);

  const { data: athletes } = useQuery({
    queryKey: ['coachAthletes'],
    queryFn: async () => {
      const { data } = await api.get('/users/athletes');
      return data;
    },
  });

  const { data: coachStats } = useQuery({
    queryKey: ['coachStats'],
    queryFn: async () => {
      const { data } = await api.get('/users/athletes/stats');
      return data;
    },
  });

  const { data: alerts } = useQuery({
    queryKey: ['coachAlerts'],
    queryFn: async () => {
      const { data } = await api.get('/users/athletes/alerts');
      return data;
    },
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{
          padding: 20,
          paddingBottom: insets.bottom + 100,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Greeting */}
        <Text style={{
          fontSize: 26, fontWeight: '700', letterSpacing: -0.5,
          color: colors.text, marginBottom: 4,
        }}>
          {ptBR.dashboard.greeting}, {user?.name?.split(' ')[0]}
        </Text>
        <Text style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 24 }}>
          Painel do treinador
        </Text>

        {/* Quick Stats */}
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
          <StatCard
            icon={<Ionicons name="people-outline" size={20} color={colors.primary} />}
            value={String(athletes?.length || 0)}
            label="Atletas"
            style={{ flex: 1 }}
          />
          <StatCard
            icon={<Ionicons name="alert-circle-outline" size={20} color={colors.warning} />}
            value={String(coachStats?.alertCount ?? '--')}
            label="Alertas"
            style={{ flex: 1 }}
          />
          <StatCard
            icon={<Ionicons name="checkmark-circle-outline" size={20} color={colors.success} />}
            value={coachStats ? `${coachStats.adherencePercent}%` : '--'}
            label="Adesão"
            style={{ flex: 1 }}
          />
        </View>

        {/* Alerts Section */}
        <Text style={{
          fontSize: 13, fontWeight: '600', color: colors.textTertiary,
          letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 12,
        }}>
          {ptBR.coach.alerts}
        </Text>
        <GlassCard intensity="medium" shadow="md" padding={0} style={{ marginBottom: 24 }}>
          {alerts && alerts.length > 0 ? (
            alerts.slice(0, 5).map((alert: any, i: number) => (
              <React.Fragment key={alert.athleteId}>
                {i > 0 && <View style={{ height: 1, backgroundColor: colors.divider, marginHorizontal: 16 }} />}
                <Pressable
                  style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16 }}
                  onPress={() => router.push(`/(coach)/athletes/${alert.athleteId}`)}
                >
                  <View style={{
                    width: 36, height: 36, borderRadius: 10,
                    backgroundColor: colors.warningLight,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Ionicons name="warning-outline" size={18} color={colors.warning} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '500', color: colors.text }}>
                      {alert.name} perdeu {alert.missedCount} treino{alert.missedCount > 1 ? 's' : ''}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 2 }}>
                      Último em {new Date(alert.lastMissedDate).toLocaleDateString('pt-BR')}
                    </Text>
                  </View>
                </Pressable>
              </React.Fragment>
            ))
          ) : (
            <View style={{ padding: 24, alignItems: 'center' }}>
              <Ionicons name="checkmark-circle-outline" size={32} color={colors.success} />
              <Text style={{ fontSize: 14, color: colors.textSecondary, marginTop: 8, textAlign: 'center' }}>
                Nenhum alerta no momento
              </Text>
            </View>
          )}
        </GlassCard>

        {/* Athletes Overview */}
        <View style={{
          flexDirection: 'row', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: 12,
        }}>
          <Text style={{
            fontSize: 13, fontWeight: '600', color: colors.textTertiary,
            letterSpacing: 0.5, textTransform: 'uppercase',
          }}>
            {ptBR.coach.athleteOverview}
          </Text>
          <Pressable onPress={() => router.push('/(coach)/athletes')}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>
              {ptBR.common.seeAll}
            </Text>
          </Pressable>
        </View>

        {athletes?.slice(0, 5).map((athlete: any) => (
          <Pressable
            key={athlete.id}
            onPress={() => router.push(`/(coach)/athletes/${athlete.user.id}`)}
          >
            <GlassCard
              intensity="subtle"
              shadow="sm"
              padding={14}
              style={{ marginBottom: 8 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <GlassAvatar
                  name={athlete.user.name}
                  size={42}
                  style={{ marginRight: 12 }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>
                    {athlete.user.name}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 1 }}>
                    {(ptBR.profile.levels as any)[athlete.level] || athlete.level}
                  </Text>
                </View>
                <GlassBadge
                  label="Ativo"
                  variant="success"
                />
              </View>
            </GlassCard>
          </Pressable>
        ))}

        {(!athletes || athletes.length === 0) && (
          <GlassCard intensity="subtle" shadow="sm" padding={32}>
            <View style={{ alignItems: 'center' }}>
              <Ionicons name="people-outline" size={48} color={colors.textTertiary} />
              <Text style={{
                fontSize: 15, color: colors.textSecondary,
                marginTop: 12, textAlign: 'center',
              }}>
                Nenhum atleta cadastrado
              </Text>
            </View>
          </GlassCard>
        )}
      </ScrollView>
    </View>
  );
}
