'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/lib/api';

type WhatsAppProvider = 'zapi' | 'twilio' | 'evolution';

interface WhatsAppConfig {
  connected: boolean;
  phone: string;
  provider: WhatsAppProvider;
  instanceId: string;
  hasToken: boolean;
  webhookUrl: string;
  welcomeMessage: string;
}

type FeedbackState = { type: 'success' | 'error'; message: string } | null;

const PROVIDERS: { value: WhatsAppProvider; label: string }[] = [
  { value: 'zapi', label: 'Z-API' },
  { value: 'twilio', label: 'Twilio' },
  { value: 'evolution', label: 'Evolution API' },
];

export default function WhatsAppSettingsPage() {
  const user = useAuthStore((s) => s.user);

  const [config, setConfig] = useState<WhatsAppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [endpointAvailable, setEndpointAvailable] = useState(true);

  const [phone, setPhone] = useState('');
  const [provider, setProvider] = useState<WhatsAppProvider>('zapi');
  const [apiToken, setApiToken] = useState('');
  const [instanceId, setInstanceId] = useState('');
  const [welcomeMessage, setWelcomeMessage] = useState(
    'Olá {nome}! Sou o assistente do Coach {coachName}. Para começar seu onboarding, acesse: {onboardingLink}',
  );
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  useEffect(() => {
    api
      .get<WhatsAppConfig>('/settings/whatsapp')
      .then(({ data }) => {
        setConfig(data);
        setPhone(data.phone ?? '');
        setProvider(data.provider ?? 'zapi');
        setInstanceId(data.instanceId ?? '');
        setWelcomeMessage(data.welcomeMessage ?? welcomeMessage);
      })
      .catch((err) => {
        if (err?.response?.status === 404 || err?.response?.status === 501) {
          setEndpointAvailable(false);
        }
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const webhookUrl =
    config?.webhookUrl ??
    `${process.env.NEXT_PUBLIC_API_URL ?? 'https://rrapi.up.railway.app'}/api/v1/webhooks/whatsapp/${user?.id ?? 'COACH_ID'}`;

  const handleSave = async () => {
    if (!endpointAvailable) {
      setFeedback({ type: 'error', message: 'Endpoint em breve — configuração salva localmente.' });
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      await api.put('/settings/whatsapp', {
        phone,
        provider,
        ...(apiToken ? { apiToken } : {}),
        instanceId,
        welcomeMessage,
      });
      setFeedback({ type: 'success', message: 'Configuração salva com sucesso.' });
      setApiToken('');
      const { data } = await api.get<WhatsAppConfig>('/settings/whatsapp');
      setConfig(data);
    } catch (err: unknown) {
      const anyErr = err as { response?: { data?: { message?: string } } };
      setFeedback({
        type: 'error',
        message: anyErr?.response?.data?.message ?? 'Erro ao salvar configuração.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <a
          href="/dashboard/settings"
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition mb-4"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Configurações
        </a>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">WhatsApp Bot</h1>
        <p className="text-sm text-gray-500 mt-1">Configure a integração com WhatsApp para comunicação com atletas</p>
      </div>

      {!endpointAvailable && (
        <div className="mb-5 flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-100">
          <svg className="w-5 h-5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <p className="text-sm text-amber-700">
            Integração em desenvolvimento — a UI está disponível para configuração antecipada.
          </p>
        </div>
      )}

      <div className="max-w-2xl space-y-6">
        {/* Status Card */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Status</h2>
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${config?.connected ? 'bg-emerald-500' : 'bg-gray-300'} shadow-sm`} />
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {config?.connected ? 'Conectado' : 'Desconectado'}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {config?.connected
                  ? `Número ativo: ${phone || config?.phone}`
                  : 'Configure as credenciais abaixo para conectar'}
              </p>
            </div>
            {/* WhatsApp icon */}
            <div className={`ml-auto w-10 h-10 rounded-xl flex items-center justify-center ${config?.connected ? 'bg-emerald-50' : 'bg-gray-50'}`}>
              <svg viewBox="0 0 24 24" className={`w-6 h-6 ${config?.connected ? 'text-emerald-500' : 'text-gray-300'}`} fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
            </div>
          </div>
        </div>

        {/* Configuration Card */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-5">Configuração</h2>

          {loading ? (
            <div className="space-y-4 animate-pulse">
              {[1, 2, 3].map(i => (
                <div key={i}>
                  <div className="h-3 w-24 bg-gray-100 rounded mb-2" />
                  <div className="h-10 bg-gray-100 rounded-xl" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Phone */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Número do WhatsApp
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+5511999999999"
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/40 transition"
                />
                <p className="text-xs text-gray-400 mt-1">Formato internacional: +55 + DDD + número</p>
              </div>

              {/* Provider */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Provedor</label>
                <select
                  value={provider}
                  onChange={e => setProvider(e.target.value as WhatsAppProvider)}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/40 transition"
                >
                  {PROVIDERS.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>

              {/* API Token */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">API Token</label>
                <div className="relative">
                  <input
                    type={showToken ? 'text' : 'password'}
                    value={apiToken}
                    onChange={e => setApiToken(e.target.value)}
                    placeholder={config?.hasToken ? '••••• (salvo — cole para atualizar)' : 'Cole seu token aqui'}
                    className="w-full px-3.5 py-2.5 pr-10 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/40 transition font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showToken ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Instance ID (Z-API specific) */}
              {provider === 'zapi' && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">
                    Instance ID <span className="text-gray-300">(Z-API)</span>
                  </label>
                  <input
                    type="text"
                    value={instanceId}
                    onChange={e => setInstanceId(e.target.value)}
                    placeholder="Ex: 3DC4B58BXXXX"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/40 transition font-mono"
                  />
                </div>
              )}

              {/* Webhook URL (readonly) */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Webhook URL <span className="text-gray-300">(gerado automaticamente)</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={webhookUrl}
                    readOnly
                    className="flex-1 px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl text-gray-500 font-mono cursor-text"
                  />
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(webhookUrl)}
                    className="px-3 py-2.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 rounded-xl transition shrink-0"
                    title="Copiar URL"
                  >
                    Copiar
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">Cole esta URL no painel do seu provedor</p>
              </div>
            </div>
          )}
        </div>

        {/* Welcome Message */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Mensagem de Boas-vindas</h2>
          <p className="text-xs text-gray-400 mb-4">
            Variáveis disponíveis: <code className="bg-gray-100 px-1 rounded">{'{nome}'}</code>{' '}
            <code className="bg-gray-100 px-1 rounded">{'{coachName}'}</code>{' '}
            <code className="bg-gray-100 px-1 rounded">{'{onboardingLink}'}</code>
          </p>
          <textarea
            value={welcomeMessage}
            onChange={e => setWelcomeMessage(e.target.value)}
            rows={4}
            className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/40 transition resize-none"
          />
        </div>

        {/* Save button */}
        <div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 transition flex items-center gap-2"
          >
            {saving && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            Salvar Configuração
          </button>
          {feedback && (
            <p className={`text-sm mt-3 font-medium ${feedback.type === 'success' ? 'text-emerald-600' : 'text-red-500'}`}>
              {feedback.message}
            </p>
          )}
        </div>

        {/* Instructions Card */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Como conectar o Z-API</h2>
          <ol className="space-y-3 text-sm text-gray-600">
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold flex items-center justify-center shrink-0">1</span>
              <span>Acesse <strong>z-api.io</strong> e crie uma conta gratuita</span>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold flex items-center justify-center shrink-0">2</span>
              <span>Crie uma nova instância e copie o <strong>Instance ID</strong> e o <strong>Token</strong></span>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold flex items-center justify-center shrink-0">3</span>
              <span>Cole a <strong>Webhook URL</strong> acima no campo &ldquo;Webhook&rdquo; da sua instância Z-API</span>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold flex items-center justify-center shrink-0">4</span>
              <span>Escaneie o QR Code no painel Z-API para conectar seu WhatsApp</span>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold flex items-center justify-center shrink-0">5</span>
              <span>Preencha os campos acima e clique em <strong>Salvar Configuração</strong></span>
            </li>
          </ol>
          <a
            href="https://developer.z-api.io"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 mt-4 text-sm font-medium text-indigo-600 hover:text-indigo-700 transition"
          >
            Ver documentação Z-API
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
}
