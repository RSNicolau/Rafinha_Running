import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../src/theme';
import { spacing, typography } from '../../src/theme';
import { GlassCard, GlassBadge, StatCard } from '../../src/components/ui';
import { api } from '../../src/services/api';
import { formatBRL } from '../../src/utils/currency';

export default function AdminSubscriptionsScreen() {
  const { colors } = useTheme();

  const { data: analytics, isLoading } = useQuery({
    queryKey: ['adminAnalytics'],
    queryFn: async () => {
      const { data } = await api.get('/admin/analytics');
      return data;
    },
  });

  const { data: plansConfig } = useQuery({
    queryKey: ['adminPlansConfig'],
    queryFn: async () => {
      const { data } = await api.get('/admin/config/plans');
      return data;
    },
  });

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const activeCount = analytics?.activeSubscriptions || 0;
  const totalRevenue = analytics?.totalRevenueCents || 0;
  const totalUsers = analytics?.totalUsers || 0;
  const cancelled = analytics?.cancelledSubscriptions || 0;

  const coachPlans: any[] = plansConfig?.coach || [];
  const athletePlans: any[] = plansConfig?.athlete || [];
  const allPlans = [...coachPlans, ...athletePlans];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.title, { color: colors.text }]}>Gerenciar Assinaturas</Text>

        {/* Summary Stats */}
        <View style={styles.statsRow}>
          <StatCard
            icon={<Ionicons name="checkmark-circle-outline" size={20} color={colors.success} />}
            value={activeCount}
            label="Ativas"
            style={styles.stat}
          />
          <StatCard
            icon={<Ionicons name="cash-outline" size={20} color={colors.warning} />}
            value={formatBRL(totalRevenue)}
            label="Receita Total"
            style={styles.stat}
          />
          <StatCard
            icon={<Ionicons name="close-circle-outline" size={20} color={colors.error} />}
            value={cancelled}
            label="Canceladas"
            style={styles.stat}
          />
        </View>

        {/* Plans from config */}
        {allPlans.length > 0 ? (
          allPlans.map((plan: any, i: number) => (
            <GlassCard key={i} intensity="subtle" shadow="sm" style={styles.planCard}>
              <View style={styles.planHeader}>
                <View style={styles.planInfo}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{plan.name}</Text>
                  <Text style={[styles.price, { color: colors.primary }]}>
                    {formatBRL(plan.price * 100)}
                  </Text>
                </View>
                <GlassBadge
                  label={plan.active !== false ? 'Ativo' : 'Inativo'}
                  variant={plan.active !== false ? 'success' : 'default'}
                />
              </View>
              {plan.description ? (
                <Text style={[styles.cardSub, { color: colors.textSecondary }]}>
                  {plan.description}
                </Text>
              ) : null}
            </GlassCard>
          ))
        ) : (
          <>
            {/* Fallback static display if no plans configured */}
            <GlassCard intensity="subtle" shadow="sm" style={styles.planCard}>
              <View style={styles.planHeader}>
                <View style={styles.planInfo}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Coach Mensal</Text>
                  <Text style={[styles.price, { color: colors.primary }]}>R$49,90</Text>
                </View>
                <GlassBadge label="Ativo" variant="success" />
              </View>
              <View style={styles.planMeta}>
                <Text style={[styles.cardSub, { color: colors.textSecondary }]}>
                  Treinador — assinatura mensal
                </Text>
                <GlassBadge label="Mensal" variant="primary" size="sm" />
              </View>
            </GlassCard>

            <GlassCard intensity="subtle" shadow="sm" style={styles.planCard}>
              <View style={styles.planHeader}>
                <View style={styles.planInfo}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Atleta Mensal</Text>
                  <Text style={[styles.price, { color: colors.primary }]}>R$29,90</Text>
                </View>
                <GlassBadge label="Ativo" variant="success" />
              </View>
              <View style={styles.planMeta}>
                <Text style={[styles.cardSub, { color: colors.textSecondary }]}>
                  Atleta — assinatura mensal
                </Text>
                <GlassBadge label="Mensal" variant="info" size="sm" />
              </View>
            </GlassCard>
          </>
        )}

        {/* Conversion */}
        <GlassCard intensity="medium" shadow="md" style={{ ...styles.planCard, alignItems: 'center' }}>
          <Text style={[styles.cardTitle, { color: colors.text, marginBottom: 4 }]}>Taxa de Conversão</Text>
          <Text style={{ fontSize: 36, fontWeight: '800', color: colors.primary }}>
            {analytics?.conversionRate || 0}%
          </Text>
          <Text style={[styles.cardSub, { color: colors.textSecondary }]}>
            {activeCount} de {totalUsers} usuários com assinatura ativa
          </Text>
        </GlassCard>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: spacing.base, paddingBottom: spacing['3xl'] },
  title: { ...typography.h2, marginBottom: spacing.xl },
  statsRow: {
    flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl,
  },
  stat: { flex: 1 },
  planCard: { marginBottom: spacing.sm },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm },
  planInfo: { flex: 1 },
  cardTitle: { ...typography.bodyMedium },
  price: { ...typography.h4, marginTop: spacing.xs },
  planMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardSub: { ...typography.bodySm },
});
