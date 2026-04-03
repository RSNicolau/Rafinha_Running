import axios from 'axios';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Lazy import to avoid circular dependency
let _logoutFn: (() => Promise<void>) | null = null;
export function setAuthLogout(fn: () => Promise<void>) {
  _logoutFn = fn;
}

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

// Web-safe storage helpers
const getItem = async (key: string) =>
  Platform.OS === 'web' ? localStorage.getItem(key) : SecureStore.getItemAsync(key);
const setItem = async (key: string, value: string) =>
  Platform.OS === 'web' ? localStorage.setItem(key, value) : SecureStore.setItemAsync(key, value);
const deleteItem = async (key: string) =>
  Platform.OS === 'web' ? localStorage.removeItem(key) : SecureStore.deleteItemAsync(key);

export const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - attach JWT token
api.interceptors.request.use(
  async (config) => {
    const token = await getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor - handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = await getItem('refreshToken');
        if (!refreshToken) throw new Error('No refresh token');

        const { data } = await axios.post(`${API_URL}/auth/refresh`, {
          refreshToken,
        });

        await setItem('accessToken', data.accessToken);
        await setItem('refreshToken', data.refreshToken);

        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(originalRequest);
      } catch {
        await deleteItem('accessToken');
        await deleteItem('refreshToken');
        // Notify auth store to clear user state and navigate to login
        if (_logoutFn) await _logoutFn().catch(() => {});
      }
    }

    return Promise.reject(error);
  },
);

export default api;
