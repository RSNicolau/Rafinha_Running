import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, SafeAreaView, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Linking, RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme';
import { GlassCard, GlassButton, GlassBadge } from '../../src/components/ui';
import { api } from '../../src/services/api';
import { ptBR } from '../../src/i18n/pt-BR';
import { LEGAL_WEB_URL } from '../../src/components/legal/legal';

/** Espelha GET /memberships/me (mensalidade do atleta com a equipe). */
interface MyMembership {
  team: { id: string; name: string } | null;
  membership: {
    id: string;
    status: 'PENDING' | 'ACTIVE' | 'PAST_DUE' | 'PAUSED' | 'CANCELED';
    plan: { id: string; name: string; interval: string };
    priceInCents: number;
    currentPeriodEnd: string | null;
    nextDueDate: string | null;
    canceledAt: string | null;
    hasAccess: boolean;
    openInvoice: { paymentId: string; amountInCents: number; dueDate: string | null; invoiceUrl: string | null; payPath: string; overdue: boolean } | null;
  } | null;
  plans: Array<{ id: string; name: string; interval: string; priceInCents: number; monthlyEquivalentInCents: number; benefits: string[]; description: string | null }>;
  payments: Array<{ id: string; amountInCents: number; status: string; dueDate: string | null; paidAt: string | null; invoiceUrl: string | null; payPath: string | null }>;
  legacySubscription: { planType: string; status: string; currentPeriodEnd: string; cancelAtPeriodEnd: boolean } | null;
  access: { active: boolean; banner: 'PAST_DUE' | 'IN_GRACE' | 'PENDING' | 'CANCELED' | null };
}

const INTERVAL: Record<string, string> = { MONTHLY: '/mês', QUARTERLY: '/3 meses', SEMIANNUAL: '/6 meses', ANNUAL: '/ano' };
const STATUS: Record<string, { label: string; variant: 'success' | 'info' | 'warning' | 'error' | 'default' }> = {
  ACTIVE: { label: ptBR.subscription.active, variant: 'success' },
  PENDING: { label: 'Aguardando pagamento', variant: 'warning' },
  PAST_DUE: { label: ptBR.subscription.pastDue, variant: 'error' },
  PAUSED: { label: 'Pausada', variant: 'info' },
  CANCELED: { label: ptBR.subscription.canceled, variant: 'default' },
  TRIALING: { label: 'Teste', variant: 'info' },
};

const brl = (c: number | null | undefined) => `R$ ${((c ?? 0) / 100).toFixed(2).replace('.', ',')}`;
const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Sao_Paulo' }) : '—';

/** Abre a fatura no navegador: fatura do gateway quando existir, senão a tela de pagamento do app web. */
function openInvoice(invoiceUrl: string | null | undefined, payPath: string | null | undefined) {
  const url = invoiceUrl || (payPath ? `${LEGAL_WEB_URL}${payPath}` : null);
  if (!url) return;
  Linking.openURL(url).catch(() => Alert.alert('Erro', 'Não foi possível abrir a fatura.'));
}

