import { create } from 'zustand';
import { authService, AuthResponse } from '../services/auth.service';
import { setAuthLogout } from '../services/api';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  avatarUrl?: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  googleLogin: (idToken: string) => Promise<void>;
  logout: () => Promise<void>;
  loadStoredUser: () => Promise<void>;
  clearError: () => void;
}

// Will be set after store is created
let _storeLogout: (() => Promise<void>) | null = null;

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authService.login({ email, password });
      set({ user: response.user, isAuthenticated: true, isLoading: false });
    } catch (err: any) {
      const message = err.response?.data?.message || 'E-mail ou senha inválidos';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  register: async (email: string, password: string, name: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authService.register({ email, password, name });
      set({ user: response.user, isAuthenticated: true, isLoading: false });
    } catch (err: any) {
      const message = err.response?.data?.message || 'Erro ao criar conta';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  googleLogin: async (idToken: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authService.googleLogin(idToken);
      set({ user: response.user, isAuthenticated: true, isLoading: false });
    } catch (err: any) {
      const message = err.response?.data?.message || 'Erro ao fazer login com Google';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  logout: async () => {
    await authService.logout();
    set({ user: null, isAuthenticated: false, isLoading: false });
  },

  loadStoredUser: async () => {
    try {
      const user = await authService.getStoredUser();
      const token = await authService.getAccessToken();
      if (user && token) {
        set({ user, isAuthenticated: true, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  clearError: () => set({ error: null }),
}));

// Wire the logout function into the API interceptor so it's called when refresh fails
setAuthLogout(() => useAuthStore.getState().logout());
