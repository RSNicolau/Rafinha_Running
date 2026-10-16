'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, friendlyError } from '@/lib/api';

type AIProvider = 'anthropic' | 'openai' | 'gemini' | 'grok';

interface ProviderInfo {
  id: AIProvider;
  label: string;
  defaultModel: string;
  platformAvailable: boolean;
}

interface BrainSettings {
  provider: AIProvider;
  model: string | null;
  byok: boolean;
  hasApiKey: boolean;
  configured?: boolean;
  defaultModel?: string;
  availableProviders: ProviderInfo[];
}

type FeedbackState = { type: 'success' | 'error'; message: string } | null;

/** Modelos alternativos por provedor (o primeiro da lista é SEMPRE o padrão informado pela API). */
const EXTRA_MODELS: Record<AIProvider, string[]> = {
  anthropic: ['claude-sonnet-4-5', 'claude-haiku-4-5'],
  openai: ['gpt-4o-mini', 'gpt-4.1'],
  gemini: ['gemini-1.5-pro'],
  grok: ['grok-3-mini'],
};

const KEY_HELP: Record<AIProvider, string> = {
  anthropic: 'console.anthropic.com',
  openai: 'platform.openai.com',
  gemini: 'aistudio.google.com',
  grok: 'console.x.ai',
};

const PROVIDER_DESCRIPTIONS: Record<AIProvider, string> = {
  anthropic: 'Claude — recomendado (também analisa PDFs e imagens de exames)',
  openai: 'GPT-4o e variantes',
  gemini: 'Gemini Flash e Pro',
  grok: 'Grok (xAI)',
};

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only peer" />
      <div className="w-10 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
    </label>
  );
}

