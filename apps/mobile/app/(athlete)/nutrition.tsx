import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, Platform, Alert, Modal, TextInput, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme';
import { api } from '../../src/services/api';

// Metas visuais default (exibição) — os dados exibidos vêm todos da API.
const MACRO_GOALS = { calories: 2400, protein: 180, carbs: 280, fat: 75 };
const DEFAULT_WATER_GOAL = 3000; // fallback igual ao default do backend

interface ApiMeal {
  id: string;
  mealName: string;
  mealTime?: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  items: string[];
}

interface ApiSupplement {
  id: string;
  name: string;
  dose?: string | null;
  timeOfDay?: string | null;
  color?: string | null;
  icon?: string | null;
  taken: boolean;
}

// ─── Ring Chart ───────────────────────────────────────────────────────────────
function MacroRing({ calories, goalCalories, colors }: { calories: number; goalCalories: number; colors: any }) {
  const pct = Math.min(100, Math.round((calories / goalCalories) * 100));
  const remaining = goalCalories - calories;
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: 140, height: 140, alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        <View style={{
          width: 140, height: 140, borderRadius: 70,
          borderWidth: 12, borderColor: colors.text + '0A',
          position: 'absolute',
        }} />
        <View style={{
          width: 140, height: 140, borderRadius: 70,
          borderWidth: 12,
          borderColor: 'transparent',
          borderTopColor: colors.primary,
          borderRightColor: pct > 25 ? colors.primary : 'transparent',
          borderBottomColor: pct > 50 ? colors.primary : 'transparent',
          borderLeftColor: pct > 75 ? colors.primary : 'transparent',
          position: 'absolute',
          transform: [{ rotate: '-90deg' }],
          ...(Platform.OS === 'web' ? {
            background: `conic-gradient(${colors.primary} ${pct * 3.6}deg, transparent 0deg)`,
            borderWidth: 0,
            maskImage: 'radial-gradient(transparent 52px, black 52px)',
            WebkitMaskImage: 'radial-gradient(transparent 52px, black 52px)',
          } as any : {}),
        }} />
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -1 }}>
            {calories}
          </Text>
          <Text style={{ fontSize: 10, color: colors.textTertiary, fontWeight: '600' }}>kcal</Text>
        </View>
      </View>
      <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 8 }}>
        {remaining > 0 ? `${remaining} kcal restantes` : 'Meta atingida! 🎯'}
      </Text>
    </View>
  );
}

