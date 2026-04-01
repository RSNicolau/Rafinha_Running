'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Integration {
  id: string;
  provider: 'GARMIN' | 'STRAVA' | 'APPLE_HEALTH' | 'GOOGLE_FIT';
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
    description: 'Hub universal — conecta Coros, Polar, Suunto, Samsung e qualquer dispositivo que sincroniza com Strava.',
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
  { name: 'Coros', color: '#1A1A2E', logo: '⌚' },
  { name: 'Polar', color: '#D8001D', logo: '⌚' },
  { name: 'Suunto', color: '#0078BE', logo: '⌚' },
  { name: 'Samsung', color: '#1428A0', logo: '⌚' },
  { name: 'Wahoo', color: '#E8002D', logo: '⌚' },
  { name: 'Fitbit', color: '#00B0B9', logo: '⌚' },
];

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
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
    try {
      const { data } = await api.post(`/integrations/${provider}/connect`);
      if (data?.url) window.open(data.url, '_blank');
    } catch (e: any) {
      alert(e?.response?.data?.message || `Erro ao conectar ${provider}`);
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnect = async (id: string) => {
    if (!confirm('Desconectar esta integração?')) return;
    try {
      await api.delete(`/integrations/${id}`);
      setIntegrations((prev) => prev.filter((i) => i.id !== id));
    } catch {
      alert('Erro ao desconectar');
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data } = await api.post('/integrations/sync');
      const total = data?.synced?.reduce((a: number, s: any) => a + (s.synced || 0), 0) || 0;
      alert(`${total} atividade(s) sincronizada(s)!`);
    } catch {
      alert('Erro ao sincronizar');
    } finally {
      setSyncing(false);
    }
  };

  const connectedCount = integrations.filter((i) => i.isActive).length;

  return (
    <div>
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
                        onClick={() => handleDisconnect(connected.id)}
                        className="text-xs text-red-500 hover:text-red-700 font-medium cursor-pointer"
                      >
                        Desconectar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleConnect(provider.key)}
                      disabled={connecting === provider.key || loading}
                      className="w-full py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer disabled:opacity-50"
                      style={{ backgroundColor: provider.color + '12', color: provider.color }}
                    >
                      {connecting === provider.key ? 'Conectando...' : `Conectar ${provider.name}`}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
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
