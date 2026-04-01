import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, SafeAreaView, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme';
import { GlassCard, GlassButton, GlassInput, GlassAvatar } from '../../src/components/ui';
import { useAuthStore } from '../../src/stores/auth.store';
import { api } from '../../src/services/api';
import { ptBR } from '../../src/i18n/pt-BR';

const LEVELS = [
  { value: 'BEGINNER', label: ptBR.profile.levels.BEGINNER, icon: '🌱' },
  { value: 'INTERMEDIATE', label: ptBR.profile.levels.INTERMEDIATE, icon: '🏃' },
  { value: 'ADVANCED', label: ptBR.profile.levels.ADVANCED, icon: '🔥' },
  { value: 'ELITE', label: ptBR.profile.levels.ELITE, icon: '🏆' },
];

interface ProfileData {
  name: string;
  phone: string;
  weight: string;
  height: string;
  vo2max: string;
  restingHR: string;
  maxHR: string;
  weeklyGoalKm: string;
  level: string;
}

export default function EditProfileScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [form, setForm] = useState<ProfileData>({
    name: '',
    phone: '',
    weight: '',
    height: '',
    vo2max: '',
    restingHR: '',
    maxHR: '',
    weeklyGoalKm: '',
    level: 'BEGINNER',
  });

  const loadProfile = useCallback(async () => {
    try {
      const res = await api.get('/users/me');
      const data = res.data;
      setAvatarUrl(data.avatarUrl || null);
      const ap = data.athleteProfile || {};
      setForm({
        name: data.name || '',
        phone: data.phone || '',
        weight: ap.weight ? String(ap.weight) : '',
        height: ap.height ? String(ap.height) : '',
        vo2max: ap.vo2max ? String(ap.vo2max) : '',
        restingHR: ap.restingHR ? String(ap.restingHR) : '',
        maxHR: ap.maxHR ? String(ap.maxHR) : '',
        weeklyGoalKm: ap.weeklyGoalKm ? String(ap.weeklyGoalKm) : '',
        level: ap.level || 'BEGINNER',
      });
    } catch {
      Alert.alert('Erro', 'Não foi possível carregar o perfil');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const handleSave = async () => {
    if (!form.name.trim()) {
      Alert.alert('Erro', 'Nome é obrigatório');
      return;
    }

    setSaving(true);
    try {
      await api.put('/users/me', {
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        athleteProfile: {
          weight: form.weight ? Number(form.weight) : undefined,
          height: form.height ? Number(form.height) : undefined,
          vo2max: form.vo2max ? Number(form.vo2max) : undefined,
          restingHR: form.restingHR ? Number(form.restingHR) : undefined,
          maxHR: form.maxHR ? Number(form.maxHR) : undefined,
          weeklyGoalKm: form.weeklyGoalKm ? Number(form.weeklyGoalKm) : undefined,
          level: form.level,
        },
      });
      Alert.alert('Sucesso', 'Perfil atualizado com sucesso!', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error: any) {
      Alert.alert('Erro', error?.response?.data?.message || 'Falha ao salvar perfil');
    } finally {
      setSaving(false);
    }
  };

  const updateField = (key: keyof ProfileData, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleChangePhoto = () => {
    Alert.alert(
      'Alterar Foto de Perfil',
      'Escolha uma opção:',
      [
        {
          text: 'Tirar Foto',
          onPress: async () => {
            Alert.alert('Câmera', 'A câmera será aberta para capturar sua foto de perfil.\n\n(Requer expo-image-picker instalado)');
          },
        },
        {
          text: 'Escolher da Galeria',
          onPress: async () => {
            Alert.alert('Galeria', 'A galeria será aberta para selecionar uma foto.\n\n(Requer expo-image-picker instalado)');
          },
        },
        {
          text: 'Remover Foto',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.put('/users/me', { avatarUrl: null });
              setAvatarUrl(null);
              Alert.alert('Foto removida', 'Sua foto de perfil foi removida.');
            } catch {
              Alert.alert('Erro', 'Não foi possível remover a foto.');
            }
          },
        },
        { text: 'Cancelar', style: 'cancel' },
      ],
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.textSecondary, fontSize: 14, marginTop: 16 }}>
            Carregando perfil...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
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
            {ptBR.profile.editProfile}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
          {/* Avatar Section */}
          <TouchableOpacity
            style={{ alignItems: 'center', marginBottom: 28, paddingTop: 8 }}
            onPress={handleChangePhoto}
            activeOpacity={0.7}
          >
            <View style={{ position: 'relative' }}>
              <GlassAvatar
                name={user?.name || '?'}
                imageUrl={avatarUrl}
                size={96}
                showBorder
              />
              <View style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 3,
                borderColor: colors.background,
              }}>
                <Ionicons name="camera" size={16} color="#FFFFFF" />
              </View>
            </View>
            <Text style={{ color: colors.textTertiary, fontSize: 13, marginTop: 10 }}>
              Toque para alterar foto
            </Text>
          </TouchableOpacity>

          {/* Informacoes Pessoais */}
          <View style={{ marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Ionicons name="person-outline" size={20} color={colors.primary} />
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>
                Informações Pessoais
              </Text>
            </View>
            <GlassCard intensity="medium" shadow="sm" padding={16}>
              <GlassInput
                label="Nome completo"
                value={form.name}
                onChangeText={(v) => updateField('name', v)}
                icon={<Ionicons name="person-outline" size={18} color={colors.textSecondary} />}
                placeholder="Seu nome"
              />
              <View style={{ height: 12 }} />
              <GlassInput
                label="Telefone"
                value={form.phone}
                onChangeText={(v) => updateField('phone', v)}
                icon={<Ionicons name="call-outline" size={18} color={colors.textSecondary} />}
                placeholder="(11) 99999-9999"
                keyboardType="phone-pad"
              />
            </GlassCard>
          </View>

          {/* Dados Fisicos */}
          <View style={{ marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Ionicons name="body-outline" size={20} color={colors.primary} />
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>
                Dados Físicos
              </Text>
            </View>
            <GlassCard intensity="medium" shadow="sm" padding={16}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <GlassInput
                    label={ptBR.profile.weight}
                    value={form.weight}
                    onChangeText={(v) => updateField('weight', v)}
                    keyboardType="decimal-pad"
                    placeholder="70"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <GlassInput
                    label={ptBR.profile.height}
                    value={form.height}
                    onChangeText={(v) => updateField('height', v)}
                    keyboardType="decimal-pad"
                    placeholder="175"
                  />
                </View>
              </View>
              <View style={{ height: 12 }} />
              <GlassInput
                label={ptBR.profile.vo2max}
                value={form.vo2max}
                onChangeText={(v) => updateField('vo2max', v)}
                keyboardType="decimal-pad"
                placeholder="45"
                icon={<Ionicons name="pulse-outline" size={18} color={colors.textSecondary} />}
              />
            </GlassCard>
          </View>

          {/* Frequencia Cardiaca */}
          <View style={{ marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Ionicons name="heart-outline" size={20} color={colors.error} />
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>
                Frequência Cardíaca
              </Text>
            </View>
            <GlassCard intensity="medium" shadow="sm" padding={16}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <GlassInput
                    label={ptBR.profile.restingHR}
                    value={form.restingHR}
                    onChangeText={(v) => updateField('restingHR', v)}
                    keyboardType="number-pad"
                    placeholder="60"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <GlassInput
                    label={ptBR.profile.maxHR}
                    value={form.maxHR}
                    onChangeText={(v) => updateField('maxHR', v)}
                    keyboardType="number-pad"
                    placeholder="190"
                  />
                </View>
              </View>
            </GlassCard>
          </View>

          {/* Objetivos */}
          <View style={{ marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Ionicons name="trophy-outline" size={20} color={colors.warning} />
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>
                Objetivos de Treino
              </Text>
            </View>
            <GlassCard intensity="medium" shadow="sm" padding={16}>
              <GlassInput
                label={ptBR.profile.weeklyGoal}
                value={form.weeklyGoalKm}
                onChangeText={(v) => updateField('weeklyGoalKm', v)}
                keyboardType="decimal-pad"
                placeholder="40"
                icon={<Ionicons name="speedometer-outline" size={18} color={colors.textSecondary} />}
              />
              <View style={{ height: 16 }} />
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: '500', marginBottom: 10, marginLeft: 4 }}>
                {ptBR.profile.level}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {LEVELS.map((level) => {
                  const isActive = form.level === level.value;
                  return (
                    <TouchableOpacity
                      key={level.value}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingVertical: 10,
                        paddingHorizontal: 14,
                        borderRadius: 14,
                        borderWidth: 1.5,
                        borderColor: isActive ? colors.primary : colors.glassBorder,
                        backgroundColor: isActive ? colors.primaryGhost : 'transparent',
                        minWidth: '45%' as any,
                        flex: 1,
                      }}
                      onPress={() => updateField('level', level.value)}
                    >
                      <Text style={{ fontSize: 18 }}>{level.icon}</Text>
                      <Text style={{
                        color: isActive ? colors.primary : colors.textSecondary,
                        fontSize: 14,
                        fontWeight: '500',
                        flex: 1,
                      }}>
                        {level.label}
                      </Text>
                      {isActive && (
                        <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </GlassCard>
          </View>

          {/* Save Button */}
          <View style={{ marginTop: 8, marginBottom: 20 }}>
            <GlassButton
              title={saving ? 'Salvando...' : ptBR.common.save}
              onPress={handleSave}
              loading={saving}
              fullWidth
              variant="primary"
              size="lg"
            />
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
