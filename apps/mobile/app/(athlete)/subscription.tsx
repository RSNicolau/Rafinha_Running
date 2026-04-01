import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, SafeAreaView, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, TextInput, Clipboard,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme';
import { GlassCard, GlassButton, GlassBadge } from '../../src/components/ui';
import { api } from '../../src/services/api';
import { ptBR } from '../../src/i18n/pt-BR';

interface SubscriptionData {
  id: string;
  planType: string;
  status: string;
  currentPeriodEnd: string;
  trialEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

interface PixPaymentData {
  paymentId: string;
  orderId: string;
  status: string;
  pixQrCode: string;
  pixQrCodeUrl: string;
  pixExpiresAt: string;
  amount: number;
}

const PLANS = [
  {
    type: 'MONTHLY',
    name: 'Básico',
    price: 'R$ 49',
    period: '/mês',
    amount: 4900,
    description: 'Ideal para quem quer flexibilidade',
    popular: true,
    icon: 'rocket-outline' as const,
    features: [
      'Treinos personalizados ilimitados',
      'Chat ilimitado com treinador',
      'Sincronização com Garmin/Strava',
      'Relatórios avançados e analytics',
      'Upload de planilhas de treino',
      'Suporte prioritário',
    ],
  },
  {
    type: 'PRO',
    name: 'Pro',
    price: 'R$ 99',
    period: '/mês',
    amount: 9900,
    description: 'Para atletas dedicados',
    popular: false,
    icon: 'trophy-outline' as const,
    features: [
      'Tudo do Básico',
      'Análise avançada de VO2max',
      'Planejamento de provas',
      'Acesso antecipado a novidades',
      'Desconto em eventos parceiros',
      'Suporte VIP WhatsApp',
    ],
  },
  {
    type: 'ELITE',
    name: 'Elite',
    price: 'R$ 199',
    period: '/mês',
    amount: 19900,
    description: 'Performance máxima',
    popular: false,
    icon: 'diamond-outline' as const,
    savings: 'VIP',
    features: [
      'Tudo do Pro',
      'Coach dedicado exclusivo',
      'Análise biomecânica',
      'Acesso a eventos VIP',
      'Relatórios personalizados',
      'Suporte 24h',
    ],
  },
];

type PixStatus = 'idle' | 'loading' | 'pending' | 'paid' | 'failed';

export default function SubscriptionScreen() {
  const { colors, isDark } = useTheme();
  const [currentSub, setCurrentSub] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState<string | null>(null);

  // PIX state
  const [pixStatus, setPixStatus] = useState<PixStatus>('idle');
  const [pixData, setPixData] = useState<PixPaymentData | null>(null);
  const [pixPlanType, setPixPlanType] = useState<string | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Card state
  const [cardPlanType, setCardPlanType] = useState<string | null>(null);
  const [cardToken, setCardToken] = useState('');
  const [cardLoading, setCardLoading] = useState<string | null>(null);

  const loadSubscription = useCallback(async () => {
    try {
      const res = await api.get('/subscriptions/current');
      setCurrentSub(res.data?.id ? res.data : null);
    } catch {
      setCurrentSub(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSubscription(); }, [loadSubscription]);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const startPixPolling = useCallback((paymentId: string) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await api.get(`/payments/order/${paymentId}`);
        const { status, dbStatus } = res.data;
        if (status === 'paid' || dbStatus === 'SUCCEEDED') {
          setPixStatus('paid');
          clearInterval(pollIntervalRef.current!);
          Alert.alert('Pagamento confirmado!', 'Seu plano foi ativado com sucesso.', [
            { text: 'OK', onPress: () => { loadSubscription(); setPixStatus('idle'); setPixData(null); } },
          ]);
        } else if (status === 'failed' || status === 'canceled') {
          setPixStatus('failed');
          clearInterval(pollIntervalRef.current!);
        }
      } catch {
        // ignore transient errors
      }
    }, 5000);
  }, [loadSubscription]);

  const handlePixPayment = async (plan: typeof PLANS[0]) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    setPixStatus('loading');
    setPixPlanType(plan.type);
    setPixData(null);

    try {
      const res = await api.post('/payments/pix', {
        amount: plan.amount,
        description: `Plano ${plan.name} - RR Rafinha Running`,
        planId: plan.type,
      });
      setPixData(res.data);
      setPixStatus('pending');
      startPixPolling(res.data.paymentId);
    } catch (err: any) {
      setPixStatus('idle');
      Alert.alert('Erro', err?.response?.data?.message || 'Falha ao gerar PIX. Verifique se PAGARME_API_KEY está configurado.');
    }
  };

  const handleCardPayment = async (plan: typeof PLANS[0]) => {
    if (!cardToken.trim()) {
      Alert.alert('Token necessário', 'Informe o token do cartão gerado pelo Pagar.me.js');
      return;
    }
    setCardLoading(plan.type);
    try {
      const res = await api.post('/payments/card', {
        amount: plan.amount,
        description: `Plano ${plan.name} - RR Rafinha Running`,
        planId: plan.type,
        cardToken: cardToken.trim(),
      });
      Alert.alert('Sucesso', `Pagamento processado! Status: ${res.data.status}`);
      setCardToken('');
      setCardPlanType(null);
      loadSubscription();
    } catch (err: any) {
      Alert.alert('Erro', err?.response?.data?.message || 'Falha ao processar pagamento com cartão');
    } finally {
      setCardLoading(null);
    }
  };

  const handleCopyPix = () => {
    if (!pixData?.pixQrCode) return;
    Clipboard.setString(pixData.pixQrCode);
    Alert.alert('Copiado!', 'Código PIX copiado para a área de transferência.');
  };

  const handleCancel = () => {
    Alert.alert(
      'Cancelar Assinatura',
      'Tem certeza? Você continuará tendo acesso até o final do período atual.',
      [
        { text: 'Manter', style: 'cancel' },
        {
          text: 'Cancelar Assinatura',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.post('/subscriptions/cancel');
              Alert.alert('Assinatura cancelada', 'Sua assinatura foi cancelada. O acesso continua até o final do período.');
              loadSubscription();
            } catch {
              Alert.alert('Erro', 'Não foi possível cancelar a assinatura');
            }
          },
        },
      ],
    );
  };

  const getStatusBadgeVariant = (status: string): 'success' | 'info' | 'warning' | 'error' => {
    const map: Record<string, 'success' | 'info' | 'warning' | 'error'> = {
      ACTIVE: 'success',
      TRIALING: 'info',
      PAST_DUE: 'warning',
      CANCELED: 'error',
    };
    return map[status] || 'success';
  };

  const getStatusLabel = (status: string): string => {
    const map: Record<string, string> = {
      ACTIVE: ptBR.subscription.active,
      TRIALING: 'Teste',
      PAST_DUE: ptBR.subscription.pastDue,
      CANCELED: ptBR.subscription.canceled,
    };
    return map[status] || ptBR.subscription.active;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  };

  const getPlanColor = (type: string) => {
    if (type === 'ELITE') return colors.success;
    if (type === 'PRO') return '#8B5CF6';
    return colors.primary;
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
          {ptBR.subscription.title}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Current Subscription */}
        {currentSub && (
          <View style={{ marginBottom: 24 }}>
            <GlassCard
              intensity="medium"
              shadow="md"
              style={{ borderLeftWidth: 4, borderLeftColor: colors.primary }}
            >
              <View style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
              }}>
                <View style={{ flex: 1 }}>
                  <Text style={{
                    fontSize: 11,
                    fontWeight: '600',
                    color: colors.textTertiary,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}>
                    {ptBR.subscription.currentPlan}
                  </Text>
                  <Text style={{
                    fontSize: 22,
                    fontWeight: '700',
                    color: colors.text,
                    marginTop: 4,
                  }}>
                    {PLANS.find((p) => p.type === currentSub.planType)?.name || currentSub.planType}
                  </Text>
                </View>
                <GlassBadge
                  label={getStatusLabel(currentSub.status)}
                  variant={getStatusBadgeVariant(currentSub.status)}
                />
              </View>

              <View style={{ marginTop: 16, gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
                  <Text style={{ fontSize: 14, color: colors.textSecondary }}>
                    Válido até {formatDate(currentSub.currentPeriodEnd)}
                  </Text>
                </View>
                {currentSub.cancelAtPeriodEnd && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="warning-outline" size={16} color={colors.warning} />
                    <Text style={{ fontSize: 14, color: colors.warning }}>
                      Cancelamento agendado
                    </Text>
                  </View>
                )}
              </View>

              {!currentSub.cancelAtPeriodEnd && (
                <TouchableOpacity
                  style={{ marginTop: 16, alignSelf: 'flex-start' }}
                  onPress={handleCancel}
                >
                  <Text style={{ fontSize: 14, color: colors.error, fontWeight: '500' }}>
                    {ptBR.subscription.cancel}
                  </Text>
                </TouchableOpacity>
              )}
            </GlassCard>
          </View>
        )}

        {/* Section Title */}
        <Text style={{
          fontSize: 24,
          fontWeight: '700',
          color: colors.text,
          marginBottom: 4,
        }}>
          {currentSub ? ptBR.subscription.changePlan : 'Escolha seu plano'}
        </Text>
        <Text style={{
          fontSize: 15,
          color: colors.textSecondary,
          marginBottom: 24,
        }}>
          Pagamentos via Pagar.me — PIX instantâneo ou cartão
        </Text>

        {/* Plan Cards */}
        {PLANS.map((plan) => {
          const isCurrentPlan = currentSub?.planType === plan.type;
          const planColor = getPlanColor(plan.type);

          return (
            <View key={plan.type} style={{ marginBottom: 16, position: 'relative' }}>
              {plan.popular && (
                <View style={{
                  position: 'absolute',
                  top: -10,
                  right: 16,
                  zIndex: 10,
                }}>
                  <GlassBadge
                    label="MAIS POPULAR"
                    variant="primary"
                    icon={<Ionicons name="star" size={10} color={colors.primary} />}
                    size="sm"
                  />
                </View>
              )}

              <GlassCard
                intensity={plan.popular ? 'strong' : 'medium'}
                shadow={plan.popular ? 'lg' : 'md'}
                style={[
                  plan.popular && { borderWidth: 1, borderColor: colors.primary + '40' },
                  isCurrentPlan && { borderWidth: 1, borderColor: colors.success + '40' },
                ]}
              >
                {/* Plan Header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <View style={{
                    width: 48,
                    height: 48,
                    borderRadius: 14,
                    backgroundColor: planColor + '15',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Ionicons name={plan.icon} size={24} color={planColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>
                      {plan.name}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                      {plan.description}
                    </Text>
                  </View>
                </View>

                {/* Price */}
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'baseline',
                  gap: 4,
                  marginBottom: 14,
                }}>
                  <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text }}>
                    {plan.price}
                  </Text>
                  <Text style={{ fontSize: 15, color: colors.textSecondary }}>
                    {plan.period}
                  </Text>
                  {plan.savings && (
                    <View style={{ marginLeft: 8 }}>
                      <GlassBadge label={plan.savings} variant="success" size="sm" />
                    </View>
                  )}
                </View>

                {/* Features */}
                <View style={{ gap: 10, marginBottom: 16 }}>
                  {plan.features.map((feature, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="checkmark-circle" size={18} color={planColor} />
                      <Text style={{ fontSize: 13, color: colors.textSecondary, flex: 1 }}>
                        {feature}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* PIX Button */}
                <GlassButton
                  title={isCurrentPlan ? 'Plano Atual' : pixStatus === 'loading' && pixPlanType === plan.type ? 'Gerando PIX...' : 'Pagar com PIX'}
                  onPress={() => !isCurrentPlan && handlePixPayment(plan)}
                  loading={pixStatus === 'loading' && pixPlanType === plan.type}
                  disabled={isCurrentPlan || (pixStatus === 'loading' && pixPlanType !== plan.type)}
                  fullWidth
                  variant={plan.popular ? 'primary' : 'secondary'}
                  style={{ marginBottom: 8, ...(isCurrentPlan ? { opacity: 0.5 } : {}) }}
                  icon={<Ionicons name="qr-code-outline" size={16} color={isCurrentPlan ? colors.textSecondary : '#fff'} />}
                />

                {/* Card Button (toggle) */}
                {!isCurrentPlan && (
                  <TouchableOpacity
                    onPress={() => setCardPlanType(cardPlanType === plan.type ? null : plan.type)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      paddingVertical: 10,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: colors.border ?? '#E5E7EB',
                    }}
                  >
                    <Ionicons name="card-outline" size={16} color={colors.textSecondary} />
                    <Text style={{ fontSize: 14, color: colors.textSecondary, fontWeight: '500' }}>
                      Pagar com Cartão
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Card token input */}
                {cardPlanType === plan.type && !isCurrentPlan && (
                  <View style={{
                    marginTop: 12,
                    padding: 12,
                    backgroundColor: (colors.surface ?? colors.background) + '80',
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.border ?? '#E5E7EB',
                  }}>
                    <Text style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 8 }}>
                      Token gerado pelo Pagar.me.js no frontend
                    </Text>
                    <TextInput
                      value={cardToken}
                      onChangeText={setCardToken}
                      placeholder="token_xxxxxxxxxxxxxxxx"
                      placeholderTextColor={colors.textTertiary}
                      style={{
                        fontSize: 12,
                        fontFamily: 'monospace',
                        color: colors.text,
                        backgroundColor: colors.background,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: colors.border ?? '#E5E7EB',
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        marginBottom: 8,
                      }}
                    />
                    <GlassButton
                      title={cardLoading === plan.type ? 'Processando...' : 'Confirmar Pagamento'}
                      onPress={() => handleCardPayment(plan)}
                      loading={cardLoading === plan.type}
                      disabled={!cardToken.trim()}
                      fullWidth
                      variant="secondary"
                    />
                  </View>
                )}
              </GlassCard>
            </View>
          );
        })}

        {/* PIX QR Code / Status */}
        {pixData && pixStatus !== 'idle' && (
          <View style={{ marginBottom: 16 }}>
            <GlassCard intensity="medium" shadow="md">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Ionicons name="qr-code-outline" size={20} color={colors.success} />
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>
                  Pagar com PIX
                </Text>
              </View>

              {pixStatus === 'paid' ? (
                <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                  <View style={{
                    width: 56,
                    height: 56,
                    borderRadius: 28,
                    backgroundColor: colors.success + '20',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 12,
                  }}>
                    <Ionicons name="checkmark-circle" size={32} color={colors.success} />
                  </View>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: colors.success }}>
                    Pagamento confirmado!
                  </Text>
                  <Text style={{ fontSize: 14, color: colors.textSecondary, marginTop: 4 }}>
                    Seu plano foi ativado com sucesso.
                  </Text>
                </View>
              ) : pixStatus === 'failed' ? (
                <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                  <Ionicons name="close-circle" size={40} color={colors.error} />
                  <Text style={{ fontSize: 16, fontWeight: '600', color: colors.error, marginTop: 8 }}>
                    Pagamento não concluído
                  </Text>
                  <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 4 }}>
                    O prazo expirou. Tente novamente.
                  </Text>
                </View>
              ) : (
                <View>
                  {/* Status badge */}
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    marginBottom: 12,
                  }}>
                    <View style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: '#F59E0B',
                    }} />
                    <Text style={{ fontSize: 13, color: colors.warning ?? '#D97706', fontWeight: '500' }}>
                      Aguardando pagamento...
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.textTertiary }}>
                      (verifica a cada 5s)
                    </Text>
                  </View>

                  {/* Amount */}
                  <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 8 }}>
                    Valor: R$ {((pixData.amount ?? 0) / 100).toFixed(2).replace('.', ',')}
                  </Text>

                  {/* QR Code text */}
                  <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 6 }}>
                    Copia e Cola PIX:
                  </Text>
                  <View style={{
                    backgroundColor: colors.background,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: colors.border ?? '#E5E7EB',
                    padding: 10,
                    marginBottom: 10,
                  }}>
                    <Text
                      style={{
                        fontSize: 10,
                        fontFamily: 'monospace',
                        color: colors.textSecondary,
                        lineHeight: 16,
                      }}
                      numberOfLines={4}
                      ellipsizeMode="tail"
                    >
                      {pixData.pixQrCode || 'QR code indisponível'}
                    </Text>
                  </View>

                  {/* Expiry */}
                  {pixData.pixExpiresAt && (
                    <Text style={{ fontSize: 11, color: colors.textTertiary, marginBottom: 10 }}>
                      Expira às {new Date(pixData.pixExpiresAt).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  )}

                  {/* Copy button */}
                  <TouchableOpacity
                    onPress={handleCopyPix}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingVertical: 10,
                      paddingHorizontal: 16,
                      borderRadius: 10,
                      backgroundColor: colors.success + '15',
                      alignSelf: 'flex-start',
                    }}
                  >
                    <Ionicons name="copy-outline" size={16} color={colors.success} />
                    <Text style={{ fontSize: 13, color: colors.success, fontWeight: '600' }}>
                      Copiar código PIX
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </GlassCard>
          </View>
        )}

        {/* Payment Security Footer */}
        <GlassCard intensity="subtle" shadow="sm" style={{ marginTop: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Ionicons name="shield-checkmark-outline" size={20} color={colors.success} />
            <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>
              Pagamento Seguro
            </Text>
          </View>
          <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 14 }}>
            Processado via Pagar.me v5. Cancele quando quiser sem multa.
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <GlassBadge
              label="PIX"
              variant="default"
              icon={<Ionicons name="qr-code-outline" size={12} color={colors.textSecondary} />}
              size="sm"
            />
            <GlassBadge
              label="Cartão"
              variant="default"
              icon={<Ionicons name="card-outline" size={12} color={colors.textSecondary} />}
              size="sm"
            />
          </View>
        </GlassCard>

        <View style={{ height: 48 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
