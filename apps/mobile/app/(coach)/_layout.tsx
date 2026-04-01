import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme';
import { ptBR } from '../../src/i18n/pt-BR';

export default function CoachLayout() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 56 + Math.max(insets.bottom, 8),
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 6,
          borderTopWidth: 0.5,
          borderTopColor: colors.tabBarBorder,
          backgroundColor: Platform.OS === 'web' ? colors.tabBarBackground : 'transparent',
          elevation: 0,
          shadowOpacity: 0,
          ...(Platform.OS === 'web' ? {
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          } as any : {}),
        },
        tabBarBackground: () =>
          Platform.OS !== 'web' ? (
            <BlurView
              intensity={80}
              tint={isDark ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
          ) : null,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          letterSpacing: 0.1,
        },
        headerStyle: {
          backgroundColor: Platform.OS === 'web' ? colors.headerBackground : 'transparent',
          borderBottomWidth: 0.5,
          borderBottomColor: colors.glassBorder,
          elevation: 0,
          shadowOpacity: 0,
          ...(Platform.OS === 'web' ? {
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          } as any : {}),
        },
        headerBackground: () =>
          Platform.OS !== 'web' ? (
            <BlurView
              intensity={60}
              tint={isDark ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
          ) : null,
        headerTitleStyle: {
          color: colors.text,
          fontWeight: '700',
          fontSize: 17,
          letterSpacing: -0.2,
        },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: ptBR.tabs.home,
          headerTitle: 'Painel do Treinador',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="athletes"
        options={{
          title: ptBR.tabs.athletes,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="plans"
        options={{
          title: ptBR.tabs.plans,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="clipboard-outline" size={size} color={color} />
          ),
          href: null,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: ptBR.tabs.chat,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubble-outline" size={size} color={color} />
          ),
        }}
      />
      {/* Hidden screens */}
      <Tabs.Screen name="athletes/[id]" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="plans/create" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="plans/[id]" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="chat/[conversationId]" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="live-tracking" options={{ href: null, headerShown: false }} />
    </Tabs>
  );
}
