import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme';
import { api } from '../../src/services/api';

type NutritionTab = 'hoje' | 'integracoes';

// ─── Mock data ────────────────────────────────────────────────────────────────
const WATER_GOAL = 3000; // ml
const MEALS = [
  {
    id: 'm1', name: 'Café da manhã', time: '06:30', icon: '🌅',
    calories: 420, protein: 28, carbs: 45, fat: 12,
    items: ['Ovos mexidos (2)', 'Pão integral (2 fatias)', 'Banana', 'Café com leite'],
  },
  {
    id: 'm2', name: 'Lanche pré-treino', time: '09:00', icon: '⚡',
    calories: 180, protein: 8, carbs: 32, fat: 3,
    items: ['Batata-doce (100g)', 'Whey protein (1 scoop)'],
  },
  {
    id: 'm3', name: 'Almoço', time: '12:30', icon: '☀️',
    calories: 650, protein: 45, carbs: 68, fat: 18,
    items: ['Frango grelhado (150g)', 'Arroz integral (120g)', 'Brócolis', 'Azeite'],
  },
];

const SUPPLEMENTS = [
  { id: 's1', name: 'Whey Protein', dose: '30g', time: 'Pós-treino', taken: true, color: '#3B82F6', icon: 'flask-outline' as const },
  { id: 's2', name: 'Creatina', dose: '5g', time: 'Qualquer hora', taken: true, color: '#8B5CF6', icon: 'nutrition-outline' as const },
  { id: 's3', name: 'Vitamina D3', dose: '2.000 UI', time: 'Com refeição', taken: false, color: '#F59E0B', icon: 'sunny-outline' as const },
  { id: 's4', name: 'Ômega 3', dose: '2 cápsulas', time: 'Com refeição', taken: false, color: '#10B981', icon: 'water-outline' as const },
  { id: 's5', name: 'Cafeína', dose: '200mg', time: 'Pré-treino', taken: true, color: '#EF4444', icon: 'flash-outline' as const },
];

const DIET_INTEGRATIONS = [
  {
    id: 'mfp', name: 'MyFitnessPal', desc: 'O mais popular do mundo — log de refeições, macro tracking, código de barras', color: '#0066CC', icon: '🥗', connected: false,
  },
  {
    id: 'cronometer', name: 'Cronometer', desc: 'Tracking detalhado de micronutrientes — vitaminas, minerais, aminoácidos', color: '#FF6600', icon: '🔬', connected: false,
  },
  {
    id: 'yazio', name: 'Yazio', desc: 'App de dieta e jejum intermitente com planos personalizados', color: '#4CAF50', icon: '🥦', connected: false,
  },
  {
    id: 'lose_it', name: 'Lose It!', desc: 'Contagem de calorias e metas de peso', color: '#FF4081', icon: '⚖️', connected: false,
  },
  {
    id: 'apple_health', name: 'Apple Health', desc: 'Sincroniza dados nutricionais automaticamente no iOS', color: '#FF2D55', icon: '❤️', connected: true,
  },
];

