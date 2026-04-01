import React, { useEffect } from 'react';
import { View, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '../src/stores/auth.store';
import { OfflineIndicator } from '../src/components/ui/OfflineIndicator';

// Load Bebas Neue from Google Fonts on web
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap';
  document.head.appendChild(link);

  // Fix browser autofill blue background on inputs
  const style = document.createElement('style');
  style.textContent = `
    input:-webkit-autofill,
    input:-webkit-autofill:hover,
    input:-webkit-autofill:focus,
    input:-webkit-autofill:active {
      -webkit-box-shadow: 0 0 0px 1000px transparent inset !important;
      box-shadow: 0 0 0px 1000px transparent inset !important;
      -webkit-text-fill-color: inherit !important;
      transition: background-color 9999s ease-in-out 0s !important;
      caret-color: inherit !important;
    }
  `;
  document.head.appendChild(style);
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5 * 60 * 1000,
    },
  },
});

export default function RootLayout() {
  const loadStoredUser = useAuthStore((s) => s.loadStoredUser);

  useEffect(() => {
    loadStoredUser();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="dark" />
      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(athlete)" />
          <Stack.Screen name="(coach)" />
          <Stack.Screen name="(admin)" />
        </Stack>
        <OfflineIndicator />
      </View>
    </QueryClientProvider>
  );
}
