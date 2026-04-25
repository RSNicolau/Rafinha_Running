'use client';

import { useEffect, useState, useRef } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatarUrl?: string | null;
  profileBannerUrl?: string | null;
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

/**
 * Resize an image to the exact target dimensions using center-crop (cover fit).
 * Returns a base64 JPEG string. No distortion, no stretching.
 */
function resizeImageCanvas(file: File, width: number, height: number, quality = 0.92): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas not supported')); return; }

      const imgAspect = img.width / img.height;
      const targetAspect = width / height;

      let sx = 0, sy = 0, sw = img.width, sh = img.height;
      if (imgAspect > targetAspect) {
        // Wider than target → crop sides
        sw = img.height * targetAspect;
        sx = (img.width - sw) / 2;
      } else {
        // Taller than target → crop top/bottom
        sh = img.width / targetAspect;
        sy = (img.height - sh) / 2;
      }

      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
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

  // AI Assistant config — only ADMIN/SUPER_ADMIN can customize
  const isCoach = storeUser?.role === 'COACH' || storeUser?.role === 'ADMIN' || storeUser?.role === 'SUPER_ADMIN';
  const isAdmin = storeUser?.role === 'ADMIN' || storeUser?.role === 'SUPER_ADMIN';
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

  // Profile photo & banner
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [profileBannerUrl, setProfileBannerUrl] = useState<string>('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const profileBannerInputRef = useRef<HTMLInputElement>(null);

  // Whether AI config has been loaded (for skeleton)
  const [loadingAiConfig, setLoadingAiConfig] = useState(true);

  // Load user on mount
  useEffect(() => {
    api
      .get<UserProfile>('/users/me')
      .then(({ data }) => {
        setProfile(data);
        setProfileForm({ name: data.name || '', phone: data.phone || '' });
        if (data.avatarUrl) setAvatarUrl(data.avatarUrl);
        if (data.profileBannerUrl) setProfileBannerUrl(data.profileBannerUrl);
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

    // Load AI config and branding for coaches
    if (storeUser?.role === 'COACH' || storeUser?.role === 'ADMIN' || storeUser?.role === 'SUPER_ADMIN') {
      api.get('/ai-assistant/config').then(({ data }) => {
        setAiConfig({ assistantName: data.assistantName ?? 'Rafinha', tone: data.tone ?? 'FRIENDLY', personaPrompt: data.personaPrompt ?? '', voiceEnabled: data.voiceEnabled ?? false });
      }).catch(() => {}).finally(() => setLoadingAiConfig(false));

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

      api.get('/settings').then(({ data }) => {
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
    document.documentElement.classList.toggle('dark', val);
  };

  // Apply dark mode on mount
  useEffect(() => {
    const stored = localStorage.getItem('rr_dark_mode');
    if (stored === 'true') {
      setDarkMode(true);
      document.documentElement.classList.add('dark');
    }
  }, []);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    setUploadProgress(0);
    try {
      // Simulate progress during resize (heavy computation)
      setUploadProgress(20);
      const resized = await resizeImageCanvas(file, 400, 400, 0.92);
      setUploadProgress(60);
      setAvatarUrl(resized);
      setUploadProgress(80);
      await api.put('/users/me', { avatarUrl: resized });
      setUploadProgress(100);
      setProfileFeedback({ type: 'success', message: 'Foto de perfil atualizada.' });
    } catch {
      setProfileFeedback({ type: 'error', message: 'Erro ao fazer upload da foto.' });
    } finally {
      setUploadingAvatar(false);
      setUploadProgress(0);
      e.target.value = '';
    }
  };

  const handleProfileBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingBanner(true);
    setUploadProgress(0);
    try {
      setUploadProgress(20);
      // Resize to 1200x400 center-crop, 90% quality
      const resized = await resizeImageCanvas(file, 1200, 400, 0.90);
      setUploadProgress(65);
      setProfileBannerUrl(resized);
      setUploadProgress(85);
      await api.put('/users/me', { profileBannerUrl: resized });
      setUploadProgress(100);
      setProfileFeedback({ type: 'success', message: 'Banner de perfil atualizado.' });
    } catch {
      setProfileFeedback({ type: 'error', message: 'Erro ao fazer upload do banner.' });
    } finally {
      setUploadingBanner(false);
      setUploadProgress(0);
      e.target.value = '';
    }
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
      await api.put('/settings', {
        provider: paymentProvider,
        paymentEnabled,
        ...(pagarmeApiKey ? { pagarmeApiKey } : {}),
        ...(pagarmeWebhook ? { pagarmeWebhookSecret: pagarmeWebhook } : {}),
        ...(stripeKey ? { stripeSecretKey: stripeKey } : {}),
        ...(stripeWebhook ? { stripeWebhookSecret: stripeWebhook } : {}),
      });
      setPaymentFeedback({ type: 'success', message: 'Configurações de pagamento salvas.' });
      setPagarmeApiKey(''); setPagarmeWebhook(''); setStripeKey(''); setStripeWebhook('');
      const { data } = await api.get('/settings');
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
      const { data } = await api.post('/settings/test');
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
        <div className="glass-card overflow-hidden">
          {loadingProfile ? (
            <div className="p-6 animate-pulse space-y-4">
              <div className="h-28 bg-gray-100 rounded-xl" />
              <div className="flex gap-4 pt-2">
                <div className="w-16 h-16 rounded-full bg-gray-100 shrink-0" />
                <div className="space-y-2 pt-2 flex-1">
                  <div className="h-4 w-32 bg-gray-100 rounded" />
                  <div className="h-3 w-48 bg-gray-100 rounded" />
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Banner */}
              <div
                className="relative h-32 bg-gradient-to-br from-primary/20 via-red-50 to-orange-50 cursor-pointer group overflow-hidden"
                onClick={() => profileBannerInputRef.current?.click()}
                title="Clique para alterar o banner"
              >
                {profileBannerUrl ? (
                  <img src={profileBannerUrl} alt="Banner" className="w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-12 h-[1px] bg-primary/20" />
                    <div className="mx-3 text-[10px] font-medium text-primary/40 uppercase tracking-widest">Banner</div>
                    <div className="w-12 h-[1px] bg-primary/20" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                  {uploadingBanner ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-8 h-8 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      {uploadProgress > 0 && (
                        <span className="text-white text-xs font-medium bg-black/50 px-2 py-0.5 rounded-full">{uploadProgress}%</span>
                      )}
                    </div>
                  ) : (
                    <div className="bg-black/50 backdrop-blur-sm rounded-full px-3 py-1.5 flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                      </svg>
                      <span className="text-white text-xs font-medium">Alterar banner</span>
                    </div>
                  )}
                </div>
                {uploadingBanner && uploadProgress > 0 && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                    <div
                      className="h-full bg-white transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                )}
                <input ref={profileBannerInputRef} type="file" accept="image/*" className="hidden" onChange={handleProfileBannerUpload} />
              </div>

              {/* Avatar + info */}
              <div className="px-6 pb-6">
                <div className="flex items-end gap-4 -mt-8 mb-5">
                  {/* Avatar */}
                  <div className="relative shrink-0">
                    <div
                      className="w-16 h-16 rounded-full border-4 border-white bg-primary/10 flex items-center justify-center cursor-pointer group overflow-hidden shadow-md"
                      onClick={() => avatarInputRef.current?.click()}
                      title="Clique para alterar a foto"
                    >
                      {avatarUrl ? (
                        <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-2xl font-bold text-primary">{displayInitial}</span>
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100">
                        {uploadingAvatar ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            {uploadProgress > 0 && (
                              <span className="text-white text-[9px] font-semibold">{uploadProgress}%</span>
                            )}
                          </div>
                        ) : (
                          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                  </div>

                  <div className="flex-1 min-w-0 mb-1">
                    <p className="text-base font-semibold text-gray-900 break-words leading-tight">{displayName}</p>
                    <p className="text-sm text-gray-400 leading-tight truncate">{displayEmail}</p>
                  </div>
                </div>

                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Informações</h2>

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
              </div>
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

        {/* IA Assistente — ADMIN only */}
        {isAdmin && (
          <div className="glass-card p-6">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-5">IA Assistente</h2>
            {loadingAiConfig ? (
              <div className="animate-pulse space-y-4">
                <div className="space-y-1.5">
                  <div className="h-3 w-20 bg-gray-100 rounded" />
                  <div className="h-10 bg-gray-100 rounded-xl" />
                </div>
                <div className="space-y-1.5">
                  <div className="h-3 w-28 bg-gray-100 rounded" />
                  <div className="h-10 bg-gray-100 rounded-xl" />
                </div>
                <div className="space-y-1.5">
                  <div className="h-3 w-36 bg-gray-100 rounded" />
                  <div className="h-20 bg-gray-100 rounded-xl" />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="h-3.5 w-28 bg-gray-100 rounded" />
                    <div className="h-3 w-44 bg-gray-100 rounded" />
                  </div>
                  <div className="w-10 h-6 bg-gray-100 rounded-full" />
                </div>
                <div className="h-10 w-40 bg-gray-100 rounded-xl" />
              </div>
            ) : (
              <>
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
              </>
            )}
          </div>
        )}

        {/* CoachBrain — Provedor de IA — ADMIN only */}
        {isAdmin && (
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

        {/* Nicho do Esporte — COACH only */}
        {isCoach && (
          <div className="glass-card p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Nicho do Esporte</h2>
                <p className="text-sm text-gray-600">Configure o esporte principal e métricas da sua assessoria</p>
                <p className="text-xs text-gray-400 mt-0.5">Ajusta perguntas, zonas de treino e integrações por modalidade</p>
              </div>
              <a
                href="/dashboard/settings/niche"
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition shrink-0"
              >
                🎯 Configurar →
              </a>
            </div>
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

        {/* WhatsApp Bot — COACH only */}
        {isCoach && (
          <div className="glass-card p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 24 24" className="w-6 h-6 text-emerald-500" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                </div>
                <div>
                  <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">WhatsApp Bot</h2>
                  <p className="text-sm text-gray-600">Integre o WhatsApp para comunicação automática com atletas</p>
                  <p className="text-xs text-gray-400 mt-0.5">Boas-vindas e mensagens via Z-API, Twilio ou Evolution API</p>
                </div>
              </div>
              <a
                href="/dashboard/settings/whatsapp"
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 transition shrink-0"
              >
                Configurar →
              </a>
            </div>
          </div>
        )}

        {/* Agendamento 1:1 — COACH only */}
        {isCoach && (
          <div className="glass-card p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0 mt-0.5">
                  <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Agendamento 1:1</h2>
                  <p className="text-sm text-gray-600">Configure o link de agendamento para seus atletas</p>
                  <p className="text-xs text-gray-400 mt-0.5">Integre com Calendly, Cal.com ou qualquer ferramenta</p>
                </div>
              </div>
              <a
                href="/dashboard/settings/appointments"
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition shrink-0"
              >
                Configurar →
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
