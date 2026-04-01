import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../src/theme';
import { GlassCard, GlassButton, GlassAvatar, StatCard, GlassHeader } from '../../../src/components/ui';
import { api } from '../../../src/services/api';
import { ptBR } from '../../../src/i18n/pt-BR';

export default function AthleteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const { data: user } = useQuery({
    queryKey: ['user', id],
    queryFn: async () => {
      const { data } = await api.get(`/users/${id}`);
      return data;
    },
  });

  if (!user) return (
    <View style={{ flex: 1, backgroundColor: colors.background }} />
  );

  const profile = user.athleteProfile;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <GlassHeader
        title={user.name}
        showBack
        onBack={() => router.back()}
      />
      <ScrollView
        contentContainerStyle={{
          padding: 20,
          paddingBottom: insets.bottom + 40,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Header */}
        <View style={{ alignItems: 'center', marginBottom: 28 }}>
          <GlassAvatar name={user.name} size={80} style={{ marginBottom: 14 }} />
          <Text style={{
            fontSize: 24, fontWeight: '700', letterSpacing: -0.3, color: colors.text,
          }}>
            {user.name}
          </Text>
          <Text style={{ fontSize: 14, color: colors.textSecondary, marginTop: 4 }}>
            {user.email}
          </Text>
        </View>

        {/* Athlete Data */}
        {profile && (
          <>
            <Text style={{
              fontSize: 13, fontWeight: '600', color: colors.textTertiary,
              letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 12,
            }}>
              Dados do Atleta
            </Text>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
              {profile.weight && (
                <StatCard
                  icon={<Ionicons name="barbell-outline" size={18} color={colors.primary} />}
                  value={`${profile.weight}`}
                  label={ptBR.profile.weight}
                  style={{ flex: 1 }}
                />
              )}
              {profile.vo2max && (
                <StatCard
                  icon={<Ionicons name="pulse-outline" size={18} color={colors.info} />}
                  value={`${profile.vo2max}`}
                  label={ptBR.profile.vo2max}
                  style={{ flex: 1 }}
                />
              )}
            </View>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 28 }}>
              {profile.restingHR && (
                <StatCard
                  icon={<Ionicons name="heart-outline" size={18} color={colors.success} />}
                  value={`${profile.restingHR}`}
                  label={ptBR.profile.restingHR}
                  style={{ flex: 1 }}
                />
              )}
              {profile.maxHR && (
                <StatCard
                  icon={<Ionicons name="heart" size={18} color={colors.error} />}
                  value={`${profile.maxHR}`}
                  label={ptBR.profile.maxHR}
                  style={{ flex: 1 }}
                />
              )}
            </View>
          </>
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
            onPress={() => {}}
            fullWidth
            icon={<Ionicons name="clipboard-outline" size={18} color="#FFF" />}
          />
          <GlassButton
            title={ptBR.coach.sendFeedback}
            onPress={() => {}}
            variant="secondary"
            fullWidth
            icon={<Ionicons name="chatbubble-outline" size={18} color={colors.text} />}
          />
          <GlassButton
            title={ptBR.coach.exportReport}
            onPress={() => {}}
            variant="ghost"
            fullWidth
            icon={<Ionicons name="download-outline" size={18} color={colors.primary} />}
          />
        </View>
      </ScrollView>
    </View>
  );
}
