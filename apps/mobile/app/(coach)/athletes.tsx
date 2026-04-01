import React from 'react';
import { View, Text, FlatList, Pressable } from 'react-native';
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

  const { data: athletes, isLoading } = useQuery({
    queryKey: ['coachAthletes'],
    queryFn: async () => {
      const { data } = await api.get('/users/athletes');
      return data;
    },
  });

  const renderItem = ({ item }: { item: any }) => (
    <Pressable onPress={() => router.push(`/(coach)/athletes/${item.user.id}`)}>
      <GlassCard intensity="light" shadow="sm" padding={16} style={{ marginBottom: 10 }}>
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
                text={(ptBR.profile.levels as any)[item.level] || item.level}
                variant="primary"
              />
              {item.weeklyGoalKm && (
                <GlassBadge text={`${item.weeklyGoalKm}km/sem`} variant="default" />
              )}
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </View>
      </GlassCard>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={athletes}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          padding: 20,
          paddingBottom: insets.bottom + 100,
        }}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingVertical: 80 }}>
            <Ionicons name="people-outline" size={64} color={colors.textTertiary} />
            <Text style={{
              fontSize: 16, color: colors.textSecondary, marginTop: 16,
            }}>
              Nenhum atleta cadastrado
            </Text>
          </View>
        }
      />
    </View>
  );
}
