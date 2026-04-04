/**
 * Push Notifications Service
 *
 * Handles Expo push token registration and notification permission request.
 * The token is stored on the server (POST /notifications/push-token) so the
 * API can deliver push messages via Expo's push API.
 *
 * Usage:
 *   Call `registerForPushNotifications(accessToken)` once after login.
 *   It is idempotent — safe to call on every app launch.
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { api } from './api';

// Configure how notifications appear when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  true,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  // Push notifications only work on physical devices
  if (!Device.isDevice) {
    console.log('[Push] Skipping — not a physical device');
    return null;
  }

  // Android requires a notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name:             'default',
      importance:       Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor:       '#DC2626',
    });
  }

  // Check / request permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[Push] Permission not granted');
    return null;
  }

  // Get the Expo push token
  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId: process.env.EXPO_PUBLIC_PROJECT_ID,
  });

  const token = tokenData.data;
  console.log('[Push] Token:', token);

  // Register token with the API
  try {
    await api.post('/notifications/push-token', { token });
    console.log('[Push] Token registered with API');
  } catch (err) {
    console.warn('[Push] Failed to register token with API:', err);
  }

  return token;
}

/**
 * Set the app badge count to the given number.
 * Call with 0 to clear the badge after the user reads all notifications.
 */
export async function setBadgeCount(count: number): Promise<void> {
  await Notifications.setBadgeCountAsync(count);
}
