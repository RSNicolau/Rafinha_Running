import React from 'react';
import {
  View, Text, SafeAreaView, ScrollView, TouchableOpacity, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme';
import { GlassCard, GlassToggle, GlassButton } from '../../src/components/ui';
import { useAuthStore } from '../../src/stores/auth.store';
import { useSettingsStore } from '../../src/stores/settings.store';
import { ptBR } from '../../src/i18n/pt-BR';

export default function SettingsScreen() {
  const { colors, mode, setMode } = useTheme();
  const { logout } = useAuthStore();
  const {
    pushNotifications, workoutReminders, coachMessages, weeklyReport,
    autoSync, dataOverWifi, language, measureUnit,
    toggle, setLanguage, setMeasureUnit,
  } = useSettingsStore();

  const handleDeleteAccount = () => {
    Alert.alert(
      'Excluir Conta',
      'Tem certeza que deseja excluir sua conta? Esta ação é irreversível e todos os seus dados serão perdidos.',
      [
        { text: ptBR.common.cancel, style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Atenção', 'Para excluir sua conta, entre em contato com o suporte.');
          },
        },
      ],
    );
  };

  const handleLogout = () => {
    Alert.alert('Sair', 'Deseja realmente sair da sua conta?', [
      { text: ptBR.common.cancel, style: 'cancel' },
      { text: ptBR.profile.logout, style: 'destructive', onPress: logout },
    ]);
  };

  const themeOptions = [
    { key: 'light' as const, label: 'Light', icon: 'sunny-outline' as const },
    { key: 'dark' as const, label: 'Dark', icon: 'moon-outline' as const },
    { key: 'system' as const, label: 'Sistema', icon: 'phone-portrait-outline' as const },
  ];

  const languageOptions = [
    { key: 'pt-BR', label: 'Português' },
    { key: 'en', label: 'English' },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
      }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>
          {ptBR.profile.settings}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>

        {/* NOTIFICACOES */}
        <View style={{ marginBottom: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, paddingLeft: 4 }}>
            <Ionicons name="notifications-outline" size={16} color={colors.primary} />
            <Text style={{ color: colors.textTertiary, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Notificações
            </Text>
          </View>
          <GlassCard intensity="medium" shadow="sm" padding={4}>
            <GlassToggle
              label="Notificações Push"
              subtitle="Receber alertas no celular"
              value={pushNotifications}
              onValueChange={() => toggle('pushNotifications')}
              icon={<Ionicons name="notifications-outline" size={18} color={colors.primary} />}
            />
            <View style={{ height: 1, backgroundColor: colors.divider, marginLeft: 54 }} />
            <GlassToggle
              label="Lembretes de Treino"
              subtitle="Lembrar antes de cada treino"
              value={workoutReminders}
              onValueChange={() => toggle('workoutReminders')}
              icon={<Ionicons name="alarm-outline" size={18} color={colors.primary} />}
            />
            <View style={{ height: 1, backgroundColor: colors.divider, marginLeft: 54 }} />
            <GlassToggle
              label="Mensagens do Treinador"
              subtitle="Avisar sobre novas mensagens"
              value={coachMessages}
              onValueChange={() => toggle('coachMessages')}
              icon={<Ionicons name="chatbubble-outline" size={18} color={colors.primary} />}
            />
            <View style={{ height: 1, backgroundColor: colors.divider, marginLeft: 54 }} />
            <GlassToggle
              label="Relatório Semanal"
              subtitle="Resumo semanal de desempenho"
              value={weeklyReport}
              onValueChange={() => toggle('weeklyReport')}
              icon={<Ionicons name="bar-chart-outline" size={18} color={colors.primary} />}
            />
          </GlassCard>
        </View>

        {/* SINCRONIZACAO */}
        <View style={{ marginBottom: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, paddingLeft: 4 }}>
            <Ionicons name="sync-outline" size={16} color={colors.primary} />
            <Text style={{ color: colors.textTertiary, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Sincronização
            </Text>
          </View>
          <GlassCard intensity="medium" shadow="sm" padding={4}>
            <GlassToggle
              label="Sincronização Automática"
              subtitle="Sincronizar atividades automaticamente"
              value={autoSync}
              onValueChange={() => toggle('autoSync')}
              icon={<Ionicons name="sync-outline" size={18} color={colors.primary} />}
            />
            <View style={{ height: 1, backgroundColor: colors.divider, marginLeft: 54 }} />
            <GlassToggle
              label="Apenas Wi-Fi"
              subtitle="Sincronizar somente em Wi-Fi"
              value={dataOverWifi}
              onValueChange={() => toggle('dataOverWifi')}
              icon={<Ionicons name="wifi-outline" size={18} color={colors.primary} />}
            />
          </GlassCard>
        </View>

        {/* PREFERENCIAS */}
        <View style={{ marginBottom: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, paddingLeft: 4 }}>
            <Ionicons name="options-outline" size={16} color={colors.primary} />
            <Text style={{ color: colors.textTertiary, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Preferências
            </Text>
          </View>
          <GlassCard intensity="medium" shadow="sm" padding={16}>
            {/* Theme Selector */}
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500', marginBottom: 10 }}>
              Tema
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
              {themeOptions.map((opt) => {
                const isActive = mode === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    onPress={() => setMode(opt.key)}>
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      paddingVertical: 12,
                      borderRadius: 14,
                      borderWidth: 1.5,
                      borderColor: isActive ? colors.primary : colors.glassBorder,
                      backgroundColor: isActive ? colors.primaryGhost : 'transparent',
                    }}
                  >
                    <Ionicons
                      name={opt.icon}
                      size={20}
                      color={isActive ? colors.primary : colors.textSecondary}
                    />
                    <Text style={{
                      color: isActive ? colors.primary : colors.textSecondary,
                      fontSize: 13,
                      fontWeight: '500',
                      marginTop: 6,
                    }}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Language Selector */}
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500', marginBottom: 10 }}>
              Idioma
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {languageOptions.map((opt) => {
                const isActive = language === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    onPress={() => setLanguage(opt.key as 'pt-BR' | 'en')}>
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      paddingVertical: 12,
                      borderRadius: 14,
                      borderWidth: 1.5,
                      borderColor: isActive ? colors.primary : colors.glassBorder,
                      backgroundColor: isActive ? colors.primaryGhost : 'transparent',
                    }}
                  >
                    <Text style={{
                      color: isActive ? colors.primary : colors.textSecondary,
                      fontSize: 14,
                      fontWeight: '600',
                    }}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </GlassCard>
        </View>

        {/* INFORMACOES */}
        <View style={{ marginBottom: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, paddingLeft: 4 }}>
            <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
            <Text style={{ color: colors.textTertiary, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Informações
            </Text>
          </View>
          <GlassCard intensity="medium" shadow="sm" padding={0}>
            {[
              { icon: 'document-text-outline' as const, label: 'Termos de Uso', key: 'terms' },
              { icon: 'shield-checkmark-outline' as const, label: 'Política de Privacidade', key: 'privacy' },
              { icon: 'help-circle-outline' as const, label: 'Central de Ajuda', key: 'help' },
              { icon: 'mail-outline' as const, label: 'Contato e Suporte', key: 'support', desc: 'suporte@rafinharunning.com.br' },
            ].map((item, index, arr) => (
              <React.Fragment key={item.key}>
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    gap: 14,
                  }}
                  activeOpacity={0.65}
                >
                  <View style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: colors.primaryGhost,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Ionicons name={item.icon} size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>
                      {item.label}
                    </Text>
                    {item.desc && (
                      <Text style={{ color: colors.textTertiary, fontSize: 12, marginTop: 1 }}>
                        {item.desc}
                      </Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                </TouchableOpacity>
                {index < arr.length - 1 && (
                  <View style={{ height: 1, backgroundColor: colors.divider, marginLeft: 66 }} />
                )}
              </React.Fragment>
            ))}
          </GlassCard>
        </View>

        {/* DANGER ZONE */}
        <View style={{ marginBottom: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, paddingLeft: 4 }}>
            <Ionicons name="warning-outline" size={16} color={colors.error} />
            <Text style={{ color: colors.error, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Zona de Risco
            </Text>
          </View>
          <View style={{ gap: 10 }}>
            <GlassButton
              title="Sair da Conta"
              onPress={handleLogout}
              variant="secondary"
              fullWidth
              icon={<Ionicons name="log-out-outline" size={18} color={colors.warning} />}
            />
            <GlassButton
              title="Excluir Conta"
              onPress={handleDeleteAccount}
              variant="danger"
              fullWidth
              icon={<Ionicons name="trash-outline" size={18} color="#FFFFFF" />}
            />
          </View>
        </View>

        {/* App Version Footer */}
        <View style={{ alignItems: 'center', paddingVertical: 24 }}>
          <Text style={{ color: colors.textTertiary, fontSize: 13, fontWeight: '500' }}>
            RR - Rafinha Running
          </Text>
          <Text style={{ color: colors.textTertiary, fontSize: 11, marginTop: 4 }}>
            Versão 1.0.0 (Build 1)
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
