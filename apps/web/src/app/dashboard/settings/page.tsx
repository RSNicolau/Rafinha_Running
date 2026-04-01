'use client';

import { useEffect, useState } from 'react';
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
