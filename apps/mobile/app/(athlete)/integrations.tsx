import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, SafeAreaView, ScrollView, TouchableOpacity,
  Alert, Linking, ActivityIndicator, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme';
import { GlassCard, GlassButton, GlassBadge } from '../../src/components/ui';
import { api } from '../../src/services/api';
import { ptBR } from '../../src/i18n/pt-BR';
import {
  isHealthKitAvailable,
  requestHealthKitPermissions,
  syncHealthKitToAPI,
} from '../../src/services/apple-health.service';

interface Integration {
  id: string;
  provider: 'GARMIN' | 'STRAVA' | 'APPLE_HEALTH' | 'COROS' | 'POLAR';
  isActive: boolean;
  lastSyncAt: string | null;
  createdAt: string;
}

const PROVIDERS = [
  {
    key: 'GARMIN' as const,
    name: 'Garmin',
    icon: 'watch-outline' as const,
    color: '#007CC3',
    description: 'Sincronize treinos e atividades com seu relógio Garmin. Receba planilhas direto no relógio.',
    isOAuth: true,
  },
  {
    key: 'STRAVA' as const,
    name: 'Strava',
    icon: 'bicycle-outline' as const,
    color: '#FC4C02',
    description: 'Importe corridas do Strava automaticamente via webhook.',
    isOAuth: true,
  },
  {
    key: 'COROS' as const,
    name: 'COROS',
    icon: 'radio-outline' as const,
    color: '#1A1A2E',
    description: 'Sincronize atividades do seu relógio COROS automaticamente.',
    isOAuth: true,
  },
  {
    key: 'POLAR' as const,
    name: 'Polar Flow',
    icon: 'pulse-outline' as const,
    color: '#D90429',
    description: 'Importe treinos do seu relógio Polar via Polar AccessLink.',
    isOAuth: true,
  },
  ...(Platform.OS === 'ios' ? [{
    key: 'APPLE_HEALTH' as const,
    name: 'Apple Health',
    icon: 'heart-outline' as const,
    color: '#FF2D55',
    description: 'Sincronize corridas do Apple Health e Apple Watch automaticamente.',
    isOAuth: false,
  }] : []),
];