export default function SubscriptionScreen() {
  const { colors } = useTheme();
  const [data, setData] = useState<MyMembership | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api.get<MyMembership>('/memberships/me');
      setData(res.data);
      setError('');
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Não foi possível carregar sua mensalidade.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCancel = () => {
    Alert.alert(
      'Cancelar mensalidade',
      'As próximas cobranças serão encerradas. Você mantém o acesso até o fim do período já pago.',
      [
        { text: 'Manter', style: 'cancel' },
        {
          text: 'Cancelar mensalidade',
          style: 'destructive',
          onPress: async () => {
            try {
              const r = await api.post('/memberships/me/cancel', {});
              Alert.alert('Mensalidade cancelada', r.data?.accessUntil ? `Seu acesso continua até ${fmtDate(r.data.accessUntil)}.` : 'Cancelamento concluído.');
              load();
            } catch (e: any) {
              Alert.alert('Erro', e?.response?.data?.message || 'Não foi possível cancelar agora.');
            }
          },
        },
      ],
    );
  };

  const openSubscribe = (change = false) => {
    Linking.openURL(`${LEGAL_WEB_URL}/athlete-subscribe${change ? '?trocar=1' : ''}`).catch(() => undefined);
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

  const m = data?.membership ?? null;
  const legacy = !m ? data?.legacySubscription ?? null : null;
  const st = m ? STATUS[m.status] : legacy ? STATUS[legacy.status] ?? STATUS.ACTIVE : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>Minha mensalidade</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {!!error && (
          <Text style={{ color: colors.error, marginBottom: 16, textAlign: 'center' }}>{error}</Text>
        )}

        {data?.access.banner === 'PAST_DUE' && (
          <GlassCard intensity="subtle" shadow="sm" style={{ marginBottom: 16, borderLeftWidth: 4, borderLeftColor: colors.error }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.error }}>Mensalidade em atraso</Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 4 }}>Regularize para continuar com a assessoria.</Text>
          </GlassCard>
        )}
        {data?.access.banner === 'IN_GRACE' && (
          <GlassCard intensity="subtle" shadow="sm" style={{ marginBottom: 16, borderLeftWidth: 4, borderLeftColor: colors.warning }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.warning }}>Sua mensalidade venceu</Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 4 }}>Pague até o fim da carência para evitar atraso.</Text>
          </GlassCard>
        )}

        {/* Mensalidade atual */}
        {(m || legacy) && st && (
          <GlassCard intensity="medium" shadow="md" style={{ marginBottom: 24, borderLeftWidth: 4, borderLeftColor: colors.primary }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {data?.team?.name ?? ptBR.subscription.currentPlan}
                </Text>
                <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text, marginTop: 4 }}>
                  {m ? m.plan.name : legacy!.planType}
                </Text>
                {m && <Text style={{ fontSize: 14, color: colors.textSecondary }}>{brl(m.priceInCents)}{INTERVAL[m.plan.interval] ?? ''}</Text>}
              </View>
              <GlassBadge label={st.label} variant={st.variant} />
            </View>

            <View style={{ marginTop: 14, gap: 6 }}>
              {m && m.status !== 'CANCELED' && m.status !== 'PAUSED' && (
                <Text style={{ fontSize: 14, color: colors.textSecondary }}>
                  Próximo vencimento: {fmtDate(m.openInvoice?.dueDate ?? m.nextDueDate)}
                </Text>
              )}
              {m?.status === 'CANCELED' && (
                <Text style={{ fontSize: 14, color: colors.textSecondary }}>
                  {m.hasAccess && m.currentPeriodEnd ? `Acesso até ${fmtDate(m.currentPeriodEnd)}` : `Cancelada em ${fmtDate(m.canceledAt)}`}
                </Text>
              )}
              {legacy && <Text style={{ fontSize: 14, color: colors.textSecondary }}>Válido até {fmtDate(legacy.currentPeriodEnd)}</Text>}
            </View>

            {m?.openInvoice && (
              <GlassButton
                title={`Pagar ${brl(m.openInvoice.amountInCents)}`}
                onPress={() => openInvoice(m.openInvoice!.invoiceUrl, m.openInvoice!.payPath)}
                fullWidth
                style={{ marginTop: 16 }}
                icon={<Ionicons name="open-outline" size={16} color="#fff" />}
              />
            )}

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 14 }}>
              {m?.status === 'ACTIVE' && (data?.plans.length ?? 0) > 1 && (
                <TouchableOpacity onPress={() => openSubscribe(true)}>
                  <Text style={{ fontSize: 14, color: colors.primary, fontWeight: '600' }}>{ptBR.subscription.changePlan}</Text>
                </TouchableOpacity>
              )}
              {m && m.status !== 'CANCELED' && m.status !== 'PAUSED' && (
                <TouchableOpacity onPress={handleCancel}>
                  <Text style={{ fontSize: 14, color: colors.error, fontWeight: '500' }}>Cancelar mensalidade</Text>
                </TouchableOpacity>
              )}
            </View>
          </GlassCard>
        )}

        {/* Planos da equipe */}
        {(!m || m.status === 'CANCELED' || m.status === 'PENDING' || m.status === 'PAST_DUE') && (
          <>
            <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: 4 }}>
              {data?.team ? `Planos da ${data.team.name}` : 'Planos'}
            </Text>
            <Text style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 16 }}>
              {data?.team ? 'A assinatura é feita na página segura de pagamento.' : 'Você ainda não faz parte de uma equipe. Peça o convite ao seu treinador.'}
            </Text>
            {data?.team && data.plans.length === 0 && (
              <Text style={{ fontSize: 14, color: colors.textTertiary, marginBottom: 16 }}>Sua equipe ainda não publicou planos.</Text>
            )}
            {data?.plans.map((p) => (
              <GlassCard key={p.id} intensity="medium" shadow="sm" style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>{p.name}</Text>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>
                    {brl(p.priceInCents)}<Text style={{ fontSize: 13, color: colors.textSecondary }}> {INTERVAL[p.interval] ?? ''}</Text>
                  </Text>
                </View>
                {p.interval !== 'MONTHLY' && (
                  <Text style={{ fontSize: 12, color: colors.success, marginTop: 2 }}>equivale a {brl(p.monthlyEquivalentInCents)}/mês</Text>
                )}
                {p.benefits.slice(0, 4).map((b) => (
                  <View key={b} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                    <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
                    <Text style={{ fontSize: 13, color: colors.textSecondary, flex: 1 }}>{b}</Text>
                  </View>
                ))}
              </GlassCard>
            ))}
            {data?.team && data.plans.length > 0 && (
              <GlassButton
                title={m?.status === 'CANCELED' ? 'Assinar novamente' : 'Assinar um plano'}
                onPress={() => openSubscribe(false)}
                fullWidth
                style={{ marginBottom: 24 }}
                icon={<Ionicons name="open-outline" size={16} color="#fff" />}
              />
            )}
          </>
        )}

        {/* Histórico */}
        {(data?.payments.length ?? 0) > 0 && (
          <GlassCard intensity="subtle" shadow="sm" style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 8 }}>Histórico de cobranças</Text>
            {data!.payments.slice(0, 12).map((p) => (
              <TouchableOpacity
                key={p.id}
                disabled={p.status !== 'PENDING'}
                onPress={() => openInvoice(p.invoiceUrl, p.payPath)}
                style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border ?? '#E5E7EB' }}
              >
                <Text style={{ fontSize: 13, color: colors.textSecondary }}>{fmtDate(p.paidAt ?? p.dueDate)}</Text>
                <Text style={{ fontSize: 13, color: p.status === 'PENDING' ? colors.primary : colors.textSecondary }}>
                  {p.status === 'SUCCEEDED' ? 'Pago' : p.status === 'PENDING' ? 'Em aberto · abrir' : p.status === 'REFUNDED' ? 'Estornado' : 'Cancelado'}
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>{brl(p.amountInCents)}</Text>
              </TouchableOpacity>
            ))}
          </GlassCard>
        )}

        <GlassCard intensity="subtle" shadow="sm" style={{ marginTop: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Ionicons name="shield-checkmark-outline" size={20} color={colors.success} />
            <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>Pagamento seguro</Text>
          </View>
          <Text style={{ fontSize: 13, color: colors.textSecondary }}>
            Pix, boleto ou cartão. Renovação automática — cancele quando quiser, sem multa.
          </Text>
        </GlassCard>

        <View style={{ height: 48 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
