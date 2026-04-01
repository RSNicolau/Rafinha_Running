import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../src/theme';
import { spacing, typography } from '../../src/theme';
import { StatCard, GlassCard } from '../../src/components/ui';
import { api } from '../../src/services/api';
import { formatBRL } from '../../src/utils/currency';

export default function AdminDashboard() {
  const { colors } = useTheme();

  const { data: analytics } = useQuery({
    queryKey: ['adminAnalytics'],
    queryFn: async () => {
      const { data } = await api.get('/admin/analytics');
      return data;
    },
  });

  const stats = [
    {
      icon: <Ionicons name="people-outline" size={22} color={colors.info} />,
      label: 'Total Usuários',
      value: analytics?.totalUsers || 0,
    },
    {
      icon: <Ionicons name="walk-outline" size={22} color={colors.primary} />,
      label: 'Atletas',
      value: analytics?.athletes || 0,
    },
    {
      icon: <Ionicons name="school-outline" size={22} color="#8b5cf6" />,
      label: 'Treinadores',
      value: analytics?.coaches || 0,
    },
    {
      icon: <Ionicons name="card-outline" size={22} color={colors.success} />,
      label: 'Assinaturas Ativas',
      value: analytics?.activeSubscriptions || 0,
    },
    {
      icon: <Ionicons name="cash-outline" size={22} color={colors.warning} />,
      label: 'Receita Total',
      value: formatBRL(analytics?.totalRevenueCents || 0),
    },
    {
      icon: <Ionicons name="fitness-outline" size={22} color="#f59e0b" />,
      label: 'Treinos Concluídos',
      value: analytics?.workoutsCompleted || 0,
    },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.title, { color: colors.text }]}>Visão Geral</Text>

        <View style={styles.grid}>
          {stats.map((stat) => (
            <StatCard
              key={stat.label}
              icon={stat.icon}
              value={stat.value}
              label={stat.label}
              style={styles.statCard}
            />
          ))}
        </View>

        <GlassCard intensity="medium" shadow="md" style={styles.conversionCard}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Taxa de Conversão</Text>
          <Text style={[styles.conversionValue, { color: colors.primary }]}>
            {analytics?.conversionRate || 0}%
          </Text>
          <Text style={[styles.conversionLabel, { color: colors.textSecondary }]}>
            dos atletas possuem assinatura ativa
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xl },
  statCard: { width: '48%', flexGrow: 1 },
  sectionTitle: { ...typography.h4, marginBottom: spacing.md },
  conversionCard: { alignItems: 'center' },
  conversionValue: { fontSize: 48, fontWeight: '800', marginBottom: spacing.xs },
  conversionLabel: { ...typography.body, textAlign: 'center' },
});
