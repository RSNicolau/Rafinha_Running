import React, { useState } from 'react';
import {
  View, Text, FlatList, Pressable, TextInput, ActivityIndicator, RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme';
import { GlassCard, GlassAvatar, GlassBadge } from '../../src/components/ui';
import { api } from '../../src/services/api';
import { ptBR } from '../../src/i18n/pt-BR';

export default function AthletesScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');

  const { data: athletes, isLoading, refetch } = useQuery({
    queryKey: ['coachAthletes'],
    queryFn: async () => {
      const { data } = await api.get('/users/athletes');
      return data;
    },
  });

  const filtered = (athletes || []).filter((item: any) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      item.user?.name?.toLowerCase().includes(q) ||
      item.user?.email?.toLowerCase().includes(q)
    );
  });

  const getLevelVariant = (level: string): 'success' | 'info' | 'warning' | 'primary' | 'default' => {
    const map: Record<string, 'success' | 'info' | 'warning' | 'primary'> = {
      BEGINNER: 'success',
      INTERMEDIATE: 'info',
      ADVANCED: 'warning',
      ELITE: 'primary',
    };
    return map[level] || 'default';
  };

  const renderItem = ({ item }: { item: any }) => (
    <Pressable onPress={() => router.push(`/(coach)/athletes/${item.user.id}`)}>
      {({ pressed }) => (
        <GlassCard
          intensity="subtle"
          shadow="sm"
          padding={16}
          style={{ marginBottom: 10, opacity: pressed ? 0.75 : 1 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <GlassAvatar name={item.user.name} size={48} style={{ marginRight: 14 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>
                {item.user.name}
              </Text>
              <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>
                {item.user.email}
              </Text>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                <GlassBadge
                  label={(ptBR.profile.levels as any)[item.level] || item.level}
                  variant={getLevelVariant(item.level)}
                  size="sm"
                />
                {item.weeklyGoalKm && (
                  <GlassBadge label={`${item.weeklyGoalKm}km/sem`} variant="default" size="sm" />
                )}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </View>
        </GlassCard>
      )}
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{
        paddingTop: insets.top + 12,
        paddingHorizontal: 20,
        paddingBottom: 16,
        borderBottomWidth: 0.5,
        borderBottomColor: colors.glassBorder,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <Text style={{ fontSize: 26, fontWeight: '800', letterSpacing: -0.5, color: colors.text }}>
            Atletas
          </Text>
          {athletes && (
            <GlassBadge label={`${athletes.length}`} variant="primary" size="sm" />
          )}
        </View>

        {/* Search bar */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          backgroundColor: colors.glass,
          borderRadius: 14,
          borderWidth: 0.5,
          borderColor: colors.glassBorder,
          paddingHorizontal: 14,
          paddingVertical: 10,
        }}>
          <Ionicons name="search-outline" size={18} color={colors.textTertiary} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar atleta..."
            placeholderTextColor={colors.textTertiary}
            style={{ flex: 1, fontSize: 15, color: colors.text }}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
            </Pressable>
          )}
        </View>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.textSecondary, fontSize: 14, marginTop: 12 }}>
            Carregando atletas...
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            padding: 20,
            paddingBottom: insets.bottom + 100,
          }}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={refetch} tintColor={colors.primary} />
          }
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingVertical: 80 }}>
              <View style={{
                width: 80, height: 80, borderRadius: 40,
                backgroundColor: colors.glass,
                alignItems: 'center', justifyContent: 'center',
                marginBottom: 16,
              }}>
                <Ionicons name="people-outline" size={40} color={colors.textTertiary} />
              </View>
              <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 8 }}>
                {search ? 'Nenhum resultado' : 'Nenhum atleta'}
              </Text>
              <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center', maxWidth: 260 }}>
                {search
                  ? `Nenhum atleta encontrado para "${search}"`
                  : 'Nenhum atleta cadastrado ainda.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}
