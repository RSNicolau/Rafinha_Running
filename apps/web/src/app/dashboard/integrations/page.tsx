'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, friendlyError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';

type ProviderKey = 'GARMIN' | 'STRAVA' | 'APPLE_HEALTH' | 'GOOGLE_FIT' | 'COROS' | 'POLAR';

interface Integration {
  id: string;
  provider: ProviderKey;
  isActive: boolean;
  lastSyncAt: string | null;
}

interface ProviderInfo {
  provider: ProviderKey;
  available: boolean;
  primary?: boolean;
  platforms: Array<'web' | 'ios' | 'android'>;
  reason?: string;
}

/** Mensagens para os códigos de erro estáveis devolvidos pelo callback OAuth da API. */
const OAUTH_ERRORS: Record<string, string> = {
  access_denied: 'Autorização cancelada na plataforma. Tente novamente quando quiser.',
  session_mismatch: 'Por segurança, conclua a conexão no mesmo navegador em que você clicou em "Conectar". Tente de novo.',
  expired_state: 'O link de conexão expirou (10 min). Clique em "Conectar" novamente.',
  provider_unavailable: 'Esta integração não está disponível no momento.',
  missing_scope: 'Precisamos da permissão "Ver dados das suas atividades". Conecte de novo e mantenha a opção marcada.',
  invalid_request: 'Resposta inválida da plataforma. Tente novamente.',
  exchange_failed: 'Não foi possível concluir a conexão. Tente novamente em instantes.',
};

const PROVIDER_LABEL: Record<string, string> = {
  STRAVA: 'Strava', GARMIN: 'Garmin', COROS: 'COROS', GOOGLE_FIT: 'Google Fit', POLAR: 'Polar', APPLE_HEALTH: 'Apple Health',
};

const DIRECT_INTEGRATIONS = [
  {
    key: 'STRAVA' as const,
    name: 'Strava',
    description: 'Use Garmin, Coros, Polar, Apple Watch? Conecte seu relógio à Strava e ele sincroniza aqui automaticamente.',
    color: '#FC4C02',
    badge: 'Recomendado',
    badgeColor: '#FC4C02',
    features: ['Webhook em tempo real', 'Compatível com 50+ relógios', 'Importação automática'],
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0 3 13.828h4.17"/>
      </svg>
    ),
  },
  {
    key: 'GARMIN' as const,
    name: 'Garmin Connect',
    description: 'Sincronização direta via Garmin Health API. Receba atividades automaticamente após cada treino.',
    color: '#007CC3',
    badge: 'Direto',
    badgeColor: '#007CC3',
    features: ['Atividades automáticas', 'Treinos enviados ao relógio', 'Dados de saúde e FC'],
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
      </svg>
    ),
  },
  {
    key: 'COROS' as const,
    name: 'COROS',
    description: 'Sincronização direta via COROS Open API. Receba corridas do seu relógio COROS automaticamente.',
    color: '#1A1A2E',
    badge: 'Direto',
    badgeColor: '#1A1A2E',
    features: ['COROS PACE / APEX / VERTIX', 'Atividades automáticas', 'Pace, FC e elevação'],
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path d="M12 2a10 10 0 100 20A10 10 0 0012 2zm0 18a8 8 0 110-16 8 8 0 010 16zm-1-5h2v2h-2zm0-8h2v6h-2z"/>
      </svg>
    ),
  },
  {
    key: 'GOOGLE_FIT' as const,
    name: 'Google Fit',
    description: 'Conecte dados de atividade e saúde do Google Fit para dispositivos Android.',
    color: '#4285F4',
    badge: 'Android',
    badgeColor: '#4285F4',
    features: ['Wear OS', 'Histórico de atividades', 'Passos e calorias'],
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path d="M12 2a10 10 0 100 20A10 10 0 0012 2zm4.93 6.5h-2.39a6.53 6.53 0 00-.46-1.67 3.8 3.8 0 012.85 1.67zM12 4.04c.58.73 1.07 1.52 1.41 2.46h-2.82c.34-.94.83-1.73 1.41-2.46zM4.26 14A7.88 7.88 0 014 12c0-.69.1-1.36.26-2h2.74a14.42 14.42 0 000 4H4.26zm.81 2h2.39c.11.58.27 1.14.46 1.67A3.8 3.8 0 015.07 16zm2.39-8H5.07a3.8 3.8 0 012.85-1.67A6.53 6.53 0 007.46 8zM12 19.96c-.58-.73-1.07-1.52-1.41-2.46h2.82c-.34.94-.83 1.73-1.41 2.46zM13.68 16H10.32a12.7 12.7 0 010-8h3.36a12.7 12.7 0 010 8zm.23 3.67c.19-.53.35-1.09.46-1.67h2.39a3.8 3.8 0 01-2.85 1.67zm.63-3.67a14.42 14.42 0 000-4H17c.16.64.26 1.31.26 2s-.1 1.36-.26 2h-2.46z"/>
      </svg>
    ),
  },
];

