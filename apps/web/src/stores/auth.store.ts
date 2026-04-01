import { create } from 'zustand';
import { api } from '@/lib/api';

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
  logout: () => void;
  loadUser: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post('/auth/login', { email, password });
      localStorage.setItem('rr_access_token', data.accessToken);
      if (data.refreshToken) {
        localStorage.setItem('rr_refresh_token', data.refreshToken);
      }
      localStorage.setItem('rr_user', JSON.stringify(data.user));
      set({ user: data.user, isAuthenticated: true, isLoading: false });
    } catch (err: any) {
      const message = err.response?.data?.message || 'Credenciais inválidas';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  logout: () => {
    localStorage.removeItem('rr_access_token');
    localStorage.removeItem('rr_refresh_token');
    localStorage.removeItem('rr_user');
    set({ user: null, isAuthenticated: false, isLoading: false });
    window.location.href = '/login';
  },

  loadUser: () => {
    try {
      const stored = localStorage.getItem('rr_user');
      const token = localStorage.getItem('rr_access_token');
      if (stored && token) {
        set({ user: JSON.parse(stored), isAuthenticated: true, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
