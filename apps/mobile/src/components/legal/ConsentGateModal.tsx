import React, { useCallback, useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, ActivityIndicator, Linking } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';
import { api } from '../../services/api';
import { useAuthStore } from '../../stores/auth.store';
import { ConsentCheckboxes } from './ConsentCheckboxes';
import {
  EMPTY_CONSENT, isConsentComplete, LEGAL_URLS, PRIVACY_VERSION, TERMS_VERSION, type ConsentState,
} from './legal';

interface LegalStatus {
  needsConsent: boolean;
  termsVersion: string;
  privacyVersion: string;
  healthDataConsent?: boolean | null;
}

/**
 * Modal BLOQUEANTE de aceite LGPD para usuários autenticados sem aceite da versão vigente
 * (convite, conta criada pelo treinador, Google/Apple ou documentos atualizados).
 * Não pode ser fechado — apenas aceitar ou sair da conta.
 */
export function ConsentGateModal() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);

  const [status, setStatus] = useState<LegalStatus | null>(null);
  const [consent, setConsent] = useState<ConsentState>(EMPTY_CONSENT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isAthlete = user?.role === 'ATHLETE';

  const check = useCallback(async () => {
    try {
      const { data } = await api.get<LegalStatus>('/legal/me');
      setStatus(data);
    } catch {
      // Sem rede: não bloqueia por engano; verifica de novo no próximo login/abertura
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) check();
    else {
      setStatus(null);
      setConsent(EMPTY_CONSENT);
    }
  }, [isAuthenticated, user?.id, check]);

  const visible =
    isAuthenticated && !!status && (status.needsConsent || (isAthlete && status.healthDataConsent == null));
  if (!visible) return null;

  const outdatedApp = status.termsVersion !== TERMS_VERSION || status.privacyVersion !== PRIVACY_VERSION;
  const canSubmit = isConsentComplete(consent, isAthlete) && !saving && !outdatedApp;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError('');
    try {
      const { data } = await api.post<LegalStatus>('/legal/accept', {
        acceptTerms: true,
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
        marketingOptIn: consent.marketing,
        ...(isAthlete ? { healthDataConsent: consent.health } : {}),
      });
      setStatus(data);
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(' ') : msg || 'Não foi possível registrar o aceite. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={() => { /* bloqueante */ }}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <View
          style={{
            maxHeight: '92%',
            backgroundColor: isDark ? '#141418' : '#FFFFFF',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingBottom: insets.bottom + 16,
          }}
        >
          <ScrollView contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
            <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 4 }}>
              Termos de Uso e Privacidade
            </Text>
            <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 14 }}>Versão {TERMS_VERSION}</Text>
            <Text style={{ fontSize: 14, lineHeight: 20, color: colors.textSecondary, marginBottom: 18 }}>
              Para continuar usando o app, leia e aceite os Termos de Uso e a Política de Privacidade. Eles explicam como
              seus dados são tratados pela plataforma e pela sua assessoria.
            </Text>

            {outdatedApp && (
              <View style={{ padding: 12, borderRadius: 12, backgroundColor: colors.warningLight, marginBottom: 14 }}>
                <Text style={{ fontSize: 12, color: '#78350F' }}>
                  Há uma versão mais recente dos documentos. Atualize o aplicativo para continuar.
                </Text>
              </View>
            )}

            <ConsentCheckboxes value={consent} onChange={setConsent} showHealth={isAthlete} />

            {!!error && (
              <View style={{ marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: colors.errorLight }}>
                <Text style={{ fontSize: 13, color: colors.error }}>{error}</Text>
              </View>
            )}

            <Pressable
              onPress={submit}
              disabled={!canSubmit}
              style={{
                marginTop: 20, paddingVertical: 15, borderRadius: 14, alignItems: 'center',
                backgroundColor: colors.primary, opacity: canSubmit ? 1 : 0.5,
              }}
              accessibilityRole="button"
            >
              {saving ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 14 }}>Aceitar e continuar</Text>
              )}
            </Pressable>

            <Pressable onPress={handleLogout} style={{ marginTop: 10, paddingVertical: 13, alignItems: 'center' }} accessibilityRole="button">
              <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: 14 }}>Sair da conta</Text>
            </Pressable>

            <Text
              onPress={() => Linking.openURL(LEGAL_URLS.myData).catch(() => {})}
              style={{ marginTop: 6, textAlign: 'center', fontSize: 12, color: colors.textTertiary, textDecorationLine: 'underline' }}
            >
              Não concorda? Baixe seus dados ou solicite a exclusão da conta
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
