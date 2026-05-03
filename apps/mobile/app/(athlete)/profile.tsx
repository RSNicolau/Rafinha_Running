import React, { useState, useEffect } from 'react';
import {
  View, Text, SafeAreaView, ScrollView, TouchableOpacity, Alert, Animated, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../src/theme';
import { GlassCard, GlassAvatar, GlassBadge, StatCard, RecoveryBadge } from '../../src/components/ui';
import { useAuthStore } from '../../src/stores/auth.store';
import { api } from '../../src/services/api';
import { ptBR } from '../../src/i18n/pt-BR';

interface UserStats {
  totalKm: number;
  totalWorkouts: number;
  avgPace: string;
  weeklyKm: number;
  level: string;
}

export default function ProfileScreen() {
  const { colors } = useTheme();
  const { user, logout } = useAuthStore();
  const [stats, setStats] = useState<UserStats>({
    totalKm: 0, totalWorkouts: 0, avgPace: '--', weeklyKm: 0, level: 'BEGINNER',
  });
  const fadeAnim = useState(new Animated.Value(0))[0];
  const [showAllBadges, setShowAllBadges] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // Recent badges
  const { data: badgesData } = useQuery({
    queryKey: ['recentBadges'],
    queryFn: async () => {
      const { data } = await api.get('/badges/recent');
      return data;
    },
    retry: false,
  });

  // Training load CTL/ATL/TSB
  const { data: trainingLoad } = useQuery({
    queryKey: ['trainingLoad'],
    queryFn: async () => {
      const { data } = await api.get('/workouts/training-load', { params: { days: 1 } });
      return data;
    },
    retry: false,
  });

  const handleDocumentUpload = async () => {
    try {
      setUploadingDoc(true);
      Alert.alert(
        'Enviar documento',
        'Escolha uma opção',
        [
          {
            text: 'Câmera / Fotos',
            onPress: async () => {
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.All,
                allowsEditing: false,
                quality: 0.8,
              });
              if (!result.canceled && result.assets[0]) {
                const asset = result.assets[0];
                const formData = new FormData();
                formData.append('file', {
                  uri: asset.uri,
                  type: asset.mimeType || 'image/jpeg',
                  name: asset.fileName || 'document.jpg',
                } as any);
                await api.post('/athlete-documents/upload', formData, {
                  headers: { 'Content-Type': 'multipart/form-data' },
                });
                Alert.alert('Sucesso', 'Documento enviado com sucesso!');
              }
              setUploadingDoc(false);
            },
          },
          {
            text: 'Arquivo',
            onPress: async () => {
              const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
              if (!result.canceled && result.assets[0]) {
                const asset = result.assets[0];
                const formData = new FormData();
                formData.append('file', {
                  uri: asset.uri,
                  type: asset.mimeType || 'application/octet-stream',
                  name: asset.name || 'document',
                } as any);
                await api.post('/athlete-documents/upload', formData, {
                  headers: { 'Content-Type': 'multipart/form-data' },
                });
                Alert.alert('Sucesso', 'Documento enviado com sucesso!');
              }
              setUploadingDoc(false);
            },
          },
          { text: 'Cancelar', style: 'cancel', onPress: () => setUploadingDoc(false) },
        ],
        { cancelable: true, onDismiss: () => setUploadingDoc(false) },
      );
    } catch (err) {
      Alert.alert('Erro', 'Não foi possível enviar o documento.');
      setUploadingDoc(false);
    }
  };

  const MENU_SECTIONS = [
    {
      title: 'TREINAMENTO',
      items: [
        { icon: 'document-text-outline' as const, label: 'Planilha de Treino', route: '/(athlete)/training-upload', color: colors.primary, desc: 'Upload e visualização' },
        { icon: 'fitness-outline' as const, label: ptBR.integrations.title, route: '/(athlete)/integrations', color: '#007CC3', desc: 'Garmin, Strava' },
      ],
    },
    {
      title: 'CONTA',
      items: [
        { icon: 'person-outline' as const, label: ptBR.profile.editProfile, route: '/(athlete)/edit-profile', color: colors.info, desc: 'Dados pessoais e físicos' },
        { icon: 'card-outline' as const, label: ptBR.subscription.title, route: '/(athlete)/subscription', color: colors.success, desc: 'Planos e pagamento' },
        { icon: 'notifications-outline' as const, label: ptBR.profile.notifications, route: '/(athlete)/notifications', color: colors.warning, desc: 'Alertas e lembretes' },
        { icon: 'settings-outline' as const, label: ptBR.profile.settings, route: '/(athlete)/settings', color: colors.textSecondary, desc: 'Preferências do app' },
      ],
    },
  ];

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();

    const loadStats = async () => {
      try {
        const [meRes, statsRes] = await Promise.all([
          api.get('/users/me'),
          api.get('/workouts/stats'),
        ]);
        const ap = meRes.data.athleteProfile || {};
        setStats({
          totalKm: statsRes.data.totalKm ?? 0,
          totalWorkouts: statsRes.data.totalWorkouts ?? 0,
          avgPace: statsRes.data.avgPace ?? '--',
          weeklyKm: statsRes.data.weeklyKm ?? 0,
          level: ap.level || 'BEGINNER',
        });
      } catch {
        // Use defaults
      }
    };
    loadStats();
  }, [fadeAnim]);

  const handleLogout = () => {
    Alert.alert('Sair', 'Deseja realmente sair da sua conta?', [
      { text: ptBR.common.cancel, style: 'cancel' },
      { text: ptBR.profile.logout, style: 'destructive', onPress: logout },
    ]);
  };

  const getLevelInfo = (level: string) => {
    const map: Record<string, { label: string; icon: string; badgeVariant: 'success' | 'info' | 'warning' | 'primary' }> = {
      BEGINNER: { label: 'Iniciante', icon: '🌱', badgeVariant: 'success' },
      INTERMEDIATE: { label: 'Intermediário', icon: '🏃', badgeVariant: 'info' },
      ADVANCED: { label: 'Avançado', icon: '🔥', badgeVariant: 'warning' },
      ELITE: { label: 'Elite', icon: '🏆', badgeVariant: 'primary' },
    };
    return map[level] || map.BEGINNER;
  };

  const levelInfo = getLevelInfo(stats.level);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <Animated.ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        style={{ opacity: fadeAnim }}
      >
        {/* Glass Header with Avatar */}
        <GlassCard
          intensity="strong"
          shadow="lg"
          padding={0}
          style={{ marginHorizontal: 16, marginTop: 16, borderRadius: 24 }}
        >
          <View style={{
            paddingTop: 32,
            paddingBottom: 28,
            paddingHorizontal: 24,
            alignItems: 'center',
          }}>
            <GlassAvatar
              name={user?.name || '?'}
              imageUrl={null}
              size={90}
              showBorder
            />
            <Text style={{
              color: colors.text,
              fontSize: 22,
              fontWeight: '700',
              marginTop: 16,
              letterSpacing: -0.3,
            }}>
              {user?.name}
            </Text>
            <Text style={{
              color: colors.textSecondary,
              fontSize: 14,
              marginTop: 4,
            }}>
              {user?.email}
            </Text>
            <View style={{ marginTop: 12 }}>
              <GlassBadge
                label={`${levelInfo.icon} ${levelInfo.label}`}
                variant={levelInfo.badgeVariant}
                size="md"
              />
            </View>
          </View>
        </GlassCard>

        {/* Stats Grid 2x2 */}
        <View style={{ paddingHorizontal: 16, marginTop: 20, gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <StatCard
                icon={<Ionicons name="footsteps-outline" size={20} color={colors.primary} />}
                value={stats.totalKm}
                label="km total"
                compact
              />
            </View>
            <View style={{ flex: 1 }}>
              <StatCard
                icon={<Ionicons name="checkmark-circle-outline" size={20} color={colors.success} />}
                value={stats.totalWorkouts}
                label="treinos"
                compact
              />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <StatCard
                icon={<Ionicons name="speedometer-outline" size={20} color={colors.info} />}
                value={stats.avgPace}
                label="pace médio"
                compact
              />
            </View>
            <View style={{ flex: 1 }}>
              <StatCard
                icon={<Ionicons name="trending-up-outline" size={20} color={colors.warning} />}
                value={stats.weeklyKm}
                label="km/semana"
                compact
              />
            </View>
          </View>
        </View>

        {/* ─── CARGA DE TREINO CTL / ATL / TSB ─── */}
        {trainingLoad && (
          <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
            <Text style={{ color: colors.textTertiary, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, paddingLeft: 4 }}>
              Carga de Treino
            </Text>
            <GlassCard intensity="medium" shadow="sm" padding={20}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16 }}>
                {[
                  { label: 'CTL', value: trainingLoad.ctl, color: colors.info, desc: 'Fitness' },
                  { label: 'ATL', value: trainingLoad.atl, color: colors.warning, desc: 'Fadiga' },
                  { label: 'TSB', value: trainingLoad.tsb, color: trainingLoad.tsb >= 0 ? colors.success : colors.error, desc: 'Forma' },
                ].map((item) => (
                  <View key={item.label} style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 28, fontWeight: '800', color: item.color, letterSpacing: -1 }}>
                      {item.value !== undefined ? (item.value > 0 && item.label === 'TSB' ? '+' : '') + Math.round(item.value) : '--'}
                    </Text>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text, marginTop: 2 }}>{item.label}</Text>
                    <Text style={{ fontSize: 10, color: colors.textTertiary }}>{item.desc}</Text>
                  </View>
                ))}
              </View>
              <RecoveryBadge tsb={trainingLoad.tsb} hrv={trainingLoad.hrv} size="sm" />
            </GlassCard>
          </View>
        )}

        {/* ─── CONQUISTAS / BADGES ─── */}
        {badgesData && (badgesData.badges || badgesData).length > 0 && (
          <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingLeft: 4 }}>
              <Text style={{ color: colors.textTertiary, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                Conquistas
              </Text>
              <TouchableOpacity onPress={() => setShowAllBadges((v) => !v)}>
                <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>
                  {showAllBadges ? 'Ver menos' : 'Ver todos'}
                </Text>
              </TouchableOpacity>
            </View>
            <GlassCard intensity="subtle" shadow="sm" padding={16}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {((badgesData.badges || badgesData) as any[]).slice(0, showAllBadges ? undefined : 3).map((badge: any) => (
                  <View key={badge.id || badge.key} style={{ alignItems: 'center', width: 72 }}>
                    <View style={{
                      width: 52, height: 52, borderRadius: 16,
                      backgroundColor: colors.primaryGhost,
                      alignItems: 'center', justifyContent: 'center',
                      borderWidth: 1, borderColor: colors.primary + '25',
                      marginBottom: 6,
                    }}>
                      <Text style={{ fontSize: 26 }}>{badge.icon || badge.emoji || '🏅'}</Text>
                    </View>
                    <Text style={{ fontSize: 9, fontWeight: '600', color: colors.textSecondary, textAlign: 'center', lineHeight: 13 }} numberOfLines={2}>
                      {badge.name || badge.title}
                    </Text>
                  </View>
                ))}
              </View>
            </GlassCard>
          </View>
        )}

        {/* ─── DOCUMENTOS ─── */}
        <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
          <Text style={{ color: colors.textTertiary, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, paddingLeft: 4 }}>
            Documentos
          </Text>
          <TouchableOpacity
            onPress={handleDocumentUpload}
            disabled={uploadingDoc}
            activeOpacity={0.7}
          >
            <GlassCard intensity="subtle" shadow="sm" padding={16}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View style={{
                  width: 44, height: 44, borderRadius: 12,
                  backgroundColor: colors.primary + '15',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {uploadingDoc
                    ? <ActivityIndicator size="small" color={colors.primary} />
                    : <Ionicons name="cloud-upload-outline" size={22} color={colors.primary} />
                  }
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>Enviar documento</Text>
                  <Text style={{ color: colors.textTertiary, fontSize: 12, marginTop: 1 }}>Exames, atestados, planilhas</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </View>
            </GlassCard>
          </TouchableOpacity>
        </View>

        {/* Menu Sections */}
        {MENU_SECTIONS.map((section) => (
          <View key={section.title} style={{ marginTop: 24, paddingHorizontal: 16 }}>
            <Text style={{
              color: colors.textTertiary,
              fontSize: 12,
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: 0.8,
              marginBottom: 10,
              paddingLeft: 4,
            }}>
              {section.title}
            </Text>
            <GlassCard intensity="medium" shadow="sm" padding={0}>
              {section.items.map((item, index) => (
                <React.Fragment key={item.label}>
                  <TouchableOpacity
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 14,
                      paddingHorizontal: 16,
                      gap: 14,
                    }}
                    onPress={() => router.push(item.route as any)}
                    activeOpacity={0.65}
                  >
                    <View style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      backgroundColor: item.color + '15',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <Ionicons name={item.icon} size={20} color={item.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>
                        {item.label}
                      </Text>
                      <Text style={{ color: colors.textTertiary, fontSize: 12, marginTop: 1 }}>
                        {item.desc}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                  </TouchableOpacity>
                  {index < section.items.length - 1 && (
                    <View style={{
                      height: 1,
                      backgroundColor: colors.divider,
                      marginLeft: 70,
                    }} />
                  )}
                </React.Fragment>
              ))}
            </GlassCard>
          </View>
        ))}

        {/* Logout Button */}
        <View style={{ paddingHorizontal: 16, marginTop: 28 }}>
          <TouchableOpacity
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              paddingVertical: 16,
              borderRadius: 16,
              backgroundColor: colors.error + '12',
              borderWidth: 1,
              borderColor: colors.error + '25',
            }}
            onPress={handleLogout}
            activeOpacity={0.7}
          >
            <Ionicons name="log-out-outline" size={20} color={colors.error} />
            <Text style={{ color: colors.error, fontSize: 16, fontWeight: '600' }}>
              {ptBR.profile.logout}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={{ alignItems: 'center', marginTop: 28, paddingBottom: 16 }}>
          <Text style={{ color: colors.textTertiary, fontSize: 12, fontWeight: '500' }}>
            RR - Rafinha Running
          </Text>
          <Text style={{ color: colors.textTertiary, fontSize: 11, marginTop: 2 }}>
            v1.0.0
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </Animated.ScrollView>
    </SafeAreaView>
  );
}
