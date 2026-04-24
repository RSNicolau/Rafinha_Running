'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';

interface Integration {
  id: string;
  provider: 'GARMIN' | 'STRAVA' | 'APPLE_HEALTH' | 'GOOGLE_FIT' | 'COROS' | 'POLAR';
  isActive: boolean;
  lastSyncAt: string | null;
}

const DIRECT_INTEGRATIONS = [
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
    key: 'STRAVA' as const,
    name: 'Strava',
    description: 'Hub universal — conecta Suunto, Samsung, Wahoo e qualquer dispositivo que sincroniza com Strava.',
    color: '#FC4C02',
    badge: 'Hub',
    badgeColor: '#FC4C02',
    features: ['Webhook em tempo real', 'Compatível com 50+ relógios', 'Importação automática'],
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0 3 13.828h4.17"/>
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
    key: 'POLAR' as const,
    name: 'Polar Flow',
    description: 'Sincronização via Polar AccessLink API v3. Importa exercícios do Polar Flow automaticamente.',
    color: '#D90429',
    badge: 'Direto',
    badgeColor: '#D90429',
    features: ['Polar Vantage / Pacer / Ignite', 'Webhook em tempo real', 'Dados de zona cardíaca'],
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path d="M3 12h2l3-8 4 16 3-8h6"/>
      </svg>
    ),
  },
  {
    key: 'APPLE_HEALTH' as const,
    name: 'Apple Health',
    description: 'Sincronize dados do Apple Health e Apple Watch diretamente via app iOS.',
    color: '#FF2D55',
    badge: 'iOS',
    badgeColor: '#FF2D55',
    features: ['Apple Watch nativo', 'VO2max e FC', 'Distância e calorias'],
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402 0-3.791 3.068-5.191 5.281-5.191 1.312 0 4.151.501 5.719 4.457 1.59-3.968 4.464-4.447 5.726-4.447 2.54 0 5.274 1.621 5.274 5.181 0 4.069-5.136 8.625-11 14.402z"/>
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
  { name: 'Suunto', color: '#0078BE' },
  { name: 'Samsung', color: '#1428A0' },
  { name: 'Wahoo', color: '#E8002D' },
  { name: 'Fitbit', color: '#00B0B9' },
  { name: 'Garmin Edge', color: '#007CC3' },
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
  const [settingUpPolarWebhook, setSettingUpPolarWebhook] = useState(false);
  const [polarWebhookMsg, setPolarWebhookMsg] = useState<string | null>(null);
  const [oauthMsg, setOauthMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    // Handle OAuth callback result
    const oauth = searchParams.get('oauth');
    const provider = searchParams.get('provider');
    if (oauth === 'success' && provider) {
      setOauthMsg({ type: 'success', text: `${provider} conectado com sucesso! ✓` });
      window.history.replaceState({}, '', '/dashboard/integrations');
    } else if (oauth === 'error' && provider) {
      const msg = searchParams.get('msg');
      setOauthMsg({ type: 'error', text: msg || `Erro ao conectar ${provider}. Tente novamente.` });
      window.history.replaceState({}, '', '/dashboard/integrations');
    }

    api.get('/integrations')
      .then((r) => setIntegrations(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const getConnected = (provider: string) =>
    integrations.find((i) => i.provider === provider && i.isActive);

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
      const { data } = await api.post(`/integrations/${provider}/connect`);
      if (data?.url) window.open(data.url, '_blank');
    } catch (e: any) {
      const msg = e?.response?.data?.message || `Erro ao conectar ${provider}`;
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
    } catch {
      setConnectErrors((prev) => ({ ...prev, [provider]: 'Erro ao desconectar' }));
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data } = await api.post('/integrations/sync');
      const total = data?.synced?.reduce((a: number, s: any) => a + (s.synced || 0), 0) || 0;
      setOauthMsg({ type: 'success', text: `${total} atividade(s) sincronizada(s)!` });
    } catch {
      setOauthMsg({ type: 'error', text: 'Erro ao sincronizar atividades' });
    } finally {
      setSyncing(false);
    }
  };

  const handleSetupStravaWebhook = async () => {
    setSettingUpWebhook(true);
    setWebhookMsg(null);
    try {
      const { data } = await api.post('/integrations/strava/setup-webhook');
      setWebhookMsg(
        data.status === 'registered'
          ? `✓ Webhook Strava registrado! (ID: ${data.subscriptionId})`
          : data.status === 'already_registered'
          ? '✓ Webhook Strava já estava registrado.'
          : `⚠ ${data.message}`,
      );
    } catch (e: any) {
      setWebhookMsg(`Erro: ${e?.response?.data?.message || 'Falha ao registrar webhook'}`);
    } finally {
      setSettingUpWebhook(false);
    }
  };

  const handleSetupPolarWebhook = async () => {
    setSettingUpPolarWebhook(true);
    setPolarWebhookMsg(null);
    try {
      const { data } = await api.post('/integrations/polar/setup-webhook');
      setPolarWebhookMsg(
        data.status === 'registered'
          ? `✓ Webhook Polar registrado! (ID: ${data.webhookId})`
          : data.status === 'already_registered'
          ? '✓ Webhook Polar já estava registrado.'
          : `⚠ ${data.message}`,
      );
    } catch (e: any) {
      setPolarWebhookMsg(`Erro: ${e?.response?.data?.message || 'Falha ao registrar webhook'}`);
    } finally {
      setSettingUpPolarWebhook(false);
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
        {DIRECT_INTEGRATIONS.map((provider) => {
          const connected = getConnected(provider.key);
          return (
            <div key={provider.key} className="glass-card p-6">
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

      {/* Strava Webhook Setup */}
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

      {/* Polar Webhook Setup */}
      <div className="glass-card p-5 mb-4 border border-red-100/60 bg-red-50/20">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800 mb-0.5">Ativar webhook automático do Polar</p>
            <p className="text-xs text-gray-500">
              Execute uma vez após o deploy para que o Polar envie exercícios em tempo real via AccessLink.
              Requer <code className="bg-gray-100 px-1 rounded text-[11px]">POLAR_CLIENT_ID</code> e{' '}
              <code className="bg-gray-100 px-1 rounded text-[11px]">POLAR_CLIENT_SECRET</code> configurados.
            </p>
            {polarWebhookMsg && (
              <p className={`text-xs mt-2 font-medium ${polarWebhookMsg.startsWith('✓') ? 'text-emerald-600' : 'text-red-600'}`}>
                {polarWebhookMsg}
              </p>
            )}
          </div>
          <button
            onClick={handleSetupPolarWebhook}
            disabled={settingUpPolarWebhook}
            className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-[#D90429]/10 text-[#D90429] hover:bg-[#D90429]/20 transition disabled:opacity-50 cursor-pointer"
          >
            <svg className={`w-4 h-4 ${settingUpPolarWebhook ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
            </svg>
            {settingUpPolarWebhook ? 'Registrando...' : 'Registrar webhook'}
          </button>
        </div>
      </div>

      {/* Via Strava section */}
      <div className="glass-card p-6 mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#FC4C0215' }}>
            <svg className="w-4 h-4" style={{ color: '#FC4C02' }} viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0 3 13.828h4.17"/>
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">Compatíveis via Strava</h3>
            <p className="text-xs text-gray-500">Conecte o Strava acima e todos estes dispositivos sincronizam automaticamente</p>
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
            { icon: '⌚', title: 'Envio ao relógio', desc: 'Planilhas enviadas direto ao Garmin e dispositivos' },
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
