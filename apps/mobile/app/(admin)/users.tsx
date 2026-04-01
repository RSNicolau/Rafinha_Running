import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../src/theme';
import { spacing, typography, borderRadius } from '../../src/theme';
import { GlassCard, GlassBadge, GlassInput } from '../../src/components/ui';
import { api } from '../../src/services/api';
import { formatDate } from '../../src/utils/date';

export default function AdminUsersScreen() {
  const { colors } = useTheme();
  const [search, setSearch] = useState('');

  const { data } = useQuery({
    queryKey: ['adminUsers', search],
    queryFn: async () => {
      const { data } = await api.get('/admin/users', { params: { search, limit: 50 } });
      return data;
    },
  });

  const roleLabels: Record<string, string> = {
    ATHLETE: 'Atleta', COACH: 'Treinador', ADMIN: 'Admin',
  };
  const roleVariants: Record<string, 'primary' | 'info' | 'warning'> = {
    ATHLETE: 'primary', COACH: 'info', ADMIN: 'warning',
  };

  const getInitials = (name: string) =>
    name
      ?.split(' ')
      .slice(0, 2)
      .map((n) => n.charAt(0).toUpperCase())
      .join('') || '?';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.searchWrapper}>
        <GlassInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar usuário..."
          placeholderTextColor={colors.textTertiary}
          icon={<Ionicons name="search-outline" size={18} color={colors.textTertiary} />}
          containerStyle={styles.searchInput}
        />
      </View>

      <FlatList
        data={data?.data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <GlassCard intensity="subtle" shadow="sm" padding={0}>
            <View style={styles.cardInner}>
              {/* Avatar */}
              <View style={[styles.avatar, { backgroundColor: colors.primaryGhost }]}>
                <Text style={[styles.avatarText, { color: colors.primary }]}>
                  {getInitials(item.name)}
                </Text>
              </View>

              {/* Info */}
              <View style={styles.info}>
                <View style={styles.nameRow}>
                  <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <GlassBadge
                    label={roleLabels[item.role] || item.role}
                    variant={roleVariants[item.role] || 'default'}
                    size="sm"
                  />
                </View>
                <Text style={[styles.email, { color: colors.textSecondary }]}>
                  {item.email}
                </Text>
                <View style={styles.metaRow}>
                  <Text style={[styles.date, { color: colors.textTertiary }]}>
                    Cadastro: {formatDate(item.createdAt)}
                  </Text>
                  <GlassBadge
                    label={item.isActive !== false ? 'Ativo' : 'Inativo'}
                    variant={item.isActive !== false ? 'success' : 'default'}
                    size="sm"
                  />
                </View>
              </View>
            </View>
          </GlassCard>
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchWrapper: { paddingHorizontal: spacing.base, paddingVertical: spacing.sm },
  searchInput: {},
  list: { paddingHorizontal: spacing.base, paddingBottom: spacing['3xl'] },
  cardInner: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.base, paddingVertical: spacing.md, gap: spacing.md,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: { ...typography.bodyMedium, fontWeight: '700' },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  name: { ...typography.bodyMedium, flex: 1, marginRight: spacing.sm },
  email: { ...typography.caption, marginBottom: spacing.xs },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { ...typography.caption },
});
