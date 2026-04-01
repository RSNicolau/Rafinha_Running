import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, FlatList, TextInput, Pressable,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../src/theme';
import { api } from '../../../src/services/api';
import { socketService } from '../../../src/services/socket.service';
import { useAuthStore } from '../../../src/stores/auth.store';
import { formatRelativeTime } from '../../../src/utils/date';
import { ptBR } from '../../../src/i18n/pt-BR';

export default function ChatConversationScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const flatListRef = useRef<FlatList>(null);
  const userId = useAuthStore((s) => s.user?.id);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const { data } = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: async () => {
      const { data } = await api.get(`/conversations/${conversationId}/messages`);
      return data;
    },
  });

  useEffect(() => {
    if (data?.data) setMessages(data.data);
  }, [data]);

  useEffect(() => {
    socketService.connect().then(() => {
      socketService.joinConversation(conversationId);
      const socket = socketService.getSocket();
      socket?.on('message:received', (msg: any) => {
        setMessages((prev) => [...prev, msg]);
      });
    });

    return () => {
      socketService.disconnect();
    };
  }, [conversationId]);

  const sendMessage = () => {
    if (!message.trim()) return;
    socketService.sendMessage(conversationId, message.trim());
    setMessage('');
  };

  const renderMessage = ({ item }: { item: any }) => {
    const isMine = item.senderId === userId;
    return (
      <View style={{
        maxWidth: '78%',
        padding: 12,
        paddingHorizontal: 16,
        borderRadius: 20,
        marginBottom: 8,
        alignSelf: isMine ? 'flex-end' : 'flex-start',
        backgroundColor: isMine ? colors.primary : colors.glass,
        borderBottomRightRadius: isMine ? 4 : 20,
        borderBottomLeftRadius: isMine ? 20 : 4,
        borderWidth: isMine ? 0 : 0.5,
        borderColor: colors.glassBorder,
      }}>
        <Text style={{
          color: isMine ? '#FFFFFF' : colors.text,
          fontSize: 15,
          lineHeight: 21,
        }}>
          {item.content}
        </Text>
        <Text style={{
          fontSize: 11,
          color: isMine ? 'rgba(255,255,255,0.6)' : colors.textTertiary,
          marginTop: 4,
          alignSelf: 'flex-end',
        }}>
          {formatRelativeTime(item.createdAt)}
        </Text>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{
        paddingTop: insets.top + 8,
        paddingHorizontal: 20,
        paddingBottom: 12,
        borderBottomWidth: 0.5,
        borderBottomColor: colors.glassBorder,
        backgroundColor: colors.glass,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable
            onPress={() => router.back()}
            style={{
              width: 36, height: 36, borderRadius: 12,
              backgroundColor: colors.primaryGhost,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Ionicons name="chevron-back" size={18} color={colors.primary} />
          </Pressable>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', letterSpacing: -0.2 }}>
            {ptBR.tabs.chat}
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
          showsVerticalScrollIndicator={false}
        />

        {/* Input Bar */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          paddingHorizontal: 16,
          paddingTop: 10,
          paddingBottom: Math.max(insets.bottom, 10),
          backgroundColor: colors.glass,
          borderTopWidth: 0.5,
          borderTopColor: colors.glassBorder,
          gap: 10,
        }}>
          <View style={{
            flex: 1,
            backgroundColor: colors.glassOverlay,
            borderRadius: 22,
            borderWidth: 0.5,
            borderColor: colors.glassBorder,
            paddingHorizontal: 16,
            paddingVertical: Platform.OS === 'ios' ? 10 : 6,
            maxHeight: 100,
          }}>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder={ptBR.chat.placeholder}
              placeholderTextColor={colors.textTertiary}
              style={{
                color: colors.text,
                fontSize: 15,
                lineHeight: 20,
              }}
              multiline
              maxLength={1000}
            />
          </View>
          <Pressable
            onPress={sendMessage}
            disabled={!message.trim()}
            style={{
              width: 42, height: 42, borderRadius: 21,
              backgroundColor: message.trim() ? colors.primary : colors.glassOverlay,
              alignItems: 'center', justifyContent: 'center',
              marginBottom: 1,
            }}
          >
            <Ionicons name="send" size={18} color={message.trim() ? '#FFFFFF' : colors.textTertiary} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