export default function IntegrationsScreen() {
  const { colors } = useTheme();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [appleHealthGranted, setAppleHealthGranted] = useState(false);
  const [appleHealthSyncing, setAppleHealthSyncing] = useState(false);

  const fetchIntegrations = useCallback(async () => {
    try {
      const res = await api.get('/integrations');
      setIntegrations(res.data);
    } catch {
      // silently fail — user may be offline
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIntegrations();
    // Check if Apple Health permissions are already granted
    if (isHealthKitAvailable()) {
      requestHealthKitPermissions().then(setAppleHealthGranted);
    }
  }, [fetchIntegrations]);

  // ── OAuth providers (Garmin / Strava) ────────────────────────────────────────

  const handleOAuthConnect = async (provider: string) => {
    setConnecting(provider);
    try {
      const res = await api.post(`/integrations/${provider}/connect`);
      if (res.data?.url) {
        await Linking.openURL(res.data.url);
        // After returning from browser, refresh the list
        setTimeout(fetchIntegrations, 2000);
      }
    } catch (error: any) {
      const msg = error?.response?.data?.message || 'Falha ao conectar';
      if (msg.includes('não configurada') || msg.includes('client_id')) {
        Alert.alert(
          'Integração Indisponível',
          `A integração com ${getProviderName(provider)} ainda não foi configurada. Entre em contato com o suporte.`,
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

  const handleOAuthSync = async () => {
    setSyncing(true);
    try {
      const res = await api.post('/integrations/sync');
      const total = res.data?.synced?.reduce((acc: number, s: any) => acc + (s.synced || 0), 0) || 0;
      Alert.alert('Sincronização', `${total} atividade(s) sincronizada(s)!`);
      fetchIntegrations();
    } catch {
      Alert.alert('Erro', 'Falha ao sincronizar');
    } finally {
      setSyncing(false);
    }
  };

  // ── Apple Health ─────────────────────────────────────────────────────────────

  const handleAppleHealthConnect = async () => {
    setConnecting('APPLE_HEALTH');
    try {
      const granted = await requestHealthKitPermissions();
      if (!granted) {
        Alert.alert(
          'Permissão Negada',
          'Para sincronizar com o Apple Health, permita o acesso nas Configurações do iPhone.',
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Abrir Configurações', onPress: () => Linking.openURL('app-settings:') },
          ],
        );
        return;
      }
      setAppleHealthGranted(true);
      // Trigger initial sync right after connecting
      handleAppleHealthSync();
    } finally {
      setConnecting(null);
    }
  };

  const handleAppleHealthSync = async () => {
    setAppleHealthSyncing(true);
    try {
      const result = await syncHealthKitToAPI(30);
      const msg = result.synced > 0
        ? `${result.synced} atividade(s) sincronizada(s) com sucesso!`
        : 'Nenhuma atividade nova encontrada no Apple Health.';
      Alert.alert('Apple Health', msg);
    } catch {
      Alert.alert('Erro', 'Falha ao sincronizar com Apple Health');
    } finally {
      setAppleHealthSyncing(false);
    }
  };

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const getProviderName = (provider: string) => {
    const p = PROVIDERS.find((pr) => pr.key === provider);
    return p?.name || provider;
  };

  const getConnectedIntegration = (provider: string) =>
    integrations.find((i) => i.provider === provider && i.isActive);

  const formatLastSync = (dateStr: string | null) => {
    if (!dateStr) return 'Nunca sincronizado';
    const diffMin = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (diffMin < 1) return 'Agora mesmo';
    if (diffMin < 60) return `${diffMin} min atrás`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h atrás`;
    return `${Math.floor(diffHours / 24)} dia(s) atrás`;
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
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 14,
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
        {PROVIDERS.map((provider) => {
          const isAppleHealth = provider.key === 'APPLE_HEALTH';
          const connected = isAppleHealth
            ? appleHealthGranted
            : !!getConnectedIntegration(provider.key);
          const oauthIntegration = isAppleHealth ? null : getConnectedIntegration(provider.key);

          return (
            <View key={provider.key} style={{ marginBottom: 16 }}>
              <GlassCard intensity="medium" shadow="md">
                {/* Provider Header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <View style={{
                    width: 52, height: 52, borderRadius: 16,
                    backgroundColor: provider.color + '18',
                    alignItems: 'center', justifyContent: 'center',
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
                    marginTop: 16, paddingTop: 16,
                    borderTopWidth: 1, borderTopColor: colors.divider,
                  }}>
                    <View style={{
                      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <GlassBadge
                        label={ptBR.integrations.connected}
                        variant="success"
                        icon={<Ionicons name="checkmark-circle" size={12} color={colors.success} />}
                      />
                      {oauthIntegration && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Ionicons name="time-outline" size={12} color={colors.textTertiary} />
                          <Text style={{ fontSize: 11, color: colors.textTertiary }}>
                            {formatLastSync(oauthIntegration.lastSyncAt)}
                          </Text>
                        </View>
                      )}
                    </View>

                    <View style={{
                      flexDirection: 'row', justifyContent: 'space-between',
                      alignItems: 'center', marginTop: 14, gap: 10,
                    }}>
                      <View style={{ flex: 1 }}>
                        <GlassButton
                          title={ptBR.integrations.syncNow}
                          onPress={isAppleHealth ? handleAppleHealthSync : handleOAuthSync}
                          loading={isAppleHealth ? appleHealthSyncing : syncing}
                          variant="secondary"
                          size="sm"
                          icon={<Ionicons name="sync-outline" size={16} color={colors.primary} />}
                          fullWidth
                        />
                      </View>
                      {!isAppleHealth && oauthIntegration && (
                        <GlassButton
                          title={ptBR.integrations.disconnect}
                          onPress={() => handleDisconnect(oauthIntegration)}
                          variant="danger"
                          size="sm"
                        />
                      )}
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
                      title={`Conectar ${provider.name}`}
                      onPress={() => isAppleHealth
                        ? handleAppleHealthConnect()
                        : handleOAuthConnect(provider.key)
                      }
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
              width: 40, height: 40, borderRadius: 12,
              backgroundColor: colors.info + '15',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Ionicons name="information-circle-outline" size={24} color={colors.info} />
            </View>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>
              Por que conectar?
            </Text>
          </View>

          {[
            { icon: 'sync-outline' as const, text: 'Sincronização automática de treinos e atividades' },
            { icon: 'watch-outline' as const, text: 'Treinos enviados direto para seu relógio Garmin' },
            { icon: 'analytics-outline' as const, text: 'Métricas detalhadas: pace, FC, elevação e mais' },
            { icon: 'heart-outline' as const, text: 'Dados de saúde do Apple Watch sincronizados automaticamente' },
          ].map((item, idx) => (
            <View
              key={idx}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 10,
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
