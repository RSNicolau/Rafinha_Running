import React, { useEffect, useCallback } from 'react';
import { View, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Sentry from '@sentry/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '../src/stores/auth.store';
import { OfflineIndicator } from '../src/components/ui/OfflineIndicator';

// Keep splash screen visible while we initialise
SplashScreen.preventAutoHideAsync().catch(() => {});

// Sentry — only active when DSN is provided via env
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.EXPO_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.2,
});

// Load Bebas Neue from Google Fonts on web
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap';
  document.head.appendChild(link);

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

function RootLayout() {
  const loadStoredUser = useAuthStore((s) => s.loadStoredUser);
  const [appReady, setAppReady] = React.useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        await loadStoredUser();
      } catch (e) {
        Sentry.captureException(e);
      } finally {
        setAppReady(true);
      }
    }
    prepare();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (appReady) {
      await SplashScreen.hideAsync();
    }
  }, [appReady]);

  if (!appReady) return null;

  return (
    <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(athlete)" />
          <Stack.Screen name="(coach)" />
          <Stack.Screen name="(admin)" />
        </Stack>
        <OfflineIndicator />
      </QueryClientProvider>
    </View>
  );
}

export default Sentry.wrap(RootLayout);
