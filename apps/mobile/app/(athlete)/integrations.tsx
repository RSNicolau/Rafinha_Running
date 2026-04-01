import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, SafeAreaView, ScrollView, TouchableOpacity,
  Alert, Linking, ActivityIndicator, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme';
import { GlassCard, GlassButton, GlassBadge } from '../../src/components/ui';
import { useAuthStore } from '../../src/stores/auth.store';
import { api } from '../../src/services/api';
import { ptBR } from '../../src/i18n/pt-BR';

interface Integration {
  id: string;
  provider: 'GARMIN' | 'STRAVA' | 'APPLE_HEALTH' | 'GOOGLE_FIT';
  isActive: boolean;
  lastSyncAt: string | null;
  createdAt: string;
}

const PROVIDERS = [
  {
    key: 'GARMIN' as const,
    name: ptBR.integrations.garmin,
    icon: 'watch-outline' as const,
    color: '#007CC3',
    description: 'Sincronize treinos e atividades com seu relogio Garmin',
  },
  {
    key: 'STRAVA' as const,
    name: ptBR.integrations.strava,
    icon: 'bicycle-outline' as const,
    color: '#FC4C02',
    description: 'Importe atividades do Strava automaticamente',
  },
  {
    key: 'APPLE_HEALTH' as const,
    name: ptBR.integrations.appleHealth,
    icon: 'heart-outline' as const,
    color: '#FF2D55',
    description: 'Sincronize dados de saude e atividades do Apple Health',
  },
  {
    key: 'GOOGLE_FIT' as const,
    name: ptBR.integrations.googleFit,
    icon: 'fitness-outline' as const,
    color: '#4285F4',
    description: 'Conecte dados de atividades do Google Fit',
  },
];