// ─── Add Meal Modal (real: POST /nutrition/analyze + /nutrition/meal) ─────────
// O atleta descreve o que comeu → IA calcula kcal/proteína/carbo/gordura
// automaticamente (campos continuam editáveis para ajuste fino).
function AddMealModal({ visible, onClose, onSaved, dateStr }: {
  visible: boolean; onClose: () => void; onSaved: () => void; dateStr: string;
}) {
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const [time, setTime] = useState('');
  const [items, setItems] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [analysis, setAnalysis] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setName(''); setTime(''); setItems(''); setCalories(''); setProtein(''); setCarbs(''); setFat('');
      setAnalysis(''); setError('');
    }
  }, [visible]);

  const analyze = async () => {
    if (!items.trim()) { setError('Descreva o que você comeu para calcular'); return; }
    setAnalyzing(true);
    setError('');
    setAnalysis('');
    try {
      const { data } = await api.post('/nutrition/analyze', { description: items.trim() });
      if (data?.calories > 0) {
        setCalories(String(data.calories));
        setProtein(String(Math.round(data.protein)));
        setCarbs(String(Math.round(data.carbs)));
        setFat(String(Math.round(data.fat)));
        setAnalysis(data.analysis || '');
      } else {
        setError(data?.analysis || 'Não foi possível estimar — preencha manualmente.');
      }
    } catch {
      setError('Não foi possível estimar agora — preencha manualmente.');
    } finally {
      setAnalyzing(false);
    }
  };

  const save = async () => {
    if (!name.trim()) { setError('Dê um nome à refeição'); return; }
    setSaving(true);
    setError('');
    try {
      await api.post('/nutrition/meal', {
        date: dateStr,
        mealName: name.trim(),
        mealTime: time.trim() || undefined,
        calories: parseInt(calories, 10) || 0,
        protein: parseInt(protein, 10) || 0,
        carbs: parseInt(carbs, 10) || 0,
        fat: parseInt(fat, 10) || 0,
        items: items.split(',').map((s) => s.trim()).filter(Boolean),
      });
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Não foi possível salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    borderWidth: 1, borderColor: colors.text + '15', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.text,
    backgroundColor: colors.text + '04',
  } as const;

  const hasMacros = !!(calories || protein || carbs || fat);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 32 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }}>Adicionar refeição</Text>
            <Pressable onPress={onClose} hitSlop={10}><Ionicons name="close" size={22} color={colors.textSecondary} /></Pressable>
          </View>
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput placeholder="Nome (ex.: Almoço)" placeholderTextColor={colors.textTertiary} value={name} onChangeText={setName} style={{ ...inputStyle, flex: 2 }} />
              <TextInput placeholder="Horário" placeholderTextColor={colors.textTertiary} value={time} onChangeText={setTime} style={{ ...inputStyle, flex: 1 }} />
            </View>
            <TextInput
              placeholder="O que você comeu? (ex.: 2 ovos mexidos, 2 fatias de pão integral, 1 banana, café com leite)"
              placeholderTextColor={colors.textTertiary}
              value={items}
              onChangeText={setItems}
              multiline
              style={{ ...inputStyle, minHeight: 64, textAlignVertical: 'top' as any }}
            />

            {/* IA calcula os macros a partir da descrição */}
            <Pressable
              disabled={analyzing || !items.trim()}
              onPress={analyze}
              style={{ borderRadius: 12, paddingVertical: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, backgroundColor: '#8B5CF6' + (analyzing || !items.trim() ? '30' : ''), opacity: analyzing ? 0.8 : 1 }}
            >
              {analyzing ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <Ionicons name="sparkles" size={16} color="#FFF" />
              )}
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFF' }}>
                {analyzing ? 'Calculando…' : 'Calcular calorias e macros com IA'}
              </Text>
            </Pressable>

            {!!analysis && (
              <View style={{ borderRadius: 12, padding: 12, backgroundColor: '#8B5CF6' + '10', borderWidth: 1, borderColor: '#8B5CF6' + '25' }}>
                <Text style={{ fontSize: 12, color: colors.textSecondary }}>✨ {analysis}</Text>
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textTertiary, marginBottom: 4 }}>KCAL</Text>
                <TextInput placeholder="0" placeholderTextColor={colors.textTertiary} value={calories} onChangeText={setCalories} keyboardType="numeric" style={inputStyle} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textTertiary, marginBottom: 4 }}>PROT. (G)</Text>
                <TextInput placeholder="0" placeholderTextColor={colors.textTertiary} value={protein} onChangeText={setProtein} keyboardType="numeric" style={inputStyle} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textTertiary, marginBottom: 4 }}>CARB. (G)</Text>
                <TextInput placeholder="0" placeholderTextColor={colors.textTertiary} value={carbs} onChangeText={setCarbs} keyboardType="numeric" style={inputStyle} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textTertiary, marginBottom: 4 }}>GORD. (G)</Text>
                <TextInput placeholder="0" placeholderTextColor={colors.textTertiary} value={fat} onChangeText={setFat} keyboardType="numeric" style={inputStyle} />
              </View>
            </View>
          </View>
          {!!error && <Text style={{ fontSize: 13, color: '#DC2626', marginTop: 10 }}>{error}</Text>}
          <Pressable disabled={saving} onPress={save} style={{ marginTop: 16, borderRadius: 14, paddingVertical: 15, alignItems: 'center', backgroundColor: hasMacros ? colors.primary : colors.text + '25', opacity: saving ? 0.7 : 1 }}>
            {saving ? <ActivityIndicator color="#FFF" /> : <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFF' }}>Salvar refeição</Text>}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ─── Add Supplement Modal (real: POST /nutrition/supplements) ─────────────────
function AddSupplementModal({ visible, onClose, onSaved }: {
  visible: boolean; onClose: () => void; onSaved: () => void;
}) {
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [timeOfDay, setTimeOfDay] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) { setName(''); setDose(''); setTimeOfDay(''); setError(''); }
  }, [visible]);

  const save = async () => {
    if (!name.trim()) { setError('Dê um nome ao suplemento'); return; }
    setSaving(true);
    setError('');
    try {
      await api.post('/nutrition/supplements', {
        name: name.trim(),
        dose: dose.trim() || undefined,
        timeOfDay: timeOfDay.trim() || undefined,
      });
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Não foi possível salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    borderWidth: 1, borderColor: colors.text + '15', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.text,
    backgroundColor: colors.text + '04',
  } as const;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 32 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }}>Adicionar suplemento</Text>
            <Pressable onPress={onClose} hitSlop={10}><Ionicons name="close" size={22} color={colors.textSecondary} /></Pressable>
          </View>
          <View style={{ gap: 10 }}>
            <TextInput placeholder="Nome (ex.: Creatina)" placeholderTextColor={colors.textTertiary} value={name} onChangeText={setName} style={inputStyle} />
            <TextInput placeholder="Dose (ex.: 5g)" placeholderTextColor={colors.textTertiary} value={dose} onChangeText={setDose} style={inputStyle} />
            <TextInput placeholder="Quando (ex.: Pós-treino)" placeholderTextColor={colors.textTertiary} value={timeOfDay} onChangeText={setTimeOfDay} style={inputStyle} />
          </View>
          {!!error && <Text style={{ fontSize: 13, color: '#DC2626', marginTop: 10 }}>{error}</Text>}
          <Pressable disabled={saving} onPress={save} style={{ marginTop: 16, borderRadius: 14, paddingVertical: 15, alignItems: 'center', backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }}>
            {saving ? <ActivityIndicator color="#FFF" /> : <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFF' }}>Salvar suplemento</Text>}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function NutritionScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [waterMl, setWaterMl] = useState(0);
  const [waterGoal, setWaterGoal] = useState(DEFAULT_WATER_GOAL);
  const [supplements, setSupplements] = useState<ApiSupplement[]>([]);
  const [meals, setMeals] = useState<ApiMeal[]>([]);
  const [expandedMeal, setExpandedMeal] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddMeal, setShowAddMeal] = useState(false);
  const [showAddSupplement, setShowAddSupplement] = useState(false);

  const todayStr = new Date().toISOString().slice(0, 10);

  const loadAll = useCallback(async () => {
    const [day, sups] = await Promise.allSettled([
      api.get(`/nutrition/day?date=${todayStr}`),
      api.get(`/nutrition/supplements?date=${todayStr}`),
    ]);
    if (day.status === 'fulfilled') {
      const data = day.value.data;
      setMeals(Array.isArray(data?.meals) ? data.meals : []);
      if (data?.water) {
        setWaterMl(data.water.amount ?? 0);
        setWaterGoal(data.water.goal ?? DEFAULT_WATER_GOAL);
      }
    }
    if (sups.status === 'fulfilled') {
      setSupplements(Array.isArray(sups.value.data) ? sups.value.data : []);
    }
  }, [todayStr]);

  useEffect(() => {
    setLoading(true);
    loadAll().finally(() => setLoading(false));
  }, [loadAll]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadAll().finally(() => setRefreshing(false));
  }, [loadAll]);

  const shadow = Platform.OS === 'web'
    ? { boxShadow: isDark ? '0 4px 20px rgba(0,0,0,0.25)' : '0 2px 16px rgba(0,0,0,0.06)' } as any
    : {};

  const totalCalories = meals.reduce((s, m) => s + (m.calories || 0), 0);
  const totalProtein = meals.reduce((s, m) => s + (m.protein || 0), 0);
  const totalCarbs = meals.reduce((s, m) => s + (m.carbs || 0), 0);
  const totalFat = meals.reduce((s, m) => s + (m.fat || 0), 0);
  const waterPct = Math.round((waterMl / waterGoal) * 100);
  const supplementsDone = supplements.filter((s) => s.taken).length;

  const addWater = (ml: number) => {
    const newAmount = Math.min(waterGoal + 500, waterMl + ml);
    setWaterMl(newAmount);
    api.post('/nutrition/water', { date: todayStr, amount: newAmount, goal: waterGoal }).catch(() => {});
  };

  const toggleSupplement = (id: string) => {
    // Otimista + persistência real
    setSupplements((prev) => prev.map((s) => (s.id === id ? { ...s, taken: !s.taken } : s)));
    api.post(`/nutrition/supplements/${id}/toggle`, { date: todayStr }).catch(() => {
      setSupplements((prev) => prev.map((s) => (s.id === id ? { ...s, taken: !s.taken } : s)));
    });
  };

  const removeSupplement = (sup: ApiSupplement) => {
    const doDelete = () => {
      api.delete(`/nutrition/supplements/${sup.id}`).then(() => loadAll()).catch(() => {});
    };
    if (Platform.OS === 'web') {
      // Alert com botões não renderiza no react-native-web
      // eslint-disable-next-line no-alert
      if (typeof window !== 'undefined' && window.confirm(`Remover "${sup.name}"?`)) doDelete();
    } else {
      Alert.alert('Remover suplemento', `Remover "${sup.name}" da sua lista?`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Remover', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const removeMeal = (meal: ApiMeal) => {
    const doDelete = () => {
      api.delete(`/nutrition/meal/${meal.id}`).then(() => loadAll()).catch(() => {});
    };
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (typeof window !== 'undefined' && window.confirm(`Remover "${meal.mealName}"?`)) doDelete();
    } else {
      Alert.alert('Remover refeição', `Remover "${meal.mealName}"?`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Remover', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AddMealModal visible={showAddMeal} onClose={() => setShowAddMeal(false)} onSaved={loadAll} dateStr={todayStr} />
      <AddSupplementModal visible={showAddSupplement} onClose={() => setShowAddSupplement(false)} onSaved={loadAll} />

      {/* ─── Header ─── */}
      <View style={{
        paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 14,
        borderBottomWidth: 0.5, borderBottomColor: colors.text + '08',
        ...(Platform.OS === 'web' ? { position: 'sticky' as any, top: 0, zIndex: 10, backgroundColor: colors.background + 'F4', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' } as any : {}),
      }}>
        <Text style={{ fontSize: 22, fontWeight: '800', letterSpacing: -0.5, color: colors.text }}>
          Nutrição & Saúde
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {loading ? (
          <ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} size="large" />
        ) : (
          <>
            {/* ─── CALORIE OVERVIEW ─── */}
            <View style={{ borderRadius: 24, overflow: 'hidden', marginBottom: 20, ...shadow }}>
              <LinearGradient
                colors={isDark ? ['#0d1117', '#111827'] : ['#F0FDF4', '#ECFDF5']}
                style={{ padding: 24 }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#10B981', letterSpacing: 1, textTransform: 'uppercase' as any, marginBottom: 16 }}>
                  Resumo Calórico — Hoje
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 24 }}>
                  <MacroRing calories={totalCalories} goalCalories={MACRO_GOALS.calories} colors={colors} />
                  <View style={{ flex: 1, gap: 12 }}>
                    {[
                      { label: 'Proteína', value: `${totalProtein}g`, goal: `${MACRO_GOALS.protein}g`, color: '#3B82F6', pct: Math.round((totalProtein / MACRO_GOALS.protein) * 100) },
                      { label: 'Carboidrato', value: `${totalCarbs}g`, goal: `${MACRO_GOALS.carbs}g`, color: '#F59E0B', pct: Math.round((totalCarbs / MACRO_GOALS.carbs) * 100) },
                      { label: 'Gordura', value: `${totalFat}g`, goal: `${MACRO_GOALS.fat}g`, color: '#8B5CF6', pct: Math.round((totalFat / MACRO_GOALS.fat) * 100) },
                    ].map((m) => (
                      <View key={m.label}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text style={{ fontSize: 11, color: colors.textSecondary, fontWeight: '600' }}>{m.label}</Text>
                          <Text style={{ fontSize: 11, color: m.color, fontWeight: '700' }}>{m.value} / {m.goal}</Text>
                        </View>
                        <View style={{ height: 5, borderRadius: 3, backgroundColor: colors.text + '0A', overflow: 'hidden' }}>
                          <View style={{ height: '100%', width: `${Math.min(100, m.pct)}%` as any, borderRadius: 3, backgroundColor: m.color }} />
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              </LinearGradient>
            </View>

            {/* ─── WATER TRACKER ─── */}
            <View style={{ borderRadius: 22, backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.text + '07', padding: 20, marginBottom: 20, ...shadow }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: '#3B82F6' + '12', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="water-outline" size={20} color="#3B82F6" />
                  </View>
                  <View>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>Hidratação</Text>
                    <Text style={{ fontSize: 11, color: colors.textTertiary }}>Meta: {(waterGoal / 1000).toFixed(1)}L/dia</Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 22, fontWeight: '800', color: '#3B82F6', letterSpacing: -0.5 }}>
                    {(waterMl / 1000).toFixed(2)}L
                  </Text>
                  <Text style={{ fontSize: 11, color: waterPct >= 100 ? '#10B981' : colors.textTertiary, fontWeight: '600' }}>
                    {waterPct >= 100 ? '✅ Meta atingida!' : `${waterPct}% da meta`}
                  </Text>
                </View>
              </View>

              {/* Water cups visualization */}
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
                {Array.from({ length: 10 }).map((_, i) => {
                  const cupMl = waterGoal / 10;
                  const filled = waterMl >= cupMl * (i + 1);
                  const partial = !filled && waterMl > cupMl * i;
                  return (
                    <View key={i} style={{ flex: 1, minWidth: 30, height: 36, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.text + '08', borderWidth: 1, borderColor: filled ? '#3B82F6' + '40' : colors.text + '08' }}>
                      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: filled ? '100%' : partial ? '50%' : '0%', backgroundColor: '#3B82F6' + (filled ? 'CC' : '60'), borderRadius: 7 }} />
                    </View>
                  );
                })}
              </View>

              {/* Progress bar */}
              <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.text + '0A', overflow: 'hidden', marginBottom: 16 }}>
                <LinearGradient colors={['#60A5FA', '#3B82F6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: '100%', width: `${Math.min(100, waterPct)}%` as any, borderRadius: 3 }} />
              </View>

              {/* Quick add buttons */}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[
                  { ml: 150, label: '150ml' },
                  { ml: 250, label: '250ml' },
                  { ml: 350, label: '350ml' },
                  { ml: 500, label: '500ml' },
                ].map((btn) => (
                  <Pressable key={btn.ml} onPress={() => addWater(btn.ml)} style={({ pressed }) => ({ flex: 1, paddingVertical: 10, borderRadius: 11, backgroundColor: pressed ? '#3B82F6' : '#3B82F6' + '12', alignItems: 'center', borderWidth: 1, borderColor: '#3B82F6' + '25' })}>
                    <Ionicons name="water" size={14} color="#3B82F6" />
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#3B82F6', marginTop: 2 }}>{btn.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* ─── SUPPLEMENTS ─── */}
            <View style={{ marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ fontSize: 17, fontWeight: '700', letterSpacing: -0.4, color: colors.text }}>Suplementação</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {supplements.length > 0 && (
                    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: '#10B981' + '12' }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#10B981' }}>{supplementsDone}/{supplements.length} tomados</Text>
                    </View>
                  )}
                  <Pressable onPress={() => setShowAddSupplement(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 9, backgroundColor: colors.primary + '10' }}>
                    <Ionicons name="add" size={14} color={colors.primary} />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>Adicionar</Text>
                  </Pressable>
                </View>
              </View>

              {supplements.length === 0 ? (
                <View style={{ borderRadius: 18, padding: 20, backgroundColor: colors.text + '04', borderWidth: 1, borderColor: colors.text + '08', borderStyle: 'dashed', alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center' }}>
                    Cadastre seus suplementos para acompanhar a ingestão diária
                  </Text>
                </View>
              ) : (
                <View style={{ borderRadius: 18, backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.text + '07', overflow: 'hidden', ...shadow }}>
                  {supplements.map((sup, i) => {
                    const color = sup.color || '#3B82F6';
                    return (
                      <Pressable key={sup.id} onPress={() => toggleSupplement(sup.id)} onLongPress={() => removeSupplement(sup)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: i < supplements.length - 1 ? 0.5 : 0, borderBottomColor: colors.text + '07', opacity: sup.taken ? 1 : 0.65 }}>
                        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: color + '12', alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name={(sup.icon as any) || 'nutrition-outline'} size={20} color={color} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{sup.name}</Text>
                          <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 1 }}>
                            {[sup.dose, sup.timeOfDay].filter(Boolean).join(' · ') || 'Toque para marcar'}
                          </Text>
                        </View>
                        <Pressable onPress={() => removeSupplement(sup)} hitSlop={8} style={{ padding: 4 }}>
                          <Ionicons name="trash-outline" size={15} color={colors.textTertiary} />
                        </Pressable>
                        <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: sup.taken ? color : colors.text + '0A', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: sup.taken ? color : colors.text + '15' }}>
                          {sup.taken && <Ionicons name="checkmark" size={14} color="#FFF" />}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>

            {/* ─── MEALS ─── */}
            <View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ fontSize: 17, fontWeight: '700', letterSpacing: -0.4, color: colors.text }}>Refeições</Text>
                <Pressable onPress={() => setShowAddMeal(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 9, backgroundColor: colors.primary + '10' }}>
                  <Ionicons name="add" size={14} color={colors.primary} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>Adicionar</Text>
                </Pressable>
              </View>

              {meals.length === 0 ? (
                <Pressable onPress={() => setShowAddMeal(true)} style={{ borderRadius: 18, backgroundColor: colors.text + '03', borderWidth: 1, borderColor: colors.text + '08', borderStyle: 'dashed', padding: 20, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                  <Ionicons name="add-circle-outline" size={20} color={colors.textTertiary} />
                  <Text style={{ fontSize: 14, color: colors.textTertiary, fontWeight: '500' }}>Nenhuma refeição registrada hoje — adicionar</Text>
                </Pressable>
              ) : (
                <View style={{ gap: 10 }}>
                  {meals.map((meal) => (
                    <Pressable key={meal.id} onPress={() => setExpandedMeal(expandedMeal === meal.id ? null : meal.id)} onLongPress={() => removeMeal(meal)} style={{ borderRadius: 18, backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.text + '07', overflow: 'hidden', ...shadow }}>
                      <View style={{ padding: 16 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <Text style={{ fontSize: 24 }}>🍽️</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>{meal.mealName}</Text>
                            <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 1 }}>
                              {[meal.mealTime, `${(meal.items || []).length} alimentos`].filter(Boolean).join(' · ')}
                            </Text>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{meal.calories} kcal</Text>
                            <Text style={{ fontSize: 10, color: colors.textTertiary }}>P:{meal.protein}g C:{meal.carbs}g G:{meal.fat}g</Text>
                          </View>
                          <Ionicons name={expandedMeal === meal.id ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textTertiary} />
                        </View>
                      </View>
                      {expandedMeal === meal.id && (
                        <View style={{ paddingHorizontal: 16, paddingBottom: 14, borderTopWidth: 0.5, borderTopColor: colors.text + '08' }}>
                          <View style={{ gap: 6, marginTop: 12 }}>
                            {(meal.items || []).map((item) => (
                              <View key={item} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary }} />
                                <Text style={{ fontSize: 13, color: colors.textSecondary }}>{item}</Text>
                              </View>
                            ))}
                            <Pressable onPress={() => removeMeal(meal)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
                              <Ionicons name="trash-outline" size={14} color="#DC2626" />
                              <Text style={{ fontSize: 12, color: '#DC2626', fontWeight: '600' }}>Remover refeição</Text>
                            </Pressable>
                          </View>
                        </View>
                      )}
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
