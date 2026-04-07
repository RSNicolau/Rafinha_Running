'use client';

import { useEffect, useState, useRef } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  preferences?: {
    notifications?: {
      new_workout?: boolean;
      athlete_alert?: boolean;
      payment_confirmation?: boolean;
    };
  };
}

interface ProfileForm {
  name: string;
  phone: string;
}

interface PasswordForm {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface NotificationPrefs {
  new_workout: boolean;
  athlete_alert: boolean;
  payment_confirmation: boolean;
}

type FeedbackState = { type: 'success' | 'error'; message: string } | null;

interface BrandingForm {
  tenantName: string;
  primaryColor: string;
  logoUrl: string;
  bannerUrl: string;
  welcomeMsg: string;
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only peer"
      />
      <div className="w-10 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
    </label>
  );
}

function Feedback({ state }: { state: FeedbackState }) {
  if (!state) return null;
  return (
    <p
      className={`text-sm mt-3 font-medium ${
        state.type === 'success' ? 'text-emerald-600' : 'text-red-500'
      }`}
    >
      {state.message}
    </p>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function SettingsPage() {
  const storeUser = useAuthStore((s) => s.user);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // Perfil form
  const [profileForm, setProfileForm] = useState<ProfileForm>({ name: '', phone: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<FeedbackState>(null);

  // Segurança form
  const [passwordForm, setPasswordForm] = useState<PasswordForm>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<FeedbackState>(null);

  // Notificações
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>({
    new_workout: true,
    athlete_alert: true,
    payment_confirmation: true,
  });
  const [savingNotif, setSavingNotif] = useState(false);
  const [notifFeedback, setNotifFeedback] = useState<FeedbackState>(null);

  // Aparência
  const [darkMode, setDarkMode] = useState(false);

  // AI Assistant config (COACH only)
  const isCoach = storeUser?.role === 'COACH' || storeUser?.role === 'ADMIN' || storeUser?.role === 'SUPER_ADMIN';
  const [aiConfig, setAiConfig] = useState({ assistantName: 'Rafinha', tone: 'FRIENDLY', personaPrompt: '', voiceEnabled: false });
  const [savingAi, setSavingAi] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<FeedbackState>(null);

  // CoachBrain AI provider settings (COACH only)
  type AIProvider = 'anthropic' | 'openai' | 'gemini' | 'grok';
  interface ProviderInfo { id: AIProvider; label: string; defaultModel: string; platformAvailable: boolean }
  interface AIProviderSettings {
    provider: AIProvider;
    model: string | null;
    byok: boolean;
    hasApiKey: boolean;
    providerLabel: string;
    defaultModel: string;
    availableProviders: ProviderInfo[];
  }
  const [brainSettings, setBrainSettings] = useState<AIProviderSettings | null>(null);
  const [brainByok, setBrainByok] = useState(false);
  const [brainProvider, setBrainProvider] = useState<AIProvider>('anthropic');
  const [brainModel, setBrainModel] = useState('');
  const [brainApiKey, setBrainApiKey] = useState('');
  const [showBrainKey, setShowBrainKey] = useState(false);
  const [savingBrain, setSavingBrain] = useState(false);
  const [testingBrain, setTestingBrain] = useState(false);
  const [brainFeedback, setBrainFeedback] = useState<FeedbackState>(null);
  const [brainTestResult, setBrainTestResult] = useState<{ ok: boolean; latencyMs: number; model: string } | null>(null);

  // Payment gateway settings (COACH only)
  const [paymentSettings, setPaymentSettings] = useState<{ provider: string; paymentEnabled: boolean; hasPagarmeKey: boolean; hasStripeKey: boolean } | null>(null);
  const [paymentProvider, setPaymentProvider] = useState<'pagarme' | 'stripe'>('pagarme');
  const [paymentEnabled, setPaymentEnabled] = useState(false);
  const [pagarmeApiKey, setPagarmeApiKey] = useState('');
  const [pagarmeWebhook, setPagarmeWebhook] = useState('');
  const [stripeKey, setStripeKey] = useState('');
  const [stripeWebhook, setStripeWebhook] = useState('');
  const [showPaymentKeys, setShowPaymentKeys] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [testingPayment, setTestingPayment] = useState(false);
  const [paymentFeedback, setPaymentFeedback] = useState<FeedbackState>(null);
  const [paymentTestResult, setPaymentTestResult] = useState<{ ok: boolean; latencyMs: number } | null>(null);

  // Branding (COACH only)
  const [brandingForm, setBrandingForm] = useState<BrandingForm>({
    tenantName: '',
    primaryColor: '#DC2626',
    logoUrl: '',
    bannerUrl: '',
    welcomeMsg: '',
  });
  const [savingBranding, setSavingBranding] = useState(false);
  const [brandingFeedback, setBrandingFeedback] = useState<FeedbackState>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  // Load user on mount
  useEffect(() => {
    api
      .get<UserProfile>('/users/me')
      .then(({ data }) => {
        setProfile(data);
        setProfileForm({ name: data.name || '', phone: data.phone || '' });
        if (data.preferences?.notifications) {
          setNotifPrefs({
            new_workout: data.preferences.notifications.new_workout ?? true,
            athlete_alert: data.preferences.notifications.athlete_alert ?? true,
            payment_confirmation: data.preferences.notifications.payment_confirmation ?? true,
          });
        }
      })
      .catch(() => {
        // Fall back to auth store data
        if (storeUser) {
          setProfileForm({ name: storeUser.name || '', phone: '' });
        }
      })
      .finally(() => setLoadingProfile(false));

    // Load dark mode preference from localStorage
    const stored = localStorage.getItem('rr_dark_mode');
    if (stored === 'true') setDarkMode(true);

    // Load AI config and branding for coaches
    if (storeUser?.role === 'COACH' || storeUser?.role === 'ADMIN' || storeUser?.role === 'SUPER_ADMIN') {
      api.get('/ai-assistant/config').then(({ data }) => {
        setAiConfig({ assistantName: data.assistantName ?? 'Rafinha', tone: data.tone ?? 'FRIENDLY', personaPrompt: data.personaPrompt ?? '', voiceEnabled: data.voiceEnabled ?? false });
      }).catch(() => {});

      api.get('/config/branding').then(({ data }) => {
        setBrandingForm({
          tenantName: data.tenantName || '',
          primaryColor: data.primaryColor || '#DC2626',
          logoUrl: data.logoUrl || '',
          bannerUrl: data.bannerUrl || '',
          welcomeMsg: data.welcomeMsg || '',
        });
      }).catch(() => {});

      api.get('/coach-brain/settings').then(({ data }) => {
        setBrainSettings(data);
        setBrainProvider(data.provider);
        setBrainByok(data.byok);
        setBrainModel(data.model ?? '');
      }).catch(() => {});

      api.get('/payments/settings').then(({ data }) => {
        setPaymentSettings(data);
        setPaymentProvider(data.provider ?? 'pagarme');
        setPaymentEnabled(data.paymentEnabled ?? false);
      }).catch(() => {});
    }
  }, [storeUser]);

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setProfileFeedback(null);
    try {
      await api.put('/users/me', { name: profileForm.name, phone: profileForm.phone });
      setProfileFeedback({ type: 'success', message: 'Perfil atualizado com sucesso.' });
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Erro ao salvar perfil.';
      setProfileFeedback({ type: 'error', message: msg });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSavePassword = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordFeedback({ type: 'error', message: 'As senhas não coincidem.' });
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      setPasswordFeedback({ type: 'error', message: 'A nova senha deve ter pelo menos 6 caracteres.' });
      return;
    }
    setSavingPassword(true);
    setPasswordFeedback(null);
    try {
      await api.put('/users/me/password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      setPasswordFeedback({ type: 'success', message: 'Senha alterada com sucesso.' });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err: any) {
      // Try fallback endpoint
      try {
        await api.post('/auth/change-password', {
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        });
        setPasswordFeedback({ type: 'success', message: 'Senha alterada com sucesso.' });
        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      } catch (err2: any) {
        const msg = err2.response?.data?.message || err.response?.data?.message || 'Erro ao alterar senha.';
        setPasswordFeedback({ type: 'error', message: msg });
      }
    } finally {
      setSavingPassword(false);
    }
  };

  const handleSaveNotifications = async () => {
    setSavingNotif(true);
    setNotifFeedback(null);
    try {
      await api.put('/users/me', {
        preferences: { notifications: notifPrefs },
      });
      setNotifFeedback({ type: 'success', message: 'Preferências salvas.' });
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Erro ao salvar preferências.';
      setNotifFeedback({ type: 'error', message: msg });
    } finally {
      setSavingNotif(false);
    }
  };

  const handleDarkModeToggle = (val: boolean) => {
    setDarkMode(val);
    localStorage.setItem('rr_dark_mode', String(val));
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024) {
      setBrandingFeedback({ type: 'error', message: 'Logo deve ter menos de 500KB.' });
      return;
    }
    const base64 = await fileToBase64(file);
    setBrandingForm((f) => ({ ...f, logoUrl: base64 }));
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setBrandingFeedback({ type: 'error', message: 'Banner deve ter menos de 1MB.' });
      return;
    }
    const base64 = await fileToBase64(file);
    setBrandingForm((f) => ({ ...f, bannerUrl: base64 }));
  };

  const handleSaveBranding = async () => {
    setSavingBranding(true);
    setBrandingFeedback(null);
    try {
      await api.put('/config/branding', brandingForm);
      setBrandingFeedback({ type: 'success', message: 'Personalização salva com sucesso.' });
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Erro ao salvar personalização.';
      setBrandingFeedback({ type: 'error', message: msg });
    } finally {
      setSavingBranding(false);
    }
  };

  const handleSavePaymentSettings = async () => {
    setSavingPayment(true);
    setPaymentFeedback(null);
    setPaymentTestResult(null);
    try {
      await api.put('/payments/settings', {
        provider: paymentProvider,
        paymentEnabled,
        ...(pagarmeApiKey ? { pagarmeApiKey } : {}),
        ...(pagarmeWebhook ? { pagarmeWebhookSecret: pagarmeWebhook } : {}),
        ...(stripeKey ? { stripeSecretKey: stripeKey } : {}),
        ...(stripeWebhook ? { stripeWebhookSecret: stripeWebhook } : {}),
      });
      setPaymentFeedback({ type: 'success', message: 'Configurações de pagamento salvas.' });
      setPagarmeApiKey(''); setPagarmeWebhook(''); setStripeKey(''); setStripeWebhook('');
      const { data } = await api.get('/payments/settings');
      setPaymentSettings(data);
    } catch (err: any) {
      setPaymentFeedback({ type: 'error', message: err.response?.data?.message || 'Erro ao salvar.' });
    } finally {
      setSavingPayment(false);
    }
  };

  const handleTestPaymentConnection = async () => {
    setTestingPayment(true);
    setPaymentTestResult(null);
    setPaymentFeedback(null);
    try {
      const { data } = await api.post('/payments/settings/test');
      setPaymentTestResult({ ok: true, latencyMs: data.latencyMs });
    } catch (err: any) {
      setPaymentFeedback({ type: 'error', message: err.response?.data?.message || 'Conexão falhou.' });
    } finally {
      setTestingPayment(false);
    }
  };

  const handleSaveBrainSettings = async () => {
    setSavingBrain(true);
    setBrainFeedback(null);
    setBrainTestResult(null);
    try {
      await api.put('/coach-brain/settings', {
        provider: brainProvider,
        model: brainModel || undefined,
        byok: brainByok,
        apiKey: brainByok && brainApiKey ? brainApiKey : undefined,
      });
      setBrainFeedback({ type: 'success', message: 'Configurações do CoachBrain salvas.' });
      setBrainApiKey(''); // clear key field after save
      // Refresh settings
      const { data } = await api.get('/coach-brain/settings');
      setBrainSettings(data);
    } catch (err: any) {
      setBrainFeedback({ type: 'error', message: err.response?.data?.message || 'Erro ao salvar.' });
    } finally {
      setSavingBrain(false);
    }
  };

  const handleTestBrainConnection = async () => {
    setTestingBrain(true);
    setBrainTestResult(null);
    setBrainFeedback(null);
    try {
      const { data } = await api.post('/coach-brain/settings/test');
      setBrainTestResult({ ok: true, latencyMs: data.latencyMs, model: data.model });
    } catch (err: any) {
      setBrainFeedback({ type: 'error', message: err.response?.data?.message || 'Conexão falhou.' });
    } finally {
      setTestingBrain(false);
    }
  };

  const handleSaveAiConfig = async () => {
    setSavingAi(true);
    setAiFeedback(null);
    try {
      await api.put('/ai-assistant/config', aiConfig);
      setAiFeedback({ type: 'success', message: 'Configuração da IA salva com sucesso.' });
    } catch (err: any) {
      setAiFeedback({ type: 'error', message: err.response?.data?.message || 'Erro ao salvar configuração.' });
    } finally {
      setSavingAi(false);
    }
  };

  const displayName = profile?.name || storeUser?.name || '';
  const displayEmail = profile?.email || storeUser?.email || '';
  const displayInitial = displayName.charAt(0).toUpperCase();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Configurações</h1>
        <p className="text-sm text-gray-500 mt-1">Gerencie suas preferências</p>
      </div>

      <div className="max-w-2xl space-y-6">
        {/* Perfil */}
        <div className="glass-card p-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-5">Perfil</h2>

          {loadingProfile ? (
            <div className="space-y-3 animate-pulse">
              <div className="flex items-center gap-4 mb-5">
                <div className="w-14 h-14 rounded-2xl bg-gray-100" />
                <div className="space-y-2">
                  <div className="h-4 w-32 bg-gray-100 rounded" />
                  <div className="h-3 w-48 bg-gray-100 rounded" />
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-xl font-bold text-primary">{displayInitial}</span>
                </div>
                <div>
                  <p className="text-base font-semibold text-gray-900">{displayName}</p>
                  <p className="text-sm text-gray-500">{displayEmail}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Nome</label>
                  <input
                    type="text"
                    value={profileForm.name}
                    onChange={(e) => setProfileForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition"
                    placeholder="Seu nome"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">E-mail</label>
                  <input
                    type="email"
                    value={displayEmail}
                    readOnly
                    className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl text-gray-400 cursor-not-allowed"
                  />
                  <p className="text-xs text-gray-400 mt-1">O e-mail não pode ser alterado.</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Telefone / WhatsApp</label>
                  <input
                    type="tel"
                    value={profileForm.phone}
                    onChange={(e) => setProfileForm((f) => ({ ...f, phone: e.target.value }))}
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition"
                    placeholder="+55 11 99999-9999"
                  />
                </div>
              </div>

              <div className="mt-5 flex items-center gap-3">
                <button
                  onClick={handleSaveProfile}
                  disabled={savingProfile}
                  className="px-5 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white text-sm font-medium rounded-xl transition cursor-pointer flex items-center gap-2"
                >
                  {savingProfile && (
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  )}
                  Salvar Perfil
                </button>
              </div>

              <Feedback state={profileFeedback} />
            </>
          )}
        </div>

        {/* Segurança */}
        <div className="glass-card p-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-5">Segurança</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Senha atual</label>
              <input
                type="password"
                value={passwordForm.currentPassword}
                onChange={(e) =>
                  setPasswordForm((f) => ({ ...f, currentPassword: e.target.value }))
                }
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition"
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Nova senha</label>
              <input
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) =>
                  setPasswordForm((f) => ({ ...f, newPassword: e.target.value }))
                }
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition"
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Confirmar nova senha</label>
              <input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) =>
                  setPasswordForm((f) => ({ ...f, confirmPassword: e.target.value }))
                }
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition"
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </div>
          </div>

          <div className="mt-5">
            <button
              onClick={handleSavePassword}
              disabled={
                savingPassword ||
                !passwordForm.currentPassword ||
                !passwordForm.newPassword ||
                !passwordForm.confirmPassword
              }
              className="px-5 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white text-sm font-medium rounded-xl transition cursor-pointer flex items-center gap-2"
            >
              {savingPassword && (
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              Alterar Senha
            </button>
          </div>

          <Feedback state={passwordFeedback} />
        </div>

        {/* Notificações */}
        <div className="glass-card p-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Notificações</h2>

          <div className="space-y-4">
            {(
              [
                {
                  key: 'new_workout' as const,
                  label: 'Novo treino registrado',
                  desc: 'Quando um atleta registra um treino',
                },
                {
                  key: 'athlete_alert' as const,
                  label: 'Alerta de atleta',
                  desc: 'Alertas sobre inatividade ou treinos perdidos',
                },
                {
                  key: 'payment_confirmation' as const,
                  label: 'Confirmação de pagamento',
                  desc: 'Quando um pagamento é confirmado',
                },
              ] as const
            ).map((item) => (
              <div key={item.key} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{item.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
                </div>
                <Toggle
                  checked={notifPrefs[item.key]}
                  onChange={(val) =>
                    setNotifPrefs((p) => ({ ...p, [item.key]: val }))
                  }
                />
              </div>
            ))}
          </div>

          <div className="mt-5">
            <button
              onClick={handleSaveNotifications}
              disabled={savingNotif}
              className="px-5 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white text-sm font-medium rounded-xl transition cursor-pointer flex items-center gap-2"
            >
              {savingNotif && (
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              Salvar Notificações
            </button>
          </div>

          <Feedback state={notifFeedback} />
        </div>

        {/* Aparência */}
        <div className="glass-card p-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Aparência</h2>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Modo escuro</p>
              <p className="text-xs text-gray-400 mt-0.5">Alterna entre tema claro e escuro</p>
            </div>
            <Toggle checked={darkMode} onChange={handleDarkModeToggle} />
          </div>

          <p className="text-xs text-gray-400 mt-4">
            A preferência de aparência é salva localmente neste dispositivo.
          </p>
        </div>

        {/* Branding — COACH/ADMIN only */}
        {isCoach && (
          <div className="glass-card p-6">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-5">Personalização do App</h2>

            <div className="space-y-5">
              {/* Tenant name */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Nome da assessoria</label>
                <input
                  type="text"
                  value={brandingForm.tenantName}
                  onChange={(e) => setBrandingForm((f) => ({ ...f, tenantName: e.target.value }))}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition"
                  placeholder="Ex: Rafinha Running"
                />
              </div>

              {/* Primary color */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Cor principal</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={brandingForm.primaryColor}
                    onChange={(e) => setBrandingForm((f) => ({ ...f, primaryColor: e.target.value }))}
                    className="w-10 h-10 rounded-lg cursor-pointer border border-gray-200 p-0.5"
                  />
                  <input
                    type="text"
                    value={brandingForm.primaryColor}
                    onChange={(e) => setBrandingForm((f) => ({ ...f, primaryColor: e.target.value }))}
                    className="w-28 px-3 py-2 text-sm font-mono bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="#DC2626"
                  />
                  <div
                    className="w-8 h-8 rounded-lg border border-gray-200"
                    style={{ backgroundColor: brandingForm.primaryColor }}
                  />
                </div>
              </div>

              {/* Logo */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Logo (PNG/JPG, máx 500KB)</label>
                <div className="flex items-center gap-3">
                  {brandingForm.logoUrl ? (
                    <div className="relative w-16 h-16 rounded-xl border border-gray-200 overflow-hidden bg-gray-50 flex items-center justify-center">
                      <img src={brandingForm.logoUrl} alt="Logo" className="w-full h-full object-contain" />
                      <button
                        onClick={() => setBrandingForm((f) => ({ ...f, logoUrl: '' }))}
                        className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-white text-xs leading-none"
                      >×</button>
                    </div>
                  ) : (
                    <div
                      onClick={() => logoInputRef.current?.click()}
                      className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center cursor-pointer hover:border-primary/40 transition"
                    >
                      <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    className="px-3 py-2 text-xs font-medium bg-gray-100 hover:bg-gray-200 rounded-xl transition"
                  >
                    {brandingForm.logoUrl ? 'Trocar logo' : 'Enviar logo'}
                  </button>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={handleLogoUpload}
                  />
                </div>
              </div>

              {/* Banner */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Banner de fundo (PNG/JPG, máx 1MB)</label>
                <div className="flex items-center gap-3">
                  {brandingForm.bannerUrl ? (
                    <div className="relative w-32 h-16 rounded-xl border border-gray-200 overflow-hidden bg-gray-50">
                      <img src={brandingForm.bannerUrl} alt="Banner" className="w-full h-full object-cover" />
                      <button
                        onClick={() => setBrandingForm((f) => ({ ...f, bannerUrl: '' }))}
                        className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-white text-xs leading-none"
                      >×</button>
                    </div>
                  ) : (
                    <div
                      onClick={() => bannerInputRef.current?.click()}
                      className="w-32 h-16 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center cursor-pointer hover:border-primary/40 transition"
                    >
                      <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => bannerInputRef.current?.click()}
                    className="px-3 py-2 text-xs font-medium bg-gray-100 hover:bg-gray-200 rounded-xl transition"
                  >
                    {brandingForm.bannerUrl ? 'Trocar banner' : 'Enviar banner'}
                  </button>
                  <input
                    ref={bannerInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={handleBannerUpload}
                  />
                </div>
              </div>

              {/* Welcome message */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Mensagem de boas-vindas</label>
                <input
                  type="text"
                  value={brandingForm.welcomeMsg}
                  onChange={(e) => setBrandingForm((f) => ({ ...f, welcomeMsg: e.target.value }))}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition"
                  placeholder="Ex: Entre para acessar seus treinos"
                />
              </div>
            </div>

            <div className="mt-5">
              <button
                onClick={handleSaveBranding}
                disabled={savingBranding}
                className="px-5 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white text-sm font-medium rounded-xl transition cursor-pointer flex items-center gap-2"
              >
                {savingBranding && (
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                Salvar Personalização
              </button>
            </div>

            <Feedback state={brandingFeedback} />
          </div>
        )}

        {/* IA Assistente — COACH only */}
        {isCoach && (
          <div className="glass-card p-6">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-5">IA Assistente</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Nome da IA</label>
                <input
                  type="text"
                  value={aiConfig.assistantName}
                  onChange={e => setAiConfig(c => ({ ...c, assistantName: e.target.value }))}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition"
                  placeholder="Ex: Rafinha"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Tom de comunicação</label>
                <select
                  value={aiConfig.tone}
                  onChange={e => setAiConfig(c => ({ ...c, tone: e.target.value }))}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition"
                >
                  <option value="FRIENDLY">Amigável e próximo</option>
                  <option value="PROFESSIONAL">Profissional e técnico</option>
                  <option value="MOTIVATIONAL">Motivador e energético</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Prompt de persona (opcional)</label>
                <textarea
                  value={aiConfig.personaPrompt}
                  onChange={e => setAiConfig(c => ({ ...c, personaPrompt: e.target.value }))}
                  rows={3}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition resize-none"
                  placeholder="Ex: Fale sempre com energia, use gírias do esporte e encoraje muito os atletas."
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">Resposta por voz</p>
                  <p className="text-xs text-gray-400 mt-0.5">A IA lê as respostas em voz alta (Chrome/Safari)</p>
                </div>
                <Toggle checked={aiConfig.voiceEnabled} onChange={v => setAiConfig(c => ({ ...c, voiceEnabled: v }))} />
              </div>
            </div>
            <div className="mt-5">
              <button
                onClick={handleSaveAiConfig}
                disabled={savingAi}
                className="px-5 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white text-sm font-medium rounded-xl transition cursor-pointer flex items-center gap-2"
              >
                {savingAi && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                Salvar Configuração IA
              </button>
            </div>
            <Feedback state={aiFeedback} />
          </div>
        )}

        {/* CoachBrain — Provedor de IA */}
        {isCoach && (
          <div className="glass-card p-6">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">CoachBrain — Provedor de IA</h2>
            <p className="text-xs text-gray-400 mb-5">Escolha qual modelo de IA alimenta seu assistente</p>

            <div className="space-y-5">
              {/* Mode toggle */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50 border border-gray-100">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {brainByok ? 'Chave própria (BYOK)' : 'Chave da plataforma'}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {brainByok
                      ? 'Você usa sua própria API key — custo vai na sua conta'
                      : 'A plataforma fornece a chave — incluída no plano'}
                  </p>
                </div>
                <Toggle checked={brainByok} onChange={(v) => { setBrainByok(v); setBrainFeedback(null); setBrainTestResult(null); }} />
              </div>

              {/* Provider selector */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Provedor</label>
                <div className="grid grid-cols-2 gap-2">
                  {(brainSettings?.availableProviders ?? [
                    { id: 'anthropic', label: 'Claude (Anthropic)', defaultModel: 'claude-opus-4-6', platformAvailable: true },
                    { id: 'openai',    label: 'GPT-4o (OpenAI)',    defaultModel: 'gpt-4o',          platformAvailable: false },
                    { id: 'gemini',    label: 'Gemini (Google)',    defaultModel: 'gemini-2.0-flash-exp', platformAvailable: false },
                    { id: 'grok',      label: 'Grok (xAI)',         defaultModel: 'grok-3',          platformAvailable: false },
                  ] as ProviderInfo[]).map((p) => {
                    const isSelected = brainProvider === p.id;
                    const unavailable = !brainByok && !p.platformAvailable;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={unavailable}
                        onClick={() => { setBrainProvider(p.id as AIProvider); setBrainModel(''); }}
                        className={`relative p-3 rounded-xl border text-left transition-all ${
                          isSelected
                            ? 'border-primary/50 bg-primary/5'
                            : unavailable
                              ? 'border-gray-100 bg-gray-50/50 opacity-50 cursor-not-allowed'
                              : 'border-gray-200 bg-white hover:border-primary/30'
                        }`}
                      >
                        <p className="text-xs font-semibold text-gray-800">{p.label}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{p.defaultModel}</p>
                        {!brainByok && p.platformAvailable && (
                          <span className="absolute top-2 right-2 text-[9px] font-medium bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-full">incluso</span>
                        )}
                        {!brainByok && !p.platformAvailable && (
                          <span className="absolute top-2 right-2 text-[9px] font-medium bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-full">BYOK</span>
                        )}
                        {isSelected && (
                          <span className="absolute top-2 right-2 w-3.5 h-3.5 rounded-full bg-primary flex items-center justify-center">
                            <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom model (optional) */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Modelo específico <span className="text-gray-300">(opcional — deixe vazio para usar o padrão)</span>
                </label>
                <input
                  type="text"
                  value={brainModel}
                  onChange={e => setBrainModel(e.target.value)}
                  placeholder={
                    brainProvider === 'anthropic' ? 'claude-opus-4-6' :
                    brainProvider === 'openai'    ? 'gpt-4o' :
                    brainProvider === 'gemini'    ? 'gemini-2.0-flash-exp' : 'grok-3'
                  }
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition font-mono"
                />
              </div>

              {/* BYOK API Key */}
              {brainByok && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">
                    Sua API Key ({
                      brainProvider === 'anthropic' ? 'console.anthropic.com' :
                      brainProvider === 'openai'    ? 'platform.openai.com' :
                      brainProvider === 'gemini'    ? 'aistudio.google.com' : 'console.x.ai'
                    })
                  </label>
                  <div className="relative">
                    <input
                      type={showBrainKey ? 'text' : 'password'}
                      value={brainApiKey}
                      onChange={e => setBrainApiKey(e.target.value)}
                      placeholder={brainSettings?.hasApiKey ? '••••••• (chave salva — cole para atualizar)' : 'Cole sua API key aqui'}
                      className="w-full px-3.5 py-2.5 pr-10 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowBrainKey(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showBrainKey ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                      )}
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">A chave é criptografada antes de ser salva</p>
                </div>
              )}

              {/* Test result */}
              {brainTestResult && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                  <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <p className="text-xs text-emerald-700 font-medium">
                    Conexão OK — {brainTestResult.model} respondeu em {brainTestResult.latencyMs}ms
                  </p>
                </div>
              )}
            </div>

            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={handleSaveBrainSettings}
                disabled={savingBrain}
                className="px-5 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white text-sm font-medium rounded-xl transition cursor-pointer flex items-center gap-2"
              >
                {savingBrain && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                Salvar
              </button>
              <button
                onClick={handleTestBrainConnection}
                disabled={testingBrain || savingBrain}
                className="px-5 py-2.5 border border-gray-200 hover:bg-gray-50 disabled:opacity-60 text-gray-700 text-sm font-medium rounded-xl transition cursor-pointer flex items-center gap-2"
              >
                {testingBrain && <span className="w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />}
                Testar conexão
              </button>
            </div>
            <Feedback state={brainFeedback} />
          </div>
        )}

        {/* Gateway de Pagamento — COACH only */}
        {isCoach && (
          <div className="glass-card p-6">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Gateway de Pagamento</h2>
            <p className="text-xs text-gray-400 mb-5">Sua conta própria — atletas pagam direto para você</p>

            <div className="space-y-5">
              {/* Enable toggle */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50 border border-gray-100">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Pagamentos ativos</p>
                  <p className="text-xs text-gray-400 mt-0.5">Permite que atletas paguem pelo app</p>
                </div>
                <Toggle checked={paymentEnabled} onChange={setPaymentEnabled} />
              </div>

              {/* Provider selector */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Gateway</label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { id: 'pagarme', label: 'Pagar.me', sub: 'Recomendado para BR', hasKey: paymentSettings?.hasPagarmeKey },
                    { id: 'stripe',  label: 'Stripe',   sub: 'Internacional',        hasKey: paymentSettings?.hasStripeKey },
                  ] as const).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPaymentProvider(p.id)}
                      className={`relative p-3 rounded-xl border text-left transition-all ${
                        paymentProvider === p.id
                          ? 'border-primary/50 bg-primary/5'
                          : 'border-gray-200 bg-white hover:border-primary/30'
                      }`}
                    >
                      <p className="text-xs font-semibold text-gray-800">{p.label}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{p.sub}</p>
                      {p.hasKey && (
                        <span className="absolute top-2 right-2 text-[9px] font-medium bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-full">configurado</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Pagar.me fields */}
              {paymentProvider === 'pagarme' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">
                      API Key <span className="text-gray-300">(dash.pagar.me → Configurações → API Keys)</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showPaymentKeys ? 'text' : 'password'}
                        value={pagarmeApiKey}
                        onChange={e => setPagarmeApiKey(e.target.value)}
                        placeholder={paymentSettings?.hasPagarmeKey ? '••••• (salva — cole para atualizar)' : 'sk_live_...'}
                        className="w-full px-3.5 py-2.5 pr-10 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition font-mono"
                      />
                      <button type="button" onClick={() => setShowPaymentKeys(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          {showPaymentKeys
                            ? <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                            : <><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></>
                          }
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Webhook Secret</label>
                    <input
                      type={showPaymentKeys ? 'text' : 'password'}
                      value={pagarmeWebhook}
                      onChange={e => setPagarmeWebhook(e.target.value)}
                      placeholder="whsec_..."
                      className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition font-mono"
                    />
                  </div>
                </div>
              )}

              {/* Stripe fields */}
              {paymentProvider === 'stripe' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">
                      Secret Key <span className="text-gray-300">(dashboard.stripe.com → Developers → API Keys)</span>
                    </label>
                    <input
                      type={showPaymentKeys ? 'text' : 'password'}
                      value={stripeKey}
                      onChange={e => setStripeKey(e.target.value)}
                      placeholder={paymentSettings?.hasStripeKey ? '••••• (salva — cole para atualizar)' : 'sk_live_...'}
                      className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Webhook Secret</label>
                    <input
                      type={showPaymentKeys ? 'text' : 'password'}
                      value={stripeWebhook}
                      onChange={e => setStripeWebhook(e.target.value)}
                      placeholder="whk_..."
                      className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition font-mono"
                    />
                  </div>
                </div>
              )}

              <p className="text-[10px] text-gray-400">Chaves criptografadas com AES-256 antes de salvar</p>

              {/* Test result */}
              {paymentTestResult && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                  <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <p className="text-xs text-emerald-700 font-medium">Conexão OK — respondeu em {paymentTestResult.latencyMs}ms</p>
                </div>
              )}
            </div>

            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={handleSavePaymentSettings}
                disabled={savingPayment}
                className="px-5 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white text-sm font-medium rounded-xl transition cursor-pointer flex items-center gap-2"
              >
                {savingPayment && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                Salvar
              </button>
              <button
                onClick={handleTestPaymentConnection}
                disabled={testingPayment || savingPayment || (!paymentSettings?.hasPagarmeKey && !paymentSettings?.hasStripeKey)}
                className="px-5 py-2.5 border border-gray-200 hover:bg-gray-50 disabled:opacity-40 text-gray-700 text-sm font-medium rounded-xl transition cursor-pointer flex items-center gap-2"
              >
                {testingPayment && <span className="w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />}
                Testar conexão
              </button>
            </div>
            <Feedback state={paymentFeedback} />
          </div>
        )}

        {/* Onboarding Form — COACH only */}
        {isCoach && (
          <div className="glass-card p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Questionário de Anamnese</h2>
                <p className="text-sm text-gray-600">Configure as perguntas para novos atletas</p>
                <p className="text-xs text-gray-400 mt-0.5">O atleta preenche online, a IA analisa e sugere um plano</p>
              </div>
              <a
                href="/dashboard/settings/onboarding-form"
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition shrink-0"
              >
                Editar Formulário →
              </a>
            </div>
          </div>
        )}

        {/* Danger Zone */}
        <div className="glass-card p-6 border-red-100">
          <h2 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-4">Zona de Perigo</h2>
          <button className="px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-xl hover:bg-red-50 transition cursor-pointer">
            Excluir Conta
          </button>
        </div>
      </div>
    </div>
  );
}
