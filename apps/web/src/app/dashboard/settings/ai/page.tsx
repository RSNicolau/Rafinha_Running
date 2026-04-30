'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type AIProvider = 'anthropic' | 'openai' | 'gemini';

interface AISettings {
  aiProvider: AIProvider;
  aiModel: string | null;
  aiByok: boolean;
}

type FeedbackState = { type: 'success' | 'error'; message: string } | null;

const PROVIDERS: { id: AIProvider; label: string; description: string; models: string[] }[] = [
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    description: 'Claude Opus, Sonnet e Haiku',
    models: ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-3-5'],
  },
  {
    id: 'openai',
    label: 'OpenAI (GPT)',
    description: 'GPT-4o e variantes',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  },
  {
    id: 'gemini',
    label: 'Google (Gemini)',
    description: 'Gemini Flash e Pro',
    models: ['gemini-2.0-flash', 'gemini-1.5-pro'],
  },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only peer" />
      <div className="w-10 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
    </label>
  );
}

export default function AISettingsPage() {
  const [settings, setSettings] = useState<AISettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState<AIProvider>('anthropic');
  const [model, setModel] = useState('');
  const [byok, setByok] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  useEffect(() => {
    api
      .get<AISettings>('/users/me')
      .then(({ data }) => {
        const s = {
          aiProvider: (data as any).aiProvider as AIProvider || 'anthropic',
          aiModel: (data as any).aiModel || null,
          aiByok: (data as any).aiByok || false,
        };
        setSettings(s);
        setProvider(s.aiProvider);
        setModel(s.aiModel || '');
        setByok(s.aiByok);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      await api.patch('/users/me/ai-settings', {
        aiProvider: provider,
        aiModel: model || undefined,
        aiByok: byok,
        ...(byok && apiKey ? { aiApiKey: apiKey } : {}),
      });
      setApiKey('');
      setFeedback({ type: 'success', message: 'Configurações de IA salvas com sucesso.' });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.response?.data?.message || 'Erro ao salvar configurações.' });
    } finally {
      setSaving(false);
    }
  };

  const currentProvider = PROVIDERS.find((p) => p.id === provider)!;

  if (loading) {
    return (
      <div className="max-w-xl animate-pulse space-y-4">
        <div className="h-8 w-48 bg-gray-100 rounded" />
        <div className="h-64 bg-gray-100 rounded-2xl" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Configurações de IA</h1>
        <p className="text-sm text-gray-500 mt-1">Escolha o provedor e modelo de IA para suas interações</p>
      </div>

      {feedback && (
        <div
          className={`mb-5 px-4 py-3 rounded-xl text-sm font-medium ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
              : 'bg-red-50 text-red-700 border border-red-100'
          }`}
        >
          {feedback.message}
        </div>
      )}

      <div className="max-w-xl space-y-6">
        <div className="glass-card p-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-5">Provedor de IA</h2>

          <div className="space-y-2">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => { setProvider(p.id); setModel(''); }}
                className={`w-full flex items-center justify-between p-4 rounded-xl border text-left transition-all ${
                  provider === p.id
                    ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/20'
                    : 'border-gray-200 bg-white hover:border-primary/20'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-4 h-4 rounded-full border-2 transition ${
                    provider === p.id ? 'border-primary bg-primary' : 'border-gray-300'
                  }`}>
                    {provider === p.id && (
                      <div className="w-full h-full rounded-full bg-white scale-50 transform" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{p.label}</p>
                    <p className="text-xs text-gray-400">{p.description}</p>
                  </div>
                </div>
                {provider === p.id && (
                  <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Model selector */}
        <div className="glass-card p-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Modelo</h2>

          <div className="space-y-2">
            {currentProvider.models.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setModel(m)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                  model === m
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-gray-200 bg-white hover:border-primary/20'
                }`}
              >
                <div className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 transition ${
                  model === m ? 'border-primary bg-primary' : 'border-gray-300'
                }`} />
                <span className="text-sm font-mono text-gray-700">{m}</span>
                {m === currentProvider.models[0] && (
                  <span className="ml-auto text-xs bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full font-medium">recomendado</span>
                )}
              </button>
            ))}
          </div>

          {!model && (
            <p className="text-xs text-gray-400 mt-3">
              Nenhum modelo selecionado — será usado o padrão do provedor.
            </p>
          )}
        </div>

        {/* BYOK */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Usar minha própria API Key (BYOK)</h2>
              <p className="text-xs text-gray-400">O custo vai para sua conta no provedor</p>
            </div>
            <Toggle checked={byok} onChange={setByok} />
          </div>

          {byok && (
            <div className="mt-3">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                API Key{' '}
                <span className="text-gray-300">
                  ({provider === 'anthropic' ? 'console.anthropic.com' : provider === 'openai' ? 'platform.openai.com' : 'aistudio.google.com'})
                </span>
              </label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={settings?.aiByok ? '••••• (chave salva — cole para atualizar)' : 'Cole sua API key aqui'}
                  className="w-full px-3.5 py-2.5 pr-10 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showKey ? (
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
              <p className="text-xs text-gray-400 mt-1">A chave é criptografada antes de ser salva.</p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white text-sm font-medium rounded-xl transition cursor-pointer flex items-center gap-2"
          >
            {saving && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            Salvar Configurações
          </button>
          <a
            href="/dashboard/settings"
            className="text-sm text-gray-500 hover:text-gray-700 transition"
          >
            Voltar
          </a>
        </div>
      </div>
    </div>
  );
}
