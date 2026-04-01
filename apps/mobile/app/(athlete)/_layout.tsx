import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform, View, Text, Pressable, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme';
import { glass } from '../../src/theme/liquid-glass';
import { ptBR } from '../../src/i18n/pt-BR';

export default function AthleteLayout() {
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
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: 'Eventos',
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="flag-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="ranking"
        options={{
          title: 'Ranking',
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="trophy-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="nutrition"
        options={{
          title: 'Saúde',
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="nutrition-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: ptBR.tabs.chat,
          href: null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubble-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: ptBR.tabs.profile,
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
      {/* Hidden screens */}
      <Tabs.Screen name="calendar" options={{ href: null, title: ptBR.tabs.calendar }} />
      <Tabs.Screen name="performance" options={{ href: null, title: ptBR.tabs.performance }} />
      <Tabs.Screen name="workout/[id]" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="chat/[conversationId]" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="edit-profile" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="settings" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="subscription" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="notifications" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="integrations" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="training-upload" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="live-tracking" options={{ href: null, headerShown: false }} />
    </Tabs>
  );
}
