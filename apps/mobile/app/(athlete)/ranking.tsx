import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, SafeAreaView, FlatList, Pressable,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme';
import { GlassCard, GlassBadge, GlassAvatar } from '../../src/components/ui';
import { useAuthStore } from '../../src/stores/auth.store';
import { api } from '../../src/services/api';

interface RankingEntry {
  position: number;
  userId: string;
  name: string;
  avatarUrl: string | null;
  value: number;
  unit: string;
}

type RankingType = 'km' | 'workouts' | 'streak';

const MEDAL_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'];
const MEDAL_ICONS: (keyof typeof Ionicons.glyphMap)[] = ['medal-outline', 'medal-outline', 'medal-outline'];

export default function RankingScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<RankingType>('km');
  const [rankings, setRankings] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<'all' | 'monthly'>('monthly');

  const RANKING_TABS: { key: RankingType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'km', label: 'Quilometros', icon: 'footsteps-outline' },
    { key: 'workouts', label: 'Treinos', icon: 'fitness-outline' },
    { key: 'streak', label: 'Sequencia', icon: 'flame-outline' },
  ];

  const TAB_COLORS: Record<RankingType, string> = {
    km: colors.primary,
    workouts: colors.success,
    streak: colors.warning,
  };

  const fetchRankings = useCallback(async () => {
    try {
      const params: any = { limit: 50 };
      if (activeTab === 'km') params.period = period;
      const res = await api.get(`/rankings/${activeTab}`, { params });
      setRankings(res.data || []);
    } catch {
      setRankings([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab, period]);

  useEffect(() => { setLoading(true); fetchRankings(); }, [fetchRankings]);

  const isCurrentUser = (userId: string) => user?.id === userId;
  const tabColor = TAB_COLORS[activeTab];

  const renderPodium = () => {
    const top3 = rankings.slice(0, 3);
    if (top3.length < 1) return null;

    const podiumOrder = top3.length >= 3 ? [top3[1], top3[0], top3[2]] : top3;

    return (
      <GlassCard style={{ marginHorizontal: 16, marginBottom: 16 }}>
        <View style={{
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'flex-end',
          paddingVertical: 8,
        }}>
          {podiumOrder.map((entry, i) => {
            if (!entry) return <View key={i} style={{ flex: 1 }} />;
            const actualPos = entry.position;
            const isFirst = actualPos === 1;
            const medalColor = MEDAL_COLORS[actualPos - 1];

            return (
              <View
                key={entry.userId}
                style={{
                  alignItems: 'center',
                  flex: 1,
                  paddingHorizontal: 4,
                  marginTop: isFirst ? -8 : 0,
                }}
              >
                <View style={{ position: 'relative', marginBottom: 6 }}>
                  <GlassAvatar
                    name={entry.name}
                    imageUrl={entry.avatarUrl || undefined}
                    size={isFirst ? 64 : 52}
                    showBorder
                  />
                  <View style={{
                    position: 'absolute',
                    bottom: -4,
                    alignSelf: 'center',
                    left: '50%',
                    marginLeft: -12,
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: medalColor,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#FFF' }}>
                      {actualPos}
                    </Text>
                  </View>
                </View>

                <Ionicons name="medal" size={20} color={medalColor} style={{ marginTop: 4 }} />

                <Text style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: colors.text,
                  textAlign: 'center',
                  marginTop: 2,
                }} numberOfLines={1}>
                  {entry.name.split(' ')[0]}
                </Text>

                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text, marginTop: 2 }}>
                  {entry.value}{' '}
                  <Text style={{ fontSize: 11, fontWeight: '400', color: colors.textTertiary }}>
                    {entry.unit}
                  </Text>
                </Text>

                {/* Podium bar */}
                <View style={{
                  width: '80%',
                  height: isFirst ? 80 : actualPos === 2 ? 60 : 40,
                  borderRadius: 8,
                  marginTop: 8,
                  backgroundColor: medalColor + '25',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  paddingBottom: 6,
                }}>
                  <Text style={{ fontWeight: '800', fontSize: 18, color: medalColor }}>
                    {actualPos}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </GlassCard>
    );
  };

  const renderItem = ({ item }: { item: RankingEntry }) => {
    if (item.position <= 3) return null;
    const isSelf = isCurrentUser(item.userId);

    return (
      <View style={{ marginHorizontal: 16, marginBottom: 6 }}>
        <GlassCard
          padding={12}
          style={isSelf ? { borderWidth: 1.5, borderColor: colors.primary } : undefined}
        >
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}>
            <View style={{ width: 32, alignItems: 'center' }}>
              <Text style={{
                fontSize: 15,
                fontWeight: isSelf ? '700' : '600',
                color: isSelf ? colors.primary : colors.textTertiary,
              }}>
                {item.position}
              </Text>
            </View>

            <GlassAvatar
              name={item.name}
              imageUrl={item.avatarUrl || undefined}
              size={40}
              showBorder={isSelf}
            />

            <View style={{ flex: 1 }}>
              <Text style={{
                fontSize: 14,
                fontWeight: isSelf ? '700' : '500',
                color: isSelf ? colors.primary : colors.text,
              }}>
                {item.name} {isSelf ? '(Voce)' : ''}
              </Text>
            </View>

            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{
                fontSize: 18,
                fontWeight: '700',
                color: isSelf ? colors.primary : colors.text,
              }}>
                {item.value}
              </Text>
              <Text style={{ fontSize: 11, color: colors.textTertiary }}>
                {item.unit}
              </Text>
            </View>
          </View>
        </GlassCard>
      </View>
    );
  };

  const renderEmpty = () => (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
      <GlassCard>
        <View style={{ alignItems: 'center', paddingVertical: 24 }}>
          <View style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: tabColor + '15',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
          }}>
            <Ionicons
              name={RANKING_TABS.find(t => t.key === activeTab)?.icon || 'trophy-outline'}
              size={40}
              color={tabColor}
            />
          </View>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 8 }}>
            Nenhum dado ainda
          </Text>
          <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center' }}>
            Complete treinos para aparecer no ranking!
          </Text>
        </View>
      </GlassCard>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text }}>
            Ranking
          </Text>
          <GlassBadge label="Competicao" variant="warning" icon={<Ionicons name="trophy-outline" size={12} color="#F59E0B" />} />
        </View>
        <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>
          Supere seus limites e conquiste o topo!
        </Text>
      </View>

      {/* Category Tabs */}
      <View style={{
        flexDirection: 'row',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 12,
      }}>
        {RANKING_TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          const tColor = TAB_COLORS[tab.key];
          return (
            <Pressable
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                paddingVertical: 10,
                borderRadius: 12,
                backgroundColor: isActive ? tColor + '18' : colors.glass,
                borderWidth: 1.5,
                borderColor: isActive ? tColor : colors.glassBorder,
              }}
            >
              <Ionicons name={tab.icon} size={18} color={isActive ? tColor : colors.textTertiary} />
              <Text style={{
                fontSize: 12,
                fontWeight: '600',
                color: isActive ? tColor : colors.textTertiary,
              }}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Period filter for km */}
      {activeTab === 'km' && (
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 }}>
          {(['monthly', 'all'] as const).map((p) => (
            <Pressable
              key={p}
              onPress={() => setPeriod(p)}
              style={{
                paddingVertical: 6,
                paddingHorizontal: 14,
                borderRadius: 20,
                backgroundColor: period === p ? colors.primary : colors.glass,
                borderWidth: 1,
                borderColor: period === p ? colors.primary : colors.glassBorder,
              }}
            >
              <Text style={{
                fontSize: 13,
                fontWeight: '500',
                color: period === p ? colors.textOnPrimary : colors.textSecondary,
              }}>
                {p === 'monthly' ? 'Este Mes' : 'Geral'}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={tabColor} />
          <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 12 }}>
            Carregando ranking...
          </Text>
        </View>
      ) : rankings.length === 0 ? (
        renderEmpty()
      ) : (
        <FlatList
          data={rankings}
          renderItem={renderItem}
          keyExtractor={(item) => item.userId}
          contentContainerStyle={{ paddingBottom: 100 }}
          ListHeaderComponent={renderPodium}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchRankings(); }}
              tintColor={tabColor}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}
