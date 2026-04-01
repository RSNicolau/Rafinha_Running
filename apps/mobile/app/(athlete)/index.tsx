import React from 'react';
import {
  View, Text, ScrollView, RefreshControl, Pressable, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme';
import { GlassCard, GlassBadge } from '../../src/components/ui';
import { useAuthStore } from '../../src/stores/auth.store';
import { workoutService } from '../../src/services/workout.service';
import { formatDistance } from '../../src/utils/pace';
import { getWeekStart } from '../../src/utils/date';

const DAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export default function AthleteDashboard() {
  const { colors, isDark } = useTheme();
  const user = useAuthStore((s) => s.user);
  const insets = useSafeAreaInsets();
  const weekStart = getWeekStart().toISOString().split('T')[0];

  const { data: weekData, isLoading, refetch } = useQuery({
    queryKey: ['weeklyWorkouts', weekStart],
    queryFn: () => workoutService.getWeekly(weekStart),
  });

  const nextWorkout = weekData?.workouts?.find(
    (w: any) => w.status === 'SCHEDULED' && new Date(w.scheduledDate) >= new Date()
  );

  const completedPercent = weekData && weekData.totalCount > 0
    ? Math.round((weekData.completedCount / weekData.totalCount) * 100)
    : 0;

  const totalKm = weekData ? formatDistance(weekData.totalDistanceMeters) : '0m';
  const firstName = user?.name?.split(' ')[0] || 'Atleta';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ─── HEADER ─── */}
        <View style={{
          paddingTop: insets.top + 16,
          paddingBottom: 24,
          paddingHorizontal: 20,
          borderBottomWidth: 0.5,
          borderBottomColor: colors.glassBorder,
          ...(Platform.OS === 'web' ? {
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            backgroundColor: colors.headerBackground,
            position: 'sticky' as any,
            top: 0,
            zIndex: 10,
          } as any : {}),
        }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text style={{
                fontSize: 12, fontWeight: '600', letterSpacing: 1.5,
                color: colors.textTertiary, textTransform: 'uppercase' as any,
                marginBottom: 4,
              }}>
                {greeting}
              </Text>
              <Text style={{
                fontSize: 26, fontWeight: '800', letterSpacing: -0.8,
                color: colors.text,
              }}>
                {firstName} 👋
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Pressable
                onPress={() => router.push('/(athlete)/notifications')}
                style={{
                  width: 40, height: 40, borderRadius: 12,
                  backgroundColor: colors.glass,
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 0.5, borderColor: colors.glassBorder,
                }}
              >
                <Ionicons name="notifications-outline" size={18} color={colors.textSecondary} />
              </Pressable>
              <Pressable
                onPress={() => router.push('/(athlete)/profile')}
                style={{
                  width: 40, height: 40, borderRadius: 12,
                  backgroundColor: colors.primaryGhost,
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 0.5, borderColor: colors.primary + '20',
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '800', color: colors.primary }}>
                  {firstName.charAt(0).toUpperCase()}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View style={{ paddingHorizontal: 20, paddingTop: 24 }}>

          {/* ─── RESUMO DA SEMANA (GLASS HERO) ─── */}
          <GlassCard intensity="medium" shadow="md" padding={24} style={{ marginBottom: 20 }}>
            {/* Top row */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <View>
                <Text style={{
                  fontSize: 11, fontWeight: '700', letterSpacing: 1.5,
                  color: colors.primary, textTransform: 'uppercase' as any,
                  marginBottom: 6,
                }}>
                  Resumo da Semana
                </Text>
                <Text style={{
                  fontSize: 38, fontWeight: '800', letterSpacing: -1.5,
                  color: colors.text, lineHeight: 40,
                }}>
                  {totalKm}
                </Text>
                <Text style={{ fontSize: 13, color: colors.textTertiary, marginTop: 2 }}>
                  percorridos esta semana
                </Text>
              </View>
              <GlassBadge
                label={`${completedPercent}%`}
                variant={completedPercent >= 80 ? 'success' : completedPercent >= 50 ? 'primary' : 'default'}
                size="md"
              />
            </View>

            {/* Progress bar */}
            <View style={{
              height: 6, borderRadius: 3,
              backgroundColor: colors.text + '10',
              marginBottom: 20, overflow: 'hidden',
            }}>
              <View style={{
                height: '100%', width: `${completedPercent}%` as any,
                backgroundColor: completedPercent >= 80 ? colors.success : colors.primary,
                borderRadius: 3,
              }} />
            </View>

            {/* Stats row */}
            <View style={{ flexDirection: 'row' }}>
              {[
                { icon: 'checkmark-circle-outline', color: colors.success, value: weekData ? `${weekData.completedCount}` : '0', label: 'Concluídos' },
                { icon: 'time-outline', color: colors.primary, value: weekData ? `${weekData.totalCount - weekData.completedCount}` : '0', label: 'Restantes' },
                { icon: 'calendar-outline', color: '#8B5CF6', value: weekData ? `${weekData.totalCount}` : '0', label: 'Planejados' },
              ].map((s, i) => (
                <View key={s.label} style={{
                  flex: 1,
                  alignItems: i === 1 ? 'center' : i === 2 ? 'flex-end' : 'flex-start',
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                    <Ionicons name={s.icon as any} size={13} color={s.color} />
                    <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, letterSpacing: -0.5 }}>
                      {s.value}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11, color: colors.textTertiary, fontWeight: '500' }}>
                    {s.label}
                  </Text>
                </View>
              ))}
            </View>
          </GlassCard>

          {/* ─── PRÓXIMO TREINO ─── */}
          <View style={{ marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', letterSpacing: -0.4, color: colors.text }}>
                Próximo Treino
              </Text>
              <Pressable onPress={() => router.push('/(athlete)/calendar')}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>
                  Ver calendário
                </Text>
              </Pressable>
            </View>

            {nextWorkout ? (
              <Pressable onPress={() => router.push(`/(athlete)/workout/${nextWorkout.id}`)}>
                <GlassCard intensity="medium" shadow="md" padding={0}>
                  {/* Colored top accent */}
                  <View style={{ height: 4, backgroundColor: colors.primary, borderTopLeftRadius: 20, borderTopRightRadius: 20 }} />
                  <View style={{ padding: 20 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <GlassBadge label="HOJE" variant="primary" size="sm" />
                        </View>
                        <Text style={{ fontSize: 20, fontWeight: '700', letterSpacing: -0.5, color: colors.text, marginBottom: 4 }}>
                          {nextWorkout.title || 'Treino do Dia'}
                        </Text>
                        {nextWorkout.description && (
                          <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 20 }} numberOfLines={2}>
                            {nextWorkout.description}
                          </Text>
                        )}
                      </View>
                      <View style={{
                        width: 48, height: 48, borderRadius: 14, marginLeft: 12,
                        backgroundColor: colors.primaryGhost,
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Ionicons name="fitness-outline" size={22} color={colors.primary} />
                      </View>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                      {[
                        { icon: 'navigate-outline', label: nextWorkout.distanceMeters ? `${(nextWorkout.distanceMeters / 1000).toFixed(1)} km` : '--', color: colors.primary },
                        { icon: 'speedometer-outline', label: nextWorkout.targetPace || '--', color: '#3B82F6' },
                        { icon: 'time-outline', label: nextWorkout.durationMinutes ? `${nextWorkout.durationMinutes} min` : '--', color: '#8B5CF6' },
                      ].map((m) => (
                        <View key={m.label} style={{
                          flex: 1, padding: 12, borderRadius: 12,
                          backgroundColor: colors.glass,
                          borderWidth: 0.5, borderColor: colors.glassBorder,
                          alignItems: 'center', gap: 4,
                        }}>
                          <Ionicons name={m.icon as any} size={14} color={m.color} />
                          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>{m.label}</Text>
                        </View>
                      ))}
                    </View>

                    <View style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                      gap: 8, paddingVertical: 13, borderRadius: 14,
                      backgroundColor: colors.primary,
                    }}>
                      <Ionicons name="play-outline" size={16} color="#FFF" />
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFF', letterSpacing: 0.3 }}>
                        Iniciar Treino
                      </Text>
                    </View>
                  </View>
                </GlassCard>
              </Pressable>
            ) : (
              <GlassCard intensity="subtle" shadow="sm" padding={32}>
                <View style={{ alignItems: 'center' }}>
                  <View style={{
                    width: 56, height: 56, borderRadius: 18, marginBottom: 12,
                    backgroundColor: colors.success + '12',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Ionicons name="checkmark-circle-outline" size={26} color={colors.success} />
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 4 }}>
                    Tudo em dia!
                  </Text>
                  <Text style={{ fontSize: 13, color: colors.textTertiary, textAlign: 'center', lineHeight: 20 }}>
                    Nenhum treino agendado para hoje.
                  </Text>
                </View>
              </GlassCard>
            )}
          </View>

          {/* ─── DIAS DA SEMANA ─── */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', letterSpacing: -0.4, color: colors.text, marginBottom: 14 }}>
              Esta Semana
            </Text>
            <GlassCard intensity="subtle" shadow="sm" padding={16}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                {DAYS.map((day, i) => {
                  const workout = weekData?.workouts?.[i];
                  const isCompleted = workout?.status === 'COMPLETED';
                  const isScheduled = workout?.status === 'SCHEDULED';
                  const isToday = i === new Date().getDay();
                  return (
                    <View key={i} style={{ alignItems: 'center', gap: 6 }}>
                      <Text style={{
                        fontSize: 11, fontWeight: '600',
                        color: isToday ? colors.primary : colors.textTertiary,
                      }}>
                        {day}
                      </Text>
                      <View style={{
                        width: 34, height: 34, borderRadius: 10,
                        alignItems: 'center', justifyContent: 'center',
                        backgroundColor: isCompleted
                          ? colors.primary
                          : isScheduled
                          ? colors.primaryGhost
                          : colors.glass,
                        borderWidth: isToday ? 1.5 : 0.5,
                        borderColor: isToday ? colors.primary : colors.glassBorder,
                      }}>
                        {isCompleted ? (
                          <Ionicons name="checkmark" size={14} color="#FFF" />
                        ) : isScheduled ? (
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary }} />
                        ) : (
                          <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.text + '20' }} />
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            </GlassCard>
          </View>

          {/* ─── ACESSO RÁPIDO ─── */}
          <View style={{ marginBottom: 8 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', letterSpacing: -0.4, color: colors.text, marginBottom: 14 }}>
              Acesso Rápido
            </Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {[
                { icon: 'trending-up-outline', label: 'Performance', color: '#3B82F6', route: '/(athlete)/performance' },
                { icon: 'trophy-outline', label: 'Ranking', color: '#F59E0B', route: '/(athlete)/ranking' },
                { icon: 'calendar-outline', label: 'Calendário', color: '#8B5CF6', route: '/(athlete)/calendar' },
                { icon: 'document-text-outline', label: 'Planilha', color: colors.primary, route: '/(athlete)/training-upload' },
              ].map((a) => (
                <Pressable
                  key={a.label}
                  onPress={() => router.push(a.route as any)}
                  style={{ flex: 1 }}
                >
                  {({ pressed }) => (
                    <GlassCard intensity="subtle" shadow="sm" padding={0} style={{ opacity: pressed ? 0.7 : 1 }}>
                      <View style={{ paddingVertical: 16, alignItems: 'center', gap: 8 }}>
                        <View style={{
                          width: 38, height: 38, borderRadius: 11,
                          backgroundColor: a.color + '12',
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Ionicons name={a.icon as any} size={18} color={a.color} />
                        </View>
                        <Text style={{ fontSize: 10, fontWeight: '600', color: colors.textSecondary, textAlign: 'center' }}>
                          {a.label}
                        </Text>
                      </View>
                    </GlassCard>
                  )}
                </Pressable>
              ))}
            </View>
          </View>

        </View>
      </ScrollView>
    </View>
  );
}
