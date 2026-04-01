import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme';
import { spacing, typography } from '../../src/theme';
import { GlassCard, GlassBadge, StatCard } from '../../src/components/ui';

export default function AdminSubscriptionsScreen() {
  const { colors } = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.title, { color: colors.text }]}>Gerenciar Assinaturas</Text>

        {/* Summary Stats */}
        <View style={styles.statsRow}>
          <StatCard
            icon={<Ionicons name="checkmark-circle-outline" size={20} color={colors.success} />}
            value={199}
            label="Ativas"
            style={styles.stat}
          />
          <StatCard
            icon={<Ionicons name="cash-outline" size={20} color={colors.warning} />}
            value="R$12,4k"
            label="Receita/mês"
            style={styles.stat}
          />
          <StatCard
            icon={<Ionicons name="close-circle-outline" size={20} color={colors.error} />}
            value={14}
            label="Canceladas"
            style={styles.stat}
          />
        </View>

        {/* Plano Mensal */}
        <GlassCard intensity="subtle" shadow="sm" style={styles.planCard}>
          <View style={styles.planHeader}>
            <View style={styles.planInfo}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Plano Mensal</Text>
              <Text style={[styles.price, { color: colors.primary }]}>R$49,90</Text>
            </View>
            <GlassBadge label="Ativo" variant="success" />
          </View>
          <View style={styles.planMeta}>
            <Text style={[styles.cardSub, { color: colors.textSecondary }]}>
              152 assinantes ativos
            </Text>
            <GlassBadge label="Mensal" variant="primary" size="sm" />
          </View>
        </GlassCard>

        {/* Plano Anual */}
        <GlassCard intensity="subtle" shadow="sm" style={styles.planCard}>
          <View style={styles.planHeader}>
            <View style={styles.planInfo}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Plano Anual</Text>
              <Text style={[styles.price, { color: colors.primary }]}>R$479,90</Text>
            </View>
            <GlassBadge label="Ativo" variant="success" />
          </View>
          <View style={styles.planMeta}>
            <Text style={[styles.cardSub, { color: colors.textSecondary }]}>
              47 assinantes ativos
            </Text>
            <GlassBadge label="Anual" variant="info" size="sm" />
          </View>
        </GlassCard>

        {/* Trial */}
        <GlassCard intensity="subtle" shadow="sm" style={styles.planCard}>
          <View style={styles.planHeader}>
            <View style={styles.planInfo}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Período de Teste</Text>
              <Text style={[styles.price, { color: colors.textSecondary }]}>Gratuito</Text>
            </View>
            <GlassBadge label="Trial" variant="primary" />
          </View>
          <View style={styles.planMeta}>
            <Text style={[styles.cardSub, { color: colors.textSecondary }]}>
              23 em teste ativo
            </Text>
            <GlassBadge label="7 dias" variant="warning" size="sm" />
          </View>
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