export default function IntegrationsScreen() {
  const { colors, isDark } = useTheme();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);

  const fetchIntegrations = useCallback(async () => {
    try {
      const res = await api.get('/integrations');
      setIntegrations(res.data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  const handleConnect = async (provider: string) => {
    setConnecting(provider);
    try {
      const res = await api.post(`/integrations/${provider}/connect`);
      if (res.data?.url) {
        if (Platform.OS === 'web') {
          window.open(res.data.url, '_blank');
        } else {
          await Linking.openURL(res.data.url);
        }
      }
    } catch (error: any) {
      const msg = error?.response?.data?.message || 'Falha ao conectar';
      if (msg.includes('nao configurada') || msg.includes('client_id')) {
        Alert.alert(
          'Integracao Indisponivel',
          `A integracao com ${getProviderName(provider)} ainda nao foi configurada pelo administrador. Entre em contato com o suporte para ativacao.`,
        );
      } else {
        Alert.alert('Erro', msg);
      }
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnect = async (integration: Integration) => {
    Alert.alert(
      'Desconectar',
      `Deseja desconectar ${getProviderName(integration.provider)}?`,
      [
        { text: ptBR.common.cancel, style: 'cancel' },
        {
          text: ptBR.integrations.disconnect,
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/integrations/${integration.id}`);
              fetchIntegrations();
            } catch {
              Alert.alert('Erro', 'Falha ao desconectar');
            }
          },
        },
      ],
    );
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await api.post('/integrations/sync');
      const total = res.data?.synced?.reduce((acc: number, s: any) => acc + (s.synced || 0), 0) || 0;
      Alert.alert('Sincronizacao', `${total} atividade(s) sincronizada(s)!`);
      fetchIntegrations();
    } catch {
      Alert.alert('Erro', 'Falha ao sincronizar');
    } finally {
      setSyncing(false);
    }
  };

  const getProviderName = (provider: string) => {
    const p = PROVIDERS.find((pr) => pr.key === provider);
    return p?.name || provider;
  };

  const getConnectedIntegration = (provider: string) => {
    return integrations.find((i) => i.provider === provider && i.isActive);
  };

  const formatLastSync = (dateStr: string | null) => {
    if (!dateStr) return 'Nunca sincronizado';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return 'Agora mesmo';
    if (diffMin < 60) return `${diffMin} min atras`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h atras`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} dia(s) atras`;
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
      }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>
          {ptBR.integrations.title}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Provider Cards */}
        {PROVIDERS.map((provider) => {
          const connected = getConnectedIntegration(provider.key);

          return (
            <View key={provider.key} style={{ marginBottom: 16 }}>
              <GlassCard intensity="medium" shadow="md">
                {/* Provider Header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <View style={{
                    width: 52,
                    height: 52,
                    borderRadius: 16,
                    backgroundColor: provider.color + '15',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Ionicons name={provider.icon} size={28} color={provider.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>
                      {provider.name}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                      {provider.description}
                    </Text>
                  </View>
                </View>

                {connected ? (
                  <View style={{
                    marginTop: 16,
                    paddingTop: 16,
                    borderTopWidth: 1,
                    borderTopColor: colors.divider,
                  }}>
                    {/* Status Row */}
                    <View style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}>
                      <GlassBadge
                        label={ptBR.integrations.connected}
                        variant="success"
                        icon={<Ionicons name="checkmark-circle" size={12} color={colors.success} />}
                      />
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="time-outline" size={12} color={colors.textTertiary} />
                        <Text style={{ fontSize: 11, color: colors.textTertiary }}>
                          {formatLastSync(connected.lastSyncAt)}
                        </Text>
                      </View>
                    </View>

                    {/* Action Buttons */}
                    <View style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginTop: 14,
                      gap: 10,
                    }}>
                      <View style={{ flex: 1 }}>
                        <GlassButton
                          title={ptBR.integrations.syncNow}
                          onPress={handleSync}
                          loading={syncing}
                          variant="secondary"
                          size="sm"
                          icon={<Ionicons name="sync-outline" size={16} color={colors.primary} />}
                          fullWidth
                        />
                      </View>
                      <GlassButton
                        title={ptBR.integrations.disconnect}
                        onPress={() => handleDisconnect(connected)}
                        variant="danger"
                        size="sm"
                      />
                    </View>
                  </View>
                ) : (
                  <View style={{ marginTop: 16 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
                      <GlassBadge
                        label="Desconectado"
                        variant="default"
                        icon={<Ionicons name="close-circle-outline" size={12} color={colors.textTertiary} />}
                      />
                    </View>
                    <GlassButton
                      title={`${ptBR.integrations.connect} ${provider.name}`}
                      onPress={() => handleConnect(provider.key)}
                      loading={connecting === provider.key}
                      fullWidth
                      variant="primary"
                    />
                  </View>
                )}
              </GlassCard>
            </View>
          );
        })}

        {/* Info Card */}
        <GlassCard intensity="subtle" shadow="sm" style={{ marginTop: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <View style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              backgroundColor: colors.info + '15',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Ionicons name="information-circle-outline" size={24} color={colors.info} />
            </View>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>
              Por que conectar?
            </Text>
          </View>

          {[
            { icon: 'sync-outline' as const, text: 'Sincronizacao automatica de treinos e atividades' },
            { icon: 'watch-outline' as const, text: 'Treinos enviados direto para seu relogio' },
            { icon: 'analytics-outline' as const, text: 'Metricas detalhadas de desempenho e recuperacao' },
            { icon: 'notifications-outline' as const, text: 'Alertas inteligentes baseados nos seus dados' },
          ].map((item, idx) => (
            <View
              key={idx}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingVertical: 8,
                borderTopWidth: idx > 0 ? 1 : 0,
                borderTopColor: colors.divider,
              }}
            >
              <Ionicons name={item.icon} size={18} color={colors.info} />
              <Text style={{ fontSize: 14, color: colors.textSecondary, flex: 1 }}>
                {item.text}
              </Text>
            </View>
          ))}
        </GlassCard>
      </ScrollView>
    </SafeAreaView>
  );
}
