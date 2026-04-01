import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, Pressable, Platform, RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../src/theme';
import { workoutService } from '../../src/services/workout.service';

type Period = '1M' | '3M' | '6M' | 'Todo';

const PERIODS: Period[] = ['1M', '3M', '6M', 'Todo'];

const WORKOUT_TYPE_LABELS: Record<string, string> = {
  INTERVAL: 'Intervalado',
  LONG_RUN: 'Longão',
  EASY_RUN: 'Corrida Leve',
  TEMPO: 'Tempo Run',
  RECOVERY: 'Recuperação',
  FARTLEK: 'Fartlek',
  HILL: 'Morro',
  RACE: 'Corrida',
};

const WORKOUT_TYPE_COLORS: Record<string, string> = {
  INTERVAL: '#EF4444',
  LONG_RUN: '#8B5CF6',
  EASY_RUN: '#10B981',
  TEMPO: '#F59E0B',
  RECOVERY: '#3B82F6',
  FARTLEK: '#EC4899',
  HILL: '#F97316',
  RACE: '#DC2626',
};

const PR_DISTANCES = [
  { key: '5K', label: '5K', minM: 4500, maxM: 5500, icon: 'flash-outline' as const, color: '#F59E0B' },
  { key: '10K', label: '10K', minM: 9000, maxM: 11000, icon: 'trending-up-outline' as const, color: '#3B82F6' },
  { key: '21K', label: 'Meia', minM: 19000, maxM: 23000, icon: 'trophy-outline' as const, color: '#8B5CF6' },
  { key: '42K', label: 'Maratona', minM: 39000, maxM: 44000, icon: 'star-outline' as const, color: '#6B7280' },
];

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h${m.toString().padStart(2, '0')}min`;
  return `${m}min${s > 0 ? s.toString().padStart(2, '0') + 's' : ''}`;
}

function formatDurationFull(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function computePace(distanceMeters: number, durationSeconds: number): string {
  if (!distanceMeters || !durationSeconds) return '--';
  const paceSecPerKm = durationSeconds / (distanceMeters / 1000);
  const mins = Math.floor(paceSecPerKm / 60);
  const secs = Math.round(paceSecPerKm % 60).toString().padStart(2, '0');
  return `${mins}:${secs}/km`;
}

function getWeekLabel(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day); // Sunday start
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function getMonthLabel(date: Date): string {
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return months[date.getMonth()];
}

function periodToCutoff(period: Period): Date {
  const now = new Date();
  switch (period) {
    case '1M': { const d = new Date(now); d.setMonth(d.getMonth() - 1); return d; }
    case '3M': { const d = new Date(now); d.setMonth(d.getMonth() - 3); return d; }
    case '6M': { const d = new Date(now); d.setMonth(d.getMonth() - 6); return d; }
    default: return new Date(0);
  }
}

// ─── Bar Chart Component ──────────────────────────────────────────────────────
function BarChart({
  data,
  colors: c,
  isDark,
}: {
  data: { week: string; km: number }[];
  colors: any;
  isDark: boolean;
}) {
  if (!data.length) return null;
  const maxKm = Math.max(...data.map((d) => d.km), 1);
  const chartHeight = 100;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: chartHeight + 28 }}>
      {data.map((item, i) => {
        const barH = Math.max(4, (item.km / maxKm) * chartHeight);
        const isLast = i === data.length - 1;
        return (
          <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: chartHeight + 28 }}>
            <Text style={{
              fontSize: 9, color: isLast ? c.primary : c.textTertiary,
              fontWeight: isLast ? '700' : '400',
              marginBottom: 3,
            }}>
              {item.km >= 100 ? `${item.km.toFixed(0)}` : `${item.km.toFixed(1)}`}
            </Text>
            <View style={{ width: '100%', height: barH, borderRadius: 4, overflow: 'hidden' }}>
              {isLast ? (
                <LinearGradient
                  colors={['#EF4444', '#DC2626']}
                  style={{ flex: 1 }}
                  start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                />
              ) : (
                <View style={{
                  flex: 1,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
                }} />
              )}
            </View>
            <Text style={{ fontSize: 8, color: c.textTertiary, marginTop: 4, textAlign: 'center' }} numberOfLines={1}>
              {item.week}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function PerformanceScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState<Period>('3M');
  const [showAllActivities, setShowAllActivities] = useState(false);

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ['workoutStats'],
    queryFn: () => workoutService.getStats(),
  });

  const { data: historyData, isLoading: historyLoading, refetch: refetchHistory } = useQuery({
    queryKey: ['workoutHistory'],
    queryFn: () => workoutService.getHistory(1, 100),
  });

  const isLoading = statsLoading || historyLoading;
  const onRefresh = () => { refetchStats(); refetchHistory(); };

  const history: any[] = historyData?.data ?? [];

  // ─── Volume chart data ───────────────────────────────────────────────────────
  const volumeData = useMemo(() => {
    const cutoff = periodToCutoff(period);
    const filtered = history.filter((w: any) => new Date(w.completedAt) >= cutoff && w.result);

    const useMonths = period === '6M' || period === 'Todo';
    const groups: Record<string, { km: number; workouts: number }> = {};

    filtered.forEach((w: any) => {
      const date = new Date(w.completedAt);
      const key = useMonths
        ? `${date.getFullYear()}-${date.getMonth()}`
        : `${date.getFullYear()}-W${getWeekLabel(date)}`;
      const label = useMonths ? getMonthLabel(date) : getWeekLabel(date);

      if (!groups[key]) groups[key] = { km: 0, workouts: 0 };
      groups[key].km += (w.result?.distanceMeters ?? 0) / 1000;
      groups[key].workouts += 1;

      // Store label alongside (override doesn't matter since same key)
      (groups[key] as any).label = label;
    });

    return Object.values(groups).map((g: any) => ({
      week: g.label,
      km: Math.round(g.km * 10) / 10,
      workouts: g.workouts,
    }));
  }, [history, period]);

  const totalKm = volumeData.reduce((s, d) => s + d.km, 0);
  const totalWorkoutsInPeriod = volumeData.reduce((s, d) => s + d.workouts, 0);
  const avgKmPerWeek = volumeData.length > 0 ? (totalKm / volumeData.length).toFixed(1) : '0';

  // ─── Personal records ────────────────────────────────────────────────────────
  const personalRecords = useMemo(() => {
    return PR_DISTANCES.map((dist) => {
      const candidates = history.filter(
        (w: any) => w.result &&
          w.result.distanceMeters >= dist.minM &&
          w.result.distanceMeters <= dist.maxM &&
          w.result.durationSeconds > 0
      );

      if (!candidates.length) {
        return { ...dist, time: '—', pace: '—', dateStr: 'Não realizado' };
      }

      // Best = shortest duration for roughly equal distances
      const best = candidates.reduce((a: any, b: any) =>
        a.result.durationSeconds < b.result.durationSeconds ? a : b
      );

      const time = formatDurationFull(best.result.durationSeconds);
      const pace = computePace(best.result.distanceMeters, best.result.durationSeconds);
      const d = new Date(best.completedAt);
      const dateStr = `${d.getDate()} ${getMonthLabel(d)} ${d.getFullYear()}`;

      return { ...dist, time, pace, dateStr };
    });
  }, [history]);

  // ─── Recent activities ───────────────────────────────────────────────────────
  const allActivities = history.slice(0, 10).map((w: any) => {
    const d = new Date(w.completedAt);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    let dateStr = '';
    if (diffDays === 0) dateStr = `Hoje, ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    else if (diffDays === 1) dateStr = `Ontem, ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    else dateStr = `${d.getDate()} ${getMonthLabel(d)}, ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;

    return {
      id: w.id,
      title: w.title || WORKOUT_TYPE_LABELS[w.type] || 'Treino',
      type: w.type,
      date: dateStr,
      distance: w.result ? `${((w.result.distanceMeters ?? 0) / 1000).toFixed(1)} km` : '--',
      duration: w.result ? formatDuration(w.result.durationSeconds ?? 0) : '--',
      pace: w.result ? computePace(w.result.distanceMeters, w.result.durationSeconds) : '--',
      hr: w.result?.avgHeartRate ?? 0,
      calories: w.result?.calories ?? 0,
      color: WORKOUT_TYPE_COLORS[w.type] ?? '#6B7280',
      source: w.result?.source ?? 'MANUAL',
    };
  });

  const visibleActivities = showAllActivities ? allActivities : allActivities.slice(0, 3);

  const shadow = Platform.OS === 'web'
    ? { boxShadow: isDark ? '0 4px 20px rgba(0,0,0,0.25)' : '0 2px 16px rgba(0,0,0,0.06)' } as any
    : {};

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* ─── Sticky Header ─── */}
      <View style={{
        paddingTop: insets.top + 12,
        paddingBottom: 16,
        paddingHorizontal: 20,
        borderBottomWidth: 0.5,
        borderBottomColor: colors.text + '08',
        ...(Platform.OS === 'web' ? {
          position: 'sticky' as any, top: 0, zIndex: 10,
          backgroundColor: colors.background + 'F2',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        } as any : {}),
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable onPress={() => router.back()} style={{ padding: 2 }}>
            <Ionicons name="arrow-back" size={22} color={colors.textSecondary} />
          </Pressable>
          <Text style={{ fontSize: 20, fontWeight: '800', letterSpacing: -0.5, color: colors.text, flex: 1 }}>
            Meu Desempenho
          </Text>
          <Pressable
            onPress={() => router.push('/(athlete)/integrations')}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 5,
              paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10,
              backgroundColor: '#007CC3' + '15',
            }}
          >
            <Ionicons name="watch-outline" size={14} color="#007CC3" />
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#007CC3' }}>GPS</Text>
          </Pressable>
        </View>

        {/* Period selector */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
          {PERIODS.map((p) => (
            <Pressable
              key={p}
              onPress={() => setPeriod(p)}
              style={{
                paddingHorizontal: 14, paddingVertical: 6, borderRadius: 10,
                backgroundColor: period === p ? colors.primary : colors.text + '07',
              }}
            >
              <Text style={{
                fontSize: 13, fontWeight: '700',
                color: period === p ? '#FFF' : colors.textSecondary,
              }}>
                {p}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100, paddingTop: 20, paddingHorizontal: 20, gap: 20 }}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={colors.primary} />}
      >

        {/* ─── VISÃO GERAL ─── */}
        <View>
          <Text style={{ fontSize: 17, fontWeight: '700', letterSpacing: -0.4, color: colors.text, marginBottom: 12 }}>
            Visão Geral • {period}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {[
              {
                value: totalKm >= 100 ? totalKm.toFixed(0) : totalKm.toFixed(1),
                unit: 'km', label: 'Total', color: colors.primary, icon: 'footsteps-outline',
              },
              {
                value: `${totalWorkoutsInPeriod}`,
                unit: 'treinos', label: 'Realizados', color: '#3B82F6', icon: 'fitness-outline',
              },
              {
                value: avgKmPerWeek,
                unit: 'km/sem', label: 'Média', color: '#8B5CF6', icon: 'trending-up-outline',
              },
              {
                value: stats?.avgPace ?? '--',
                unit: '/km', label: 'Pace Médio', color: '#10B981', icon: 'speedometer-outline',
              },
            ].map((s) => (
              <View key={s.label} style={{
                flex: 1, borderRadius: 16, padding: 12,
                backgroundColor: colors.surface,
                borderWidth: 0.5, borderColor: colors.text + '07',
                alignItems: 'center', gap: 4, ...shadow,
              }}>
                <View style={{
                  width: 32, height: 32, borderRadius: 10,
                  backgroundColor: s.color + '12',
                  alignItems: 'center', justifyContent: 'center', marginBottom: 2,
                }}>
                  <Ionicons name={s.icon as any} size={15} color={s.color} />
                </View>
                <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text, letterSpacing: -0.5 }}>
                  {s.value}
                </Text>
                <Text style={{ fontSize: 9, color: s.color, fontWeight: '700', letterSpacing: 0.5 }}>
                  {s.unit.toUpperCase()}
                </Text>
                <Text style={{ fontSize: 9, color: colors.textTertiary, textAlign: 'center' }}>
                  {s.label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* ─── VOLUME SEMANAL (BAR CHART) ─── */}
        <View style={{
          borderRadius: 20, padding: 20,
          backgroundColor: colors.surface,
          borderWidth: 0.5, borderColor: colors.text + '07',
          ...shadow,
        }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <View>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>
                Volume de Treino
              </Text>
              <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 2 }}>
                km percorridos por {period === '6M' || period === 'Todo' ? 'mês' : 'semana'}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: colors.primary, letterSpacing: -0.5 }}>
                {totalKm >= 100 ? totalKm.toFixed(0) : totalKm.toFixed(1)} km
              </Text>
              <Text style={{ fontSize: 11, color: colors.textTertiary }}>total no período</Text>
            </View>
          </View>
          {volumeData.length > 0 ? (
            <BarChart data={volumeData} colors={colors} isDark={isDark} />
          ) : (
            <View style={{ height: 100, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: colors.textTertiary, fontSize: 13 }}>
                Nenhum treino no período
              </Text>
            </View>
          )}
        </View>

        {/* ─── RECORDES PESSOAIS ─── */}
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', letterSpacing: -0.4, color: colors.text }}>
              Recordes Pessoais
            </Text>
            <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: '#FFD700' + '15' }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#B7860B', letterSpacing: 0.5 }}>
                🏆 SEUS PRs
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {personalRecords.map((pr) => (
              <View key={pr.key} style={{
                width: '47.5%',
                borderRadius: 18, overflow: 'hidden',
                borderWidth: 0.5,
                borderColor: pr.time === '—' ? colors.text + '08' : pr.color + '25',
                ...shadow,
              }}>
                <LinearGradient
                  colors={pr.time === '—'
                    ? isDark ? ['#111', '#161616'] : ['#F8F8FA', '#F2F2F7']
                    : isDark
                      ? [pr.color + '10', pr.color + '05']
                      : [pr.color + '08', '#FFFFFF']}
                  style={{ padding: 16 }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <View style={{
                      paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
                      backgroundColor: pr.time === '—' ? colors.text + '08' : pr.color + '15',
                    }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: pr.time === '—' ? colors.textTertiary : pr.color }}>
                        {pr.label}
                      </Text>
                    </View>
                    <Ionicons name={pr.icon} size={16} color={pr.time === '—' ? colors.textTertiary : pr.color} />
                  </View>

                  <Text style={{
                    fontSize: pr.time === '—' ? 22 : 24,
                    fontWeight: '800', letterSpacing: -1,
                    color: pr.time === '—' ? colors.textTertiary : colors.text,
                    marginBottom: 4,
                  }}>
                    {pr.time}
                  </Text>

                  {pr.time !== '—' ? (
                    <>
                      <Text style={{ fontSize: 11, color: colors.textTertiary, marginBottom: 6 }}>
                        {pr.pace}
                      </Text>
                      <Text style={{ fontSize: 10, color: colors.textTertiary }}>
                        {pr.dateStr}
                      </Text>
                    </>
                  ) : (
                    <Text style={{ fontSize: 11, color: colors.textTertiary }}>
                      Ainda não realizado
                    </Text>
                  )}
                </LinearGradient>
              </View>
            ))}
          </View>
        </View>

        {/* ─── ATIVIDADES RECENTES ─── */}
        <View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', letterSpacing: -0.4, color: colors.text }}>
              Atividades Recentes
            </Text>
            {allActivities.length > 3 && (
              <Pressable onPress={() => setShowAllActivities(!showAllActivities)}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>
                  {showAllActivities ? 'Ver menos' : 'Ver todas'}
                </Text>
              </Pressable>
            )}
          </View>

          {visibleActivities.length === 0 ? (
            <View style={{
              borderRadius: 20, padding: 32,
              backgroundColor: colors.surface,
              borderWidth: 0.5, borderColor: colors.text + '08',
              alignItems: 'center', ...shadow,
            }}>
              <Ionicons name="fitness-outline" size={32} color={colors.textTertiary} style={{ marginBottom: 10 }} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textSecondary, textAlign: 'center' }}>
                Nenhuma atividade ainda.{'\n'}Complete treinos para ver aqui.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {visibleActivities.map((act) => (
                <View
                  key={act.id}
                  style={{ borderRadius: 20, overflow: 'hidden', borderWidth: 0.5, borderColor: colors.text + '08', ...shadow }}
                >
                  <View style={{ height: 3, backgroundColor: act.color }} />
                  <View style={{ padding: 16, backgroundColor: colors.surface }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 }}>
                      <View style={{
                        width: 42, height: 42, borderRadius: 12,
                        backgroundColor: act.color + '12',
                        alignItems: 'center', justifyContent: 'center', marginRight: 12,
                      }}>
                        <Ionicons
                          name={
                            act.type === 'INTERVAL' ? 'flash-outline' :
                            act.type === 'LONG_RUN' ? 'trail-sign-outline' :
                            act.type === 'TEMPO' ? 'speedometer-outline' :
                            act.type === 'EASY_RUN' ? 'leaf-outline' :
                            'walk-outline'
                          }
                          size={20} color={act.color}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text, letterSpacing: -0.3 }}>
                          {act.title}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                          <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: act.color + '12' }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: act.color }}>
                              {WORKOUT_TYPE_LABELS[act.type] || act.type}
                            </Text>
                          </View>
                          <Text style={{ fontSize: 11, color: colors.textTertiary }}>{act.date}</Text>
                        </View>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Ionicons
                            name={act.source === 'MANUAL' ? 'create-outline' : 'watch-outline'}
                            size={11}
                            color={act.source === 'MANUAL' ? colors.textTertiary : '#007CC3'}
                          />
                          <Text style={{ fontSize: 10, color: act.source === 'MANUAL' ? colors.textTertiary : '#007CC3', fontWeight: '600' }}>
                            {act.source === 'MANUAL' ? 'Manual' : 'GPS'}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {[
                        { icon: 'navigate-outline', value: act.distance, color: act.color },
                        { icon: 'time-outline', value: act.duration, color: '#8B5CF6' },
                        { icon: 'speedometer-outline', value: act.pace, color: '#3B82F6' },
                        ...(act.hr ? [{ icon: 'heart-outline', value: `${act.hr}bpm`, color: '#EF4444' }] : []),
                        ...(act.calories ? [{ icon: 'flame-outline', value: `${act.calories}kcal`, color: '#F59E0B' }] : []),
                      ].map((m) => (
                        <View key={m.icon} style={{
                          flex: 1, alignItems: 'center', padding: 8, borderRadius: 10,
                          backgroundColor: colors.text + '04',
                          borderWidth: 0.5, borderColor: colors.text + '05', gap: 3,
                        }}>
                          <Ionicons name={m.icon as any} size={12} color={m.color} />
                          <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text, textAlign: 'center' }}>
                            {m.value}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ─── TOTAL GERAL ─── */}
        <View style={{
          borderRadius: 20, overflow: 'hidden', ...shadow,
        }}>
          <LinearGradient
            colors={['#DC2626', '#B91C1C']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ padding: 20 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <Ionicons name="stats-chart-outline" size={22} color="#FFF" />
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#FFF', letterSpacing: -0.3 }}>
                Totais Gerais
              </Text>
            </View>
            {[
              {
                icon: 'footsteps-outline' as const,
                label: 'Quilômetros totais',
                value: stats ? `${stats.totalKm >= 100 ? stats.totalKm.toFixed(0) : stats.totalKm.toFixed(1)} km` : '--',
              },
              {
                icon: 'fitness-outline' as const,
                label: 'Treinos completos',
                value: stats ? `${stats.totalWorkouts} treinos` : '--',
              },
              {
                icon: 'speedometer-outline' as const,
                label: 'Pace médio geral',
                value: stats?.avgPace ? `${stats.avgPace}/km` : '--',
              },
            ].map((item, i) => (
              <View key={i} style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                paddingVertical: i < 2 ? 10 : 0,
                borderBottomWidth: i < 2 ? 1 : 0,
                borderBottomColor: 'rgba(255,255,255,0.12)',
              }}>
                <View style={{
                  width: 34, height: 34, borderRadius: 10,
                  backgroundColor: 'rgba(255,255,255,0.12)',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Ionicons name={item.icon} size={16} color="#FFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>{item.label}</Text>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#FFF', marginTop: 1 }}>{item.value}</Text>
                </View>
              </View>
            ))}
          </LinearGradient>
        </View>

      </ScrollView>
    </View>
  );
}
