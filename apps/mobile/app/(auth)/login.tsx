import React, { useState } from 'react';
import {
  View, Text, KeyboardAvoidingView, Platform,
  ScrollView, Pressable, Image,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../src/theme';
import { GlassInput } from '../../src/components/ui';
import { useAuthStore } from '../../src/stores/auth.store';
import { useGoogleAuth } from '../../src/hooks/useGoogleAuth';
import { useAppleAuth } from '../../src/hooks/useAppleAuth';
import { ptBR } from '../../src/i18n/pt-BR';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { login, googleLogin, appleLogin, isLoading, error, clearError } = useAuthStore();
  const { signIn: signInWithApple, isSupported: isAppleSupported } = useAppleAuth();

  const navigateByRole = () => {
    const user = useAuthStore.getState().user;
    if (user?.role === 'COACH') router.replace('/(coach)');
    else if (user?.role === 'ADMIN') router.replace('/(admin)');
    else router.replace('/(athlete)');
  };

  const handleGoogleSuccess = async (idToken: string) => {
    clearError();
    try {
      await googleLogin(idToken);
      navigateByRole();
    } catch {}
  };

  const handleAppleSignIn = async () => {
    clearError();
    try {
      const result = await signInWithApple();
      if (!result) return; // user cancelled
      await appleLogin(result.identityToken, result.fullName);
      navigateByRole();
    } catch {}
  };

  const { prompt: promptGoogle } = useGoogleAuth(handleGoogleSuccess);

  const validate = () => {
    const newErrors: typeof errors = {};
    if (!email || !/\S+@\S+\.\S+/.test(email)) newErrors.email = ptBR.auth.invalidEmail;
    if (!password || password.length < 6) newErrors.password = ptBR.auth.passwordMin;
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async () => {
    clearError();
    if (!validate()) return;
    try {
      await login(email, password);
      navigateByRole();
    } catch {}
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Background */}
      <LinearGradient
        colors={isDark ? ['#0D0D0D', '#150808', '#0D0D0D'] : ['#F7F7F8', '#FEF2F2', '#F7F7F8']}
        locations={[0, 0.5, 1]}
        style={{ position: 'absolute', inset: 0 } as any}
      />
      {/* Ambient glow */}
      <View style={{
        position: 'absolute', top: -80, left: '50%', marginLeft: -160,
        width: 320, height: 320, borderRadius: 160,
        backgroundColor: '#DC2626', opacity: isDark ? 0.10 : 0.06,
      }} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 24,
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 24,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back */}
          <Pressable
            onPress={() => router.back()}
            style={{ position: 'absolute', top: insets.top + 16, left: 24, padding: 4 }}
          >
            <Ionicons name="arrow-back" size={20} color={colors.textSecondary} />
          </Pressable>

          {/* Card container — max 400px, centered */}
          <View style={{
            width: '100%',
            maxWidth: 400,
            backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.92)',
            borderRadius: 24,
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)',
            padding: 36,
            ...(Platform.OS === 'web' ? {
              backdropFilter: 'blur(32px)',
              WebkitBackdropFilter: 'blur(32px)',
              boxShadow: isDark
                ? '0 24px 48px rgba(0,0,0,0.4)'
                : '0 8px 40px rgba(0,0,0,0.08)',
            } as any : {}),
          }}>
            {/* Logo */}
            <View style={{ alignItems: 'center', marginBottom: 32 }}>
              <View style={{
                width: 72, height: 72, borderRadius: 20, overflow: 'hidden', marginBottom: 14,
                ...(Platform.OS === 'web' ? { boxShadow: '0 4px 16px rgba(220,38,38,0.30)' } as any : {
                  shadowColor: '#DC2626', shadowOpacity: 0.30, shadowRadius: 16, shadowOffset: { width: 0, height: 4 },
                }),
              }}>
                <Image
                  source={require('../../assets/logo.png')}
                  style={{ width: 72, height: 72 }}
                  resizeMode="cover"
                />
              </View>
              <Text style={{
                fontSize: 24,
                fontFamily: Platform.OS === 'web' ? 'Bebas Neue' : 'System',
                fontWeight: Platform.OS === 'web' ? '400' : '800',
                letterSpacing: 2,
                textTransform: 'uppercase' as any,
                color: colors.primary, marginBottom: 4,
              }}>
                Rafinha Running
              </Text>
              <Text style={{ fontSize: 13, color: colors.textSecondary, fontWeight: '400' }}>
                Entre para continuar
              </Text>
            </View>

            {/* Error */}
            {error && (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 8,
                padding: 12, borderRadius: 12, marginBottom: 20,
                backgroundColor: isDark ? 'rgba(220,38,38,0.12)' : '#FEE2E2',
              }}>
                <Ionicons name="alert-circle-outline" size={15} color={colors.error} />
                <Text style={{ fontSize: 13, color: colors.error, flex: 1 }}>{error}</Text>
              </View>
            )}

            {/* Inputs */}
            <GlassInput
              label="E-mail"
              placeholder="seu@email.com"
              value={email}
              onChangeText={setEmail}
              error={errors.email}
              icon={<Ionicons name="mail-outline" size={16} color={colors.textTertiary} />}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              containerStyle={{ marginBottom: 14 }}
            />
            <GlassInput
              label="Senha"
              placeholder="••••••••"
              value={password}
              onChangeText={setPassword}
              error={errors.password}
              icon={<Ionicons name="lock-closed-outline" size={16} color={colors.textTertiary} />}
              secureTextEntry={!showPassword}
              autoComplete="password"
              rightIcon={
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={16}
                  color={colors.textTertiary}
                />
              }
              onRightIconPress={() => setShowPassword(!showPassword)}
              containerStyle={{ marginBottom: 6 }}
            />

            {/* Forgot */}
            <Pressable style={{ alignSelf: 'flex-end', marginBottom: 24, marginTop: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.primary }}>
                Esqueceu a senha?
              </Text>
            </Pressable>

            {/* Login button */}
            <Pressable
              onPress={handleLogin}
              disabled={isLoading}
              style={{ borderRadius: 14, overflow: 'hidden', opacity: isLoading ? 0.7 : 1 }}
            >
              <LinearGradient
                colors={['#EF4444', '#DC2626', '#B91C1C']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  paddingVertical: 15,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 8,
                }}
              >
                {isLoading ? (
                  <View style={{
                    width: 18, height: 18, borderRadius: 9,
                    borderWidth: 2,
                    borderColor: 'rgba(255,255,255,0.3)',
                    borderTopColor: '#FFF',
                  }} />
                ) : (
                  <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '700', letterSpacing: 0.3 }}>
                    Entrar
                  </Text>
                )}
              </LinearGradient>
            </Pressable>

            {/* Divider */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 20, gap: 10 }}>
              <View style={{ flex: 1, height: StyleSheet_hairlineWidth, backgroundColor: colors.divider }} />
              <Text style={{ fontSize: 11, color: colors.textTertiary, fontWeight: '500' }}>ou</Text>
              <View style={{ flex: 1, height: StyleSheet_hairlineWidth, backgroundColor: colors.divider }} />
            </View>

            {/* Google */}
            <Pressable
              onPress={promptGoogle}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                paddingVertical: 13,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.glassBorder,
                backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.015)',
              }}
            >
              <Ionicons name="logo-google" size={16} color={colors.text} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>
                Continuar com Google
              </Text>
            </Pressable>

            {/* Apple — iOS only */}
            {isAppleSupported && (
              <Pressable
                onPress={handleAppleSignIn}
                disabled={isLoading}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                  paddingVertical: 13,
                  borderRadius: 14,
                  borderWidth: 1,
                  marginTop: 10,
                  borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)',
                  backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#000',
                  opacity: isLoading ? 0.6 : 1,
                }}
              >
                <Ionicons name="logo-apple" size={17} color={isDark ? colors.text : '#FFF'} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: isDark ? colors.text : '#FFF' }}>
                  Continuar com Apple
                </Text>
              </Pressable>
            )}
          </View>

          {/* Register */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 24, gap: 4 }}>
            <Text style={{ fontSize: 13, color: colors.textSecondary }}>
              Não tem conta?
            </Text>
            <Pressable onPress={() => router.push('/(auth)/register')}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>
                Criar conta
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const StyleSheet_hairlineWidth = 1;
