import React from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList, TouchableOpacity, RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../src/theme';
import { spacing, typography, borderRadius } from '../../src/theme';
import { GlassCard, GlassBadge, GlassAvatar } from '../../src/components/ui';
import { api } from '../../src/services/api';
import { formatRelativeTime } from '../../src/utils/date';
import { ptBR } from '../../src/i18n/pt-BR';

export default function CoachChatListScreen() {
  const { colors, isDark } = useTheme();

  const { data: conversations, isLoading, refetch } = useQuery({
    queryKey: ['coachConversations'],
    queryFn: async () => {
      const { data } = await api.get('/conversations');
      return data;
    },
  });

  const renderItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      onPress={() => router.push(`/(coach)/chat/${item.id}`)}
      activeOpacity={0.8}
      style={styles.itemWrapper}
    >
      <GlassCard intensity="subtle" shadow="sm" padding={0}>
        <View style={styles.item}>
          <GlassAvatar
            name={item.otherUser?.name || '?'}
            size={48}
            style={styles.avatarStyle}
          />
          <View style={styles.itemContent}>
            <View style={styles.itemHeader}>
              <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                {item.otherUser?.name || 'Atleta'}
              </Text>
              {item.lastMessage && (
                <Text style={[styles.time, { color: colors.textSecondary }]}>
                  {formatRelativeTime(item.lastMessage.createdAt)}
                </Text>
              )}
            </View>
            <Text style={[styles.lastMessage, { color: colors.textSecondary }]} numberOfLines={1}>
              {item.lastMessage?.content || ptBR.chat.noMessages}
            </Text>
          </View>
          {item.unreadCount > 0 && (
            <GlassBadge
              label={String(item.unreadCount)}
              variant="primary"
              size="sm"
            />
          )}
        </View>
      </GlassCard>
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {conversations?.length > 0 ? (
        <FlatList
          data={conversations}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={refetch} tintColor={colors.primary} />
          }
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <View style={styles.emptyOuter}>
          <GlassCard intensity="subtle" shadow="none" style={styles.emptyCard}>
            <View style={styles.emptyState}>
              <Ionicons name="chatbubbles-outline" size={64} color={colors.textTertiary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                {ptBR.chat.noConversations}
              </Text>
            </View>
          </GlassCard>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: spacing.base, paddingBottom: spacing['3xl'] },
  itemWrapper: {},
  item: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
  },
  avatarStyle: { marginRight: spacing.md },
  itemContent: { flex: 1, marginRight: spacing.sm },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  name: { ...typography.bodyMedium, flex: 1 },
  time: { ...typography.caption },
  lastMessage: { ...typography.bodySm },
  emptyOuter: { flex: 1, justifyContent: 'center', padding: spacing.base },
  emptyCard: {},
  emptyState: { alignItems: 'center', paddingVertical: spacing['3xl'] },
  emptyText: { ...typography.body, marginTop: spacing.base, textAlign: 'center' },
});