const VIA_STRAVA = [
  { name: 'Garmin', color: '#007CC3' },
  { name: 'COROS', color: '#1A1A2E' },
  { name: 'Polar', color: '#D90429' },
  { name: 'Apple Watch', color: '#FF2D55' },
  { name: 'Suunto', color: '#0078BE' },
  { name: 'Samsung', color: '#1428A0' },
  { name: 'Wahoo', color: '#E8002D' },
  { name: 'Fitbit', color: '#00B0B9' },
  { name: 'Zwift', color: '#FC6719' },
];

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connectErrors, setConnectErrors] = useState<Record<string, string>>({});
  const [syncing, setSyncing] = useState(false);
  const [settingUpWebhook, setSettingUpWebhook] = useState(false);
  const [webhookMsg, setWebhookMsg] = useState<string | null>(null);
  const [oauthMsg, setOauthMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[] | null>(null);
  const searchParams = useSearchParams();
  function getConnected(provider: string) {
    return integrations.find((i) => i.provider === provider && i.isActive);
  }
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN';

  useEffect(() => {
    // Resultado do callback OAuth (a API só devolve códigos estáveis — nunca texto arbitrário)
    const oauth = searchParams.get('oauth');
    const provider = searchParams.get('provider') || '';
    const label = PROVIDER_LABEL[provider] || 'Integração';
    if (oauth === 'success') {
      setOauthMsg({ type: 'success', text: `${label} conectado com sucesso! Suas corridas recentes estão sendo importadas.` });
      window.history.replaceState({}, '', '/dashboard/integrations');
    } else if (oauth === 'error') {
      const code = searchParams.get('error') || '';
      setOauthMsg({ type: 'error', text: OAUTH_ERRORS[code] || `Erro ao conectar ${label}. Tente novamente.` });
      window.history.replaceState({}, '', '/dashboard/integrations');
    }

    Promise.all([
      api.get('/integrations').then((r) => setIntegrations(r.data || [])).catch(() => {}),
      api.get<ProviderInfo[]>('/integrations/providers')
        .then((r) => setProviders(Array.isArray(r.data) ? r.data : []))
        // Sem a lista, mostra só a Strava (ponte oficial) em vez de botões que falhariam
        .catch(() => setProviders([{ provider: 'STRAVA', available: true, primary: true, platforms: ['web'] }])),
    ]).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Conectores oferecidos no navegador: disponíveis no backend e suportados na web (nunca Apple Health). */
  const visibleIntegrations = DIRECT_INTEGRATIONS.filter((p) => {
    if (getConnected(p.key)) return true; // conexões existentes continuam visíveis para desconectar
    const info = providers?.find((x) => x.provider === p.key);
    return !!info && info.available && info.platforms.includes('web');
  });
  const stravaInfo = providers?.find((x) => x.provider === 'STRAVA');


  const formatLastSync = (dateStr: string | null) => {
    if (!dateStr) return 'Nunca';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Agora mesmo';
    if (mins < 60) return `${mins} min atrás`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h atrás`;
    return `${Math.floor(hours / 24)}d atrás`;
  };

  const handleConnect = async (provider: string) => {
    setConnecting(provider);
    // Clear previous error for this provider
    setConnectErrors((prev) => { const n = { ...prev }; delete n[provider]; return n; });
    try {
      // A resposta define o cookie HttpOnly rr_oauth_nonce (vincula o retorno a este navegador)
      const { data } = await api.post(`/integrations/${provider}/connect`, {}, { withCredentials: true });
      if (data?.url) window.location.assign(data.url);
      else setConnectErrors((prev) => ({ ...prev, [provider]: `Não foi possível iniciar a conexão com ${PROVIDER_LABEL[provider] || provider}. Tente novamente.` }));
    } catch (e: any) {
      const msg = friendlyError(e, `Não foi possível conectar ${PROVIDER_LABEL[provider] || provider}. Tente novamente.`);
      setConnectErrors((prev) => ({ ...prev, [provider]: msg }));
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnect = async (id: string, provider: string) => {
    setConnectErrors((prev) => { const n = { ...prev }; delete n[provider]; return n; });
    try {
      await api.delete(`/integrations/${id}`);
      setIntegrations((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      setConnectErrors((prev) => ({ ...prev, [provider]: friendlyError(e, 'Não foi possível desconectar. Tente novamente.') }));
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data } = await api.post('/integrations/sync', {});
      const total = data?.synced?.reduce((a: number, s: any) => a + (s.synced || 0), 0) || 0;
      const rateLimited = data?.synced?.some((s: any) => s.error === 'rate_limited');
      setOauthMsg(rateLimited
        ? { type: 'error', text: 'A Strava pediu uma pausa (limite de requisições). Tente de novo em alguns minutos.' }
        : { type: 'success', text: `${total} atividade(s) nova(s) vinculada(s) aos treinos planejados.` });
    } catch (e: any) {
      setOauthMsg({ type: 'error', text: friendlyError(e, 'Não foi possível sincronizar as atividades. Tente novamente.') });
    } finally {
      setSyncing(false);
    }
  };

  const handleSetupStravaWebhook = async () => {
    setSettingUpWebhook(true);
    setWebhookMsg(null);
    try {
      // A URL de callback é derivada do ambiente da API (APP_URL / API_PUBLIC_URL)
      const { data } = await api.post('/integrations/strava/setup-webhook', {});
      setWebhookMsg(
        data.status === 'registered'
          ? `✓ Webhook Strava registrado! Defina STRAVA_WEBHOOK_SUBSCRIPTION_ID=${data.subscriptionId} na API.`
          : data.status === 'already_registered'
          ? `✓ Webhook Strava já estava registrado${data.subscriptionId ? ` (ID ${data.subscriptionId})` : ''}.`
          : `⚠ ${data.message}`,
      );
    } catch (e: any) {
      setWebhookMsg(`Erro: ${friendlyError(e, 'Falha ao registrar webhook')}`);
    } finally {
      setSettingUpWebhook(false);
    }
  };

  const connectedCount = integrations.filter((i) => i.isActive).length;

  return (
    <div>
      {oauthMsg && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-semibold flex items-center gap-2 ${
          oauthMsg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {oauthMsg.type === 'success' ? '✓' : '⚠'} {oauthMsg.text}
          <button onClick={() => setOauthMsg(null)} className="ml-auto text-xs opacity-60 hover:opacity-100">✕</button>
        </div>
      )}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Integrações</h1>
          <p className="text-sm text-gray-500 mt-1">Conecte seus dispositivos e plataformas de fitness</p>
        </div>
        {connectedCount > 0 && (
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-red-700 transition disabled:opacity-50 cursor-pointer"
          >
            <svg className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            {syncing ? 'Sincronizando...' : 'Sincronizar tudo'}
          </button>
        )}
      </div>

      {/* Status bar */}
      {connectedCount > 0 && (
        <div className="glass-card p-4 mb-6 flex items-center gap-3 border border-emerald-200/60 bg-emerald-50/40">
          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
            <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-emerald-800">{connectedCount} integração{connectedCount > 1 ? 'ões' : ''} ativa{connectedCount > 1 ? 's' : ''}</p>
            <p className="text-xs text-emerald-600">Seus treinos estão sendo sincronizados automaticamente</p>
          </div>
        </div>
      )}

      {/* Main integrations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {loading && !providers && (
          <div className="glass-card p-6 animate-pulse h-40 md:col-span-2" />
        )}
        {providers && !stravaInfo?.available && !getConnected('STRAVA') && (
          <div className="glass-card p-5 md:col-span-2 border border-amber-100 bg-amber-50/40 text-sm text-amber-800">
            A conexão com a Strava ainda não foi habilitada pelo administrador da plataforma.
          </div>
        )}
        {visibleIntegrations.map((provider) => {
          const connected = getConnected(provider.key);
          return (
            <div
              key={provider.key}
              className={`glass-card p-6 ${provider.key === 'STRAVA' ? 'md:col-span-2 border border-[#FC4C02]/20' : ''}`}
            >
              <div className="flex items-start gap-4">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: provider.color + '15', color: provider.color }}
                >
                  {provider.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="text-sm font-bold text-gray-900">{provider.name}</h3>
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: provider.badgeColor + '15', color: provider.badgeColor }}
                    >
                      {provider.badge}
                    </span>
                    {connected && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                        Conectado
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed mb-3">{provider.description}</p>

                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {provider.features.map((f) => (
                      <span key={f} className="text-xs px-2 py-1 rounded-lg bg-gray-100 text-gray-600">{f}</span>
                    ))}
                  </div>

                  {connected ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs text-gray-400">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Último sync: {formatLastSync(connected.lastSyncAt)}
                      </div>
                      <button
                        onClick={() => handleDisconnect(connected.id, provider.key)}
                        className="text-xs text-red-500 hover:text-red-700 font-medium cursor-pointer"
                      >
                        Desconectar
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => handleConnect(provider.key)}
                        disabled={connecting === provider.key || loading}
                        className="w-full py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer disabled:opacity-50"
                        style={{ backgroundColor: provider.color + '12', color: provider.color }}
                      >
                        {connecting === provider.key ? 'Conectando...' : `Conectar ${provider.name}`}
                      </button>
                      {connectErrors[provider.key] && (
                        <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 leading-relaxed">
                          ⚠ {connectErrors[provider.key]}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Strava Webhook Setup (somente admin da plataforma) */}
      {isAdmin && stravaInfo?.available && (
      <div className="glass-card p-5 mb-6 border border-amber-100/60 bg-amber-50/30">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800 mb-0.5">Ativar webhook automático do Strava</p>
            <p className="text-xs text-gray-500">
              Execute uma vez após o deploy para que o Strava envie atividades em tempo real.
              Requer <code className="bg-gray-100 px-1 rounded text-[11px]">STRAVA_CLIENT_ID</code>,{' '}
              <code className="bg-gray-100 px-1 rounded text-[11px]">STRAVA_CLIENT_SECRET</code> e{' '}
              <code className="bg-gray-100 px-1 rounded text-[11px]">STRAVA_WEBHOOK_VERIFY_TOKEN</code> configurados.
            </p>
            {webhookMsg && (
              <p className={`text-xs mt-2 font-medium ${webhookMsg.startsWith('✓') ? 'text-emerald-600' : 'text-red-600'}`}>
                {webhookMsg}
              </p>
            )}
          </div>
          <button
            onClick={handleSetupStravaWebhook}
            disabled={settingUpWebhook}
            className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-[#FC4C02]/10 text-[#FC4C02] hover:bg-[#FC4C02]/20 transition disabled:opacity-50 cursor-pointer"
          >
            <svg className={`w-4 h-4 ${settingUpWebhook ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
            </svg>
            {settingUpWebhook ? 'Registrando...' : 'Registrar webhook'}
          </button>
        </div>
      </div>
      )}

      {/* Via Strava section */}
      <div className="glass-card p-6 mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#FC4C0215' }}>
            <svg className="w-4 h-4" style={{ color: '#FC4C02' }} viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0 3 13.828h4.17"/>
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">Seu relógio, via Strava</h3>
            <p className="text-xs text-gray-500">
              Use Garmin, Coros, Polar, Apple Watch? Conecte seu relógio à Strava e ele sincroniza aqui automaticamente.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          {VIA_STRAVA.map((device) => (
            <div
              key={device.name}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 border border-gray-100"
            >
              <div
                className="w-5 h-5 rounded-md flex items-center justify-center text-white text-xs font-bold"
                style={{ backgroundColor: device.color }}
              >
                {device.name.charAt(0)}
              </div>
              <span className="text-sm font-medium text-gray-700">{device.name}</span>
            </div>
          ))}

          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 border border-gray-100">
            <span className="text-sm text-gray-400">+ 40 outros</span>
          </div>
        </div>
      </div>

      {/* Why connect */}
      <div className="glass-card p-6">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">Por que conectar?</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { icon: '⚡', title: 'Sync automático', desc: 'Treinos aparecem no app segundos após terminar' },
            { icon: '⌚', title: 'Qualquer relógio', desc: 'Garmin, COROS, Polar, Apple Watch e outros via Strava' },
            { icon: '📊', title: 'Métricas completas', desc: 'Pace, FC, cadência, VO2max e zonas de treino' },
            { icon: '🔔', title: 'Alertas inteligentes', desc: 'Notificações baseadas nos dados reais do atleta' },
          ].map((item) => (
            <div key={item.title} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50/60">
              <span className="text-xl">{item.icon}</span>
              <div>
                <p className="text-sm font-semibold text-gray-800">{item.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
