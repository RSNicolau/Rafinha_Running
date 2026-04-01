import { useEffect, useCallback, useState } from 'react';
import { Platform } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

if (Platform.OS === 'web') {
  WebBrowser.maybeCompleteAuthSession();
}

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '';

export function useGoogleAuth(onSuccess: (idToken: string) => void) {
  const [isReady, setIsReady] = useState(false);

  const discovery = AuthSession.useAutoDiscovery('https://accounts.google.com');

  const redirectUri = AuthSession.makeRedirectUri({
    scheme: 'rr-rafinha-running',
  });

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: GOOGLE_CLIENT_ID,
      scopes: ['openid', 'profile', 'email'],
      responseType: AuthSession.ResponseType.IdToken,
      redirectUri,
    },
    discovery,
  );

  useEffect(() => {
    setIsReady(!!request && !!GOOGLE_CLIENT_ID);
  }, [request]);

  useEffect(() => {
    if (response?.type === 'success') {
      const idToken = response.params?.id_token;
      if (idToken) {
        onSuccess(idToken);
      }
    }
  }, [response]);

  const prompt = useCallback(() => {
    if (isReady) {
      promptAsync();
    }
  }, [isReady, promptAsync]);

  return { prompt, isReady, isConfigured: !!GOOGLE_CLIENT_ID };
}