export default function AISettingsPage() {
  const [settings, setSettings] = useState<BrainSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [provider, setProvider] = useState<AIProvider>('anthropic');
  const [model, setModel] = useState('');
  const [byok, setByok] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<BrainSettings>('/coach-brain/settings');
      setSettings(data);
      setProvider(data.provider ?? 'anthropic');
      setModel(data.model ?? '');
      setByok(!!data.byok);
      setLoadError('');
    } catch (e) {
      setLoadError(friendlyError(e, 'Não foi possível carregar as configurações de IA.'));
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const providers: ProviderInfo[] = settings?.availableProviders ?? [];
  const current = providers.find((p) => p.id === provider);
  const defaultModel = current?.defaultModel ?? '';
  const models = defaultModel ? [defaultModel, ...EXTRA_MODELS[provider].filter((m) => m !== defaultModel)] : EXTRA_MODELS[provider];
  const needsKey = byok && !apiKey && !(settings?.byok && settings?.hasApiKey && settings.provider === provider);

  const handleSave = async () => {
    if (needsKey) {
      setFeedback({ type: 'error', message: 'Cole sua chave de API para usar o modo BYOK.' });
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      await api.patch('/users/me/ai-settings', {
        aiProvider: provider,
        aiModel: model || '',
        aiByok: byok,
        ...(byok && apiKey ? { aiApiKey: apiKey } : {}),
      });
      setApiKey('');
      await load();
      setFeedback({ type: 'success', message: 'Configurações de IA salvas.' });
    } catch (err) {
      setFeedback({ type: 'error', message: friendlyError(err, 'Erro ao salvar configurações.') });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setFeedback(null);
    try {
      const { data } = await api.post('/coach-brain/settings/test');
      setFeedback({ type: 'success', message: `Conexão OK — ${data.model} respondeu em ${data.latencyMs} ms.` });
    } catch (err) {
      setFeedback({ type: 'error', message: friendlyError(err, 'Não foi possível testar a conexão.') });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-xl animate-pulse space-y-4">
        <div className="h-8 w-48 bg-gray-100 rounded" />
        <div className="h-64 bg-gray-100 rounded-2xl" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-xl">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 mb-4">Configurações de IA</h1>
        <div className="p-4 rounded-xl bg-red-50 border border-red-100 text-sm text-red-700">{loadError}</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <Link href="/dashboard/settings" className="text-sm text-gray-500 hover:text-gray-700">← Configurações</Link>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 mt-2">Configurações de IA</h1>
        <p className="text-sm text-gray-500 mt-1">Provedor, modelo e chave usados pelo Assistente, CoachBrain, análises e planilhas.</p>
      </div>

      <div className="max-w-xl space-y-6">
        {/* Status */}
        <div
          className={`p-4 rounded-xl border text-sm ${
            settings?.configured ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}
        >
          {settings?.configured ? (
            <p>
              <strong>IA configurada</strong> — {settings.byok ? 'usando sua própria chave (BYOK)' : 'usando a chave da plataforma'}.
            </p>
          ) : (
            <p>
              <strong>IA não configurada.</strong> A plataforma não tem chave para o provedor escolhido. Ative &quot;Usar minha própria
              chave&quot; e cole a chave do provedor para liberar as funções de IA.
            </p>
          )}
        </div>

        {feedback && (
          <div
            role="status"
            className={`px-4 py-3 rounded-xl text-sm font-medium ${
              feedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                : 'bg-red-50 text-red-700 border border-red-100'
            }`}
          >
            {feedback.message}
          </div>
        )}

        <div className="glass-card p-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-5">Provedor de IA</h2>
          <div className="space-y-2">
            {providers.map((p) => {
              const selected = provider === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { setProvider(p.id); setModel(''); setFeedback(null); }}
                  className={`w-full flex items-center justify-between gap-3 p-4 rounded-xl border text-left transition-all ${
                    selected ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/20' : 'border-gray-200 bg-white hover:border-primary/20'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{p.label}</p>
                    <p className="text-xs text-gray-400">{PROVIDER_DESCRIPTIONS[p.id]}</p>
                  </div>
                  <span
                    className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      p.platformAvailable ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {p.platformAvailable ? 'incluso na plataforma' : 'requer sua chave'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="glass-card p-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Modelo</h2>
          <div className="space-y-2">
            {models.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setModel(m === defaultModel ? '' : m)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                  (model || defaultModel) === m ? 'border-primary/40 bg-primary/5' : 'border-gray-200 bg-white hover:border-primary/20'
                }`}
              >
                <span className="text-sm font-mono text-gray-700 break-all">{m}</span>
                {m === defaultModel && (
                  <span className="ml-auto shrink-0 text-xs bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full font-medium">padrão</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center justify-between gap-4 mb-2">
            <div>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Usar minha própria chave (BYOK)</h2>
              <p className="text-xs text-gray-400">O custo vai para a sua conta no provedor</p>
            </div>
            <Toggle checked={byok} onChange={(v) => { setByok(v); setFeedback(null); }} />
          </div>

          {byok && (
            <div className="mt-3">
              <label htmlFor="ai-key" className="block text-xs font-medium text-gray-500 mb-1.5">
                Chave de API <span className="text-gray-300">({KEY_HELP[provider]})</span>
              </label>
              <div className="relative">
                <input
                  id="ai-key"
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  autoComplete="off"
                  placeholder={settings?.byok && settings?.hasApiKey ? '••••• (chave salva — cole para trocar)' : 'Cole sua chave aqui'}
                  className="w-full px-3.5 py-2.5 pr-16 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
                >
                  {showKey ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">A chave é criptografada antes de ser salva e nunca é exibida de volta.</p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white text-sm font-medium rounded-xl transition cursor-pointer flex items-center gap-2"
          >
            {saving && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            Salvar
          </button>
          <button
            onClick={handleTest}
            disabled={testing || saving}
            className="px-5 py-2.5 border border-gray-200 hover:bg-gray-50 disabled:opacity-60 text-gray-700 text-sm font-medium rounded-xl transition cursor-pointer flex items-center gap-2"
          >
            {testing && <span className="w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />}
            Testar conexão
          </button>
        </div>
      </div>
    </div>
  );
}