// ─── Ring Chart ───────────────────────────────────────────────────────────────
function MacroRing({
  calories, goalCalories, protein, carbs, fat, colors,
}: {
  calories: number; goalCalories: number; protein: number; carbs: number; fat: number; colors: any;
}) {
  const pct = Math.min(100, Math.round((calories / goalCalories) * 100));
  const remaining = goalCalories - calories;
  return (
    <View style={{ alignItems: 'center' }}>
      {/* Simple circular progress via nested Views */}
      <View style={{ width: 140, height: 140, alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        {/* Background ring */}
        <View style={{
          width: 140, height: 140, borderRadius: 70,
          borderWidth: 12, borderColor: colors.text + '0A',
          position: 'absolute',
        }} />
        {/* Progress overlay — simplified visual */}
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

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function NutritionScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<NutritionTab>('hoje');
  const [waterMl, setWaterMl] = useState(0);
  const [waterGoal, setWaterGoal] = useState(WATER_GOAL);
  const [supplements, setSupplements] = useState(SUPPLEMENTS);
  const [expandedMeal, setExpandedMeal] = useState<string | null>(null);
  const [apiMeals, setApiMeals] = useState<any[]>([]);

  const todayStr = new Date().toISOString().slice(0, 10);

  const loadDaySummary = useCallback(() => {
    api.get(`/nutrition/day?date=${todayStr}`).then(({ data }) => {
      if (data?.meals?.length > 0) setApiMeals(data.meals);
      if (data?.water) {
        setWaterMl(data.water.amount);
        setWaterGoal(data.water.goal);
      }
    }).catch(() => {});
  }, [todayStr]);

  useEffect(() => {
    loadDaySummary();
  }, [loadDaySummary]);

  const shadow = Platform.OS === 'web'
    ? { boxShadow: isDark ? '0 4px 20px rgba(0,0,0,0.25)' : '0 2px 16px rgba(0,0,0,0.06)' } as any
    : {};

  const displayMeals = apiMeals.length > 0 ? apiMeals : MEALS;
  const totalCalories = displayMeals.reduce((s: number, m: any) => s + (m.calories || 0), 0);
  const totalProtein = displayMeals.reduce((s: number, m: any) => s + (m.protein || 0), 0);
  const totalCarbs = displayMeals.reduce((s: number, m: any) => s + (m.carbs || 0), 0);
  const totalFat = displayMeals.reduce((s: number, m: any) => s + (m.fat || 0), 0);
  const waterPct = Math.round((waterMl / waterGoal) * 100);
  const supplementsDone = supplements.filter((s) => s.taken).length;

  const addWater = (ml: number) => {
    const newAmount = Math.min(waterGoal + 500, waterMl + ml);
    setWaterMl(newAmount);
    api.post('/nutrition/water', { date: todayStr, amount: newAmount, goal: waterGoal }).catch(() => {});
  };

  const toggleSupplement = (id: string) => {
    setSupplements((prev) => prev.map((s) => s.id === id ? { ...s, taken: !s.taken } : s));
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* ─── Header ─── */}
      <View style={{
        paddingTop: insets.top + 12, paddingHorizontal: 20,
        borderBottomWidth: 0.5, borderBottomColor: colors.text + '08',
        ...(Platform.OS === 'web' ? { position: 'sticky' as any, top: 0, zIndex: 10, backgroundColor: colors.background + 'F4', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' } as any : {}),
      }}>
        <Text style={{ fontSize: 22, fontWeight: '800', letterSpacing: -0.5, color: colors.text, marginBottom: 14 }}>
          Nutrição & Saúde
        </Text>
        <View style={{ flexDirection: 'row' }}>
          {([
            { key: 'hoje' as NutritionTab, label: 'Hoje', icon: 'today-outline' as const },
            { key: 'integracoes' as NutritionTab, label: 'Integrações', icon: 'apps-outline' as const },
          ]).map((tab) => (
            <Pressable key={tab.key} onPress={() => setActiveTab(tab.key)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderBottomWidth: 2.5, borderBottomColor: activeTab === tab.key ? colors.primary : 'transparent' }}>
              <Ionicons name={tab.icon} size={16} color={activeTab === tab.key ? colors.primary : colors.textTertiary} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: activeTab === tab.key ? colors.primary : colors.textTertiary }}>{tab.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 100 }}>
        {activeTab === 'hoje' ? (
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
                  <MacroRing
                    calories={totalCalories} goalCalories={2400}
                    protein={totalProtein} carbs={totalCarbs} fat={totalFat}
                    colors={colors}
                  />
                  <View style={{ flex: 1, gap: 12 }}>
                    {[
                      { label: 'Proteína', value: `${totalProtein}g`, goal: '180g', color: '#3B82F6', pct: Math.round((totalProtein / 180) * 100) },
                      { label: 'Carboidrato', value: `${totalCarbs}g`, goal: '280g', color: '#F59E0B', pct: Math.round((totalCarbs / 280) * 100) },
                      { label: 'Gordura', value: `${totalFat}g`, goal: '75g', color: '#8B5CF6', pct: Math.round((totalFat / 75) * 100) },
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
                  { ml: 150, label: '150ml', icon: 'water' as const },
                  { ml: 250, label: '250ml', icon: 'water' as const },
                  { ml: 350, label: '350ml', icon: 'water' as const },
                  { ml: 500, label: '500ml', icon: 'water' as const },
                ].map((btn) => (
                  <Pressable key={btn.ml} onPress={() => addWater(btn.ml)} style={({ pressed }) => ({ flex: 1, paddingVertical: 10, borderRadius: 11, backgroundColor: pressed ? '#3B82F6' : '#3B82F6' + '12', alignItems: 'center', borderWidth: 1, borderColor: '#3B82F6' + '25' })}>
                    <Ionicons name={btn.icon} size={14} color="#3B82F6" />
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#3B82F6', marginTop: 2 }}>{btn.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* ─── SUPPLEMENTS ─── */}
            <View style={{ marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ fontSize: 17, fontWeight: '700', letterSpacing: -0.4, color: colors.text }}>Suplementação</Text>
                <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: '#10B981' + '12' }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#10B981' }}>{supplementsDone}/{supplements.length} tomados</Text>
                </View>
              </View>
              <View style={{ borderRadius: 18, backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.text + '07', overflow: 'hidden', ...shadow }}>
                {supplements.map((sup, i) => (
                  <Pressable key={sup.id} onPress={() => toggleSupplement(sup.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: i < supplements.length - 1 ? 0.5 : 0, borderBottomColor: colors.text + '07', opacity: sup.taken ? 1 : 0.65 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: sup.color + '12', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name={sup.icon} size={20} color={sup.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{sup.name}</Text>
                      <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 1 }}>{sup.dose} · {sup.time}</Text>
                    </View>
                    <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: sup.taken ? sup.color : colors.text + '0A', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: sup.taken ? sup.color : colors.text + '15' }}>
                      {sup.taken && <Ionicons name="checkmark" size={14} color="#FFF" />}
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* ─── MEALS ─── */}
            <View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ fontSize: 17, fontWeight: '700', letterSpacing: -0.4, color: colors.text }}>Refeições</Text>
                <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 9, backgroundColor: colors.primary + '10' }}>
                  <Ionicons name="add" size={14} color={colors.primary} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>Adicionar</Text>
                </Pressable>
              </View>
              <View style={{ gap: 10 }}>
                {displayMeals.map((meal: any) => (
                  <Pressable key={meal.id} onPress={() => setExpandedMeal(expandedMeal === meal.id ? null : meal.id)} style={{ borderRadius: 18, backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.text + '07', overflow: 'hidden', ...shadow }}>
                    <View style={{ padding: 16 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Text style={{ fontSize: 24 }}>{meal.icon || '🍽️'}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>{meal.mealName || meal.name}</Text>
                          <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 1 }}>{meal.mealTime || meal.time} · {(meal.items || []).length} alimentos</Text>
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
                          {(meal.items || []).map((item: string) => (
                            <View key={item} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary }} />
                              <Text style={{ fontSize: 13, color: colors.textSecondary }}>{item}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}
                  </Pressable>
                ))}

                {/* Add dinner */}
                <Pressable style={{ borderRadius: 18, backgroundColor: colors.text + '03', borderWidth: 1, borderColor: colors.text + '08', borderStyle: 'dashed', padding: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                  <Ionicons name="add-circle-outline" size={20} color={colors.textTertiary} />
                  <Text style={{ fontSize: 14, color: colors.textTertiary, fontWeight: '500' }}>Adicionar jantar ou lanche</Text>
                </Pressable>
              </View>
            </View>
          </>
        ) : (
          <>
            {/* ─── INTEGRATIONS ─── */}
            <View style={{ borderRadius: 18, overflow: 'hidden', marginBottom: 24, ...shadow }}>
              <LinearGradient colors={isDark ? ['#0d1117', '#111827'] : ['#F0FDF4', '#F7FEF9']} style={{ padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: '#10B981' + '15', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="apps-outline" size={24} color="#10B981" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>Apps de Dieta</Text>
                  <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>Sincronize sua alimentação com os melhores apps do mercado.</Text>
                </View>
              </LinearGradient>
            </View>

            <View style={{ gap: 12 }}>
              {DIET_INTEGRATIONS.map((app) => (
                <View key={app.id} style={{ borderRadius: 20, backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.text + '08', overflow: 'hidden', ...shadow }}>
                  {app.connected && <View style={{ height: 3, backgroundColor: '#10B981' }} />}
                  <View style={{ padding: 18 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
                      <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: app.color + '12', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 26 }}>{app.icon}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{app.name}</Text>
                          {app.connected && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: '#10B981' + '15' }}>
                              <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: '#10B981' }} />
                              <Text style={{ fontSize: 10, fontWeight: '700', color: '#10B981' }}>Conectado</Text>
                            </View>
                          )}
                        </View>
                        <Text style={{ fontSize: 12, color: colors.textSecondary, lineHeight: 18 }}>{app.desc}</Text>
                      </View>
                    </View>

                    <View style={{ marginTop: 16 }}>
                      {app.connected ? (
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                          <Pressable style={{ flex: 1, paddingVertical: 11, borderRadius: 12, backgroundColor: '#10B981' + '12', alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: '#10B981' + '25' }}>
                            <Ionicons name="sync-outline" size={15} color="#10B981" />
                            <Text style={{ fontSize: 13, fontWeight: '700', color: '#10B981' }}>Sincronizar agora</Text>
                          </Pressable>
                          <Pressable style={{ paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12, backgroundColor: colors.text + '07', borderWidth: 1, borderColor: colors.text + '10' }}>
                            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textSecondary }}>Desconectar</Text>
                          </Pressable>
                        </View>
                      ) : (
                        <Pressable
                          onPress={() => Alert.alert(app.name, `Conectar com ${app.name} vai sincronizar suas refeições e macros automaticamente com o RR.`)}
                          style={{ paddingVertical: 12, borderRadius: 12, backgroundColor: app.color, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                        >
                          <Ionicons name="link-outline" size={16} color="#FFF" />
                          <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFF' }}>Conectar {app.name}</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                </View>
              ))}
            </View>

            {/* Why sync */}
            <View style={{ borderRadius: 18, padding: 18, backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.text + '07', marginTop: 8, ...shadow }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <Ionicons name="bulb-outline" size={20} color='#F59E0B' />
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>Por que sincronizar a dieta?</Text>
              </View>
              {[
                { icon: 'trending-up-outline' as const, color: '#10B981', text: 'Coach vê correlação entre nutrição e performance nos treinos' },
                { icon: 'flash-outline' as const, color: '#F59E0B', text: 'Ajuste de intensidade baseado na ingestão calórica do dia' },
                { icon: 'heart-outline' as const, color: '#EF4444', text: 'Alertas de hidratação e recuperação personalizados' },
                { icon: 'ribbon-outline' as const, color: '#8B5CF6', text: 'Planos de corrida mais precisos com dados nutricionais' },
              ].map((item, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 10, paddingVertical: 9, borderTopWidth: i > 0 ? 0.5 : 0, borderTopColor: colors.text + '08' }}>
                  <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: item.color + '12', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Ionicons name={item.icon} size={15} color={item.color} />
                  </View>
                  <Text style={{ fontSize: 13, color: colors.textSecondary, flex: 1, lineHeight: 19 }}>{item.text}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
