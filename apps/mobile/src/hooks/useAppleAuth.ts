import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';

export function useAppleAuth() {
  const isSupported = Platform.OS === 'ios';

  const signIn = async (): Promise<{ identityToken: string; fullName?: string } | null> => {
    if (!isSupported) return null;

    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) return null;

      const fullName = [
        credential.fullName?.givenName,
        credential.fullName?.familyName,
      ]
        .filter(Boolean)
        .join(' ') || undefined;

      return { identityToken: credential.identityToken, fullName };
    } catch (err: any) {
      // ERR_REQUEST_CANCELED = user dismissed — not an error
      if (err.code === 'ERR_REQUEST_CANCELED') return null;
      throw err;
    }
  };

  return { signIn, isSupported };
}
