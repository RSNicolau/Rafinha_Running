import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import axios from 'axios';
import { api, API_URL } from './api';

// Web fallback for SecureStore (uses localStorage)
const storage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      return localStorage.getItem(key);
    }
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  async deleteItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  role?: string;
  // LGPD — obrigatórios na API (RegisterDto); use registerConsentPayload() de components/legal/legal
  acceptTerms: true;
  termsVersion: string;
  privacyVersion: string;
  marketingOptIn?: boolean;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    avatarUrl?: string;
  };
}

export const authService = {
  async login(data: LoginRequest): Promise<AuthResponse> {
    const response = await api.post<AuthResponse>('/auth/login', data);
    await this.saveTokens(response.data);
    return response.data;
  },

  async register(data: RegisterRequest): Promise<AuthResponse> {
    const response = await api.post<AuthResponse>('/auth/register', data);
    await this.saveTokens(response.data);
    return response.data;
  },

  async googleLogin(idToken: string): Promise<AuthResponse> {
    const response = await api.post<AuthResponse>('/auth/google', { idToken });
    await this.saveTokens(response.data);
    return response.data;
  },

  async appleLogin(identityToken: string, fullName?: string): Promise<AuthResponse> {
    const response = await api.post<AuthResponse>('/auth/apple', { identityToken, fullName });
    await this.saveTokens(response.data);
    return response.data;
  },

  /**
   * Encerra a sessão no servidor (POST /auth/logout revoga o refresh token desta sessão) e limpa o
   * armazenamento local. Melhor esforço: sem rede/erro da API o logout local acontece mesmo assim.
   * Usa axios "cru" (sem o interceptor de refresh) para não entrar em loop quando chamado após falha de refresh.
   */
  async logout(opts: { allDevices?: boolean } = {}): Promise<void> {
    const refreshToken = await storage.getItem('refreshToken').catch(() => null);
    if (refreshToken) {
      await axios
        .post(`${API_URL}/auth/logout`, { refreshToken, ...(opts.allDevices ? { allDevices: true } : {}) }, { timeout: 5000 })
        .catch(() => undefined);
    }
    await storage.deleteItem('accessToken');
    await storage.deleteItem('refreshToken');
    await storage.deleteItem('user');
  },

  async getStoredUser() {
    const userStr = await storage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  },

  async getAccessToken(): Promise<string | null> {
    return storage.getItem('accessToken');
  },

  async saveTokens(data: AuthResponse): Promise<void> {
    await storage.setItem('accessToken', data.accessToken);
    await storage.setItem('refreshToken', data.refreshToken);
    await storage.setItem('user', JSON.stringify(data.user));
  },
};
