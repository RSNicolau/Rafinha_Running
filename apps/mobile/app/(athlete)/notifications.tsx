import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, SafeAreaView, FlatList, Pressable,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme';
import { GlassCard, GlassButton, GlassBadge } from '../../src/components/ui';
import { api } from '../../src/services/api';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: any;
  readAt: string | null;
  createdAt: string;
}

type FilterType = 'all' | 'workouts' | 'messages' | 'payments';

const FILTER_TABS: { key: FilterType; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'workouts', label: 'Treinos' },
  { key: 'messages', label: 'Mensagens' },
  { key: 'payments', label: 'Pagamentos' },
];

const WORKOUT_TYPES = ['WORKOUT_REMINDER', 'WORKOUT_COMPLETED', 'PLAN_ASSIGNED', 'COACH_FEEDBACK'];
const MESSAGE_TYPES = ['NEW_MESSAGE'];
const PAYMENT_TYPES = ['PAYMENT_SUCCESS', 'PAYMENT_FAILED', 'SUBSCRIPTION_EXPIRING'];

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');

  const NOTIFICATION_CONFIG: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
    WORKOUT_REMINDER: { icon: 'alarm-outline', color: colors.warning },
    WORKOUT_COMPLETED: { icon: 'checkmark-circle-outline', color: colors.success },
    NEW_MESSAGE: { icon: 'chatbubble-outline', color: colors.info },
    PLAN_ASSIGNED: { icon: 'clipboard-outline', color: colors.primary },
    PAYMENT_SUCCESS: { icon: 'card-outline', color: colors.success },
    PAYMENT_FAILED: { icon: 'alert-circle-outline', color: colors.error },
    SUBSCRIPTION_EXPIRING: { icon: 'time-outline', color: colors.warning },
    COACH_FEEDBACK: { icon: 'megaphone-outline', color: colors.primary },
  };

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data.notifications || res.data || []);
      setUnreadCount(res.data.unreadCount || 0);
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const handleMarkAsRead = async (id: string) => {
    try {
      await api.post(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // silent
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.post('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
      setUnreadCount(0);
    } catch {
      // silent
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Agora';
    if (diffMin < 60) return `${diffMin}min`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  };

  const getConfig = (type: string) => {
    return NOTIFICATION_CONFIG[type] || {
      icon: 'notifications-outline' as keyof typeof Ionicons.glyphMap,
      color: colors.textSecondary,
    };
  };

  const filteredNotifications = notifications.filter((n) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'workouts') return WORKOUT_TYPES.includes(n.type);
    if (activeFilter === 'messages') return MESSAGE_TYPES.includes(n.type);
    if (activeFilter === 'payments') return PAYMENT_TYPES.includes(n.type);
    return true;
  });

  const renderNotification = ({ item }: { item: Notification }) => {
    const config = getConfig(item.type);
    const isUnread = !item.readAt;

    return (
      <Pressable
        onPress={() => { if (isUnread) handleMarkAsRead(item.id); }}
        style={{ marginHorizontal: 16, marginBottom: 8 }}
      >
        <GlassCard padding={14}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
            {/* Unread dot */}
            {isUnread && (
              <View style={{
                position: 'absolute',
                left: -4,
                top: '50%',
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: colors.primary,
                zIndex: 1,
              }} />
            )}

            {/* Type icon circle */}
            <View style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              backgroundColor: config.color + '18',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Ionicons name={config.icon} size={22} color={config.color} />
            </View>

            {/* Content */}
            <View style={{ flex: 1 }}>
              <View style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <Text style={{
                  fontSize: 14,
                  fontWeight: isUnread ? '700' : '500',
                  color: colors.text,
                  flex: 1,
                  marginRight: 8,
                }} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={{ fontSize: 12, color: colors.textTertiary }}>
                  {formatTime(item.createdAt)}
                </Text>
              </View>
              <Text style={{
                fontSize: 13,
                color: colors.textSecondary,
                marginTop: 2,
                lineHeight: 18,
              }} numberOfLines={2}>
                {item.body}
              </Text>
            </View>
          </View>
        </GlassCard>
      </Pressable>
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
            backgroundColor: colors.glass,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
          }}>
            <Ionicons name="notifications-off-outline" size={40} color={colors.textTertiary} />
          </View>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 8 }}>
            Nenhuma notificacao
          </Text>
          <Text style={{
            fontSize: 14,
            color: colors.textSecondary,
            textAlign: 'center',
            lineHeight: 22,
          }}>
            Voce recebera alertas sobre treinos, mensagens do treinador e atualizacoes importantes aqui.
          </Text>
        </View>
      </GlassCard>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
      }}>
        <Pressable
          onPress={() => router.back()}
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: colors.glass,
            borderWidth: 1,
            borderColor: colors.glassBorder,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>
            Notificacoes
          </Text>
          {unreadCount > 0 && (
            <GlassBadge label={String(unreadCount)} variant="primary" size="sm" />
          )}
        </View>

        {unreadCount > 0 ? (
          <Pressable
            onPress={handleMarkAllRead}
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              backgroundColor: colors.glass,
              borderWidth: 1,
              borderColor: colors.glassBorder,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="checkmark-done-outline" size={22} color={colors.primary} />
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {/* Filter Tabs */}
      <View style={{
        flexDirection: 'row',
        gap: 8,
        paddingHorizontal: 16,
        paddingBottom: 12,
      }}>
        {FILTER_TABS.map((tab) => {
          const isActive = activeFilter === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setActiveFilter(tab.key)}
              style={{
                paddingVertical: 6,
                paddingHorizontal: 14,
                borderRadius: 20,
                backgroundColor: isActive ? colors.primary : colors.glass,
                borderWidth: 1,
                borderColor: isActive ? colors.primary : colors.glassBorder,
              }}
            >
              <Text style={{
                fontSize: 13,
                fontWeight: '500',
                color: isActive ? colors.textOnPrimary : colors.textSecondary,
              }}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={filteredNotifications}
        renderItem={renderNotification}
        keyExtractor={(item) => item.id}
        contentContainerStyle={filteredNotifications.length === 0
          ? { flex: 1 }
          : { paddingTop: 4, paddingBottom: 100 }
        }
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchNotifications(); }}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}
